// =============================================================
// Rede: conexão Socket.io, buffer de snapshots, relógio do servidor
// e interpolação das outras entidades.
// =============================================================

import { io } from '/socket.io/socket.io.esm.min.js';
import { CONFIG } from '/shared/config.js';

export class Rede {
  constructor() {
    this.socket = null;
    this.snapshots = [];      // [{ t, jogadores: Map(id -> {x, y, a}) }]
    this.offset = null;       // tempoServidor ≈ performance.now() + offset
    this.infos = new Map();   // id -> { nome, cor, bot }
    this.ping = 0;
    this.online = 0;
    this.aoSnapshot = null;   // callback(snapshot) — reconciliação do jogador local
    this.aoDesconectar = null;
  }

  conectar() {
    return new Promise((resolve, reject) => {
      // Sem reconexão automática: ao cair, o jogador volta pra tela inicial
      // e começa do zero (não tem conta).
      this.socket = io({ reconnection: false, transports: ['websocket', 'polling'] });
      const falhou = (err) => reject(err || new Error('falha na conexão'));
      this.socket.once('connect', () => {
        this.socket.off('connect_error', falhou);
        resolve();
      });
      this.socket.once('connect_error', falhou);
      this.registrarEventos();
    });
  }

  registrarEventos() {
    const s = this.socket;
    s.on('s', (snap) => this.receberSnapshot(snap));
    s.on('entrou', (info) => this.infos.set(info.id, info));
    s.on('saiu', (id) => this.infos.delete(id));
    s.on('disconnect', (motivo) => this.aoDesconectar?.(motivo));
  }

  // Entra no jogo e espera o 'init' com o mapa
  entrar(nome, cor, visao) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('o servidor não respondeu')), 8000);
      this.socket.once('cheio', () => {
        clearTimeout(timer);
        reject(new Error('Servidor lotado! Tenta de novo daqui a pouco.'));
      });
      this.socket.once('init', (dados) => {
        clearTimeout(timer);
        for (const info of dados.jogadores) this.infos.set(info.id, info);
        this.offset = dados.tempo - performance.now();
        this.iniciarPing();
        resolve(dados);
      });
      this.socket.emit('entrar', { nome, cor, visao });
    });
  }

  iniciarPing() {
    const medir = () => {
      const t0 = performance.now();
      this.socket.timeout(5000).emit('ping-jogo', (err) => {
        if (!err) this.ping = Math.round(performance.now() - t0);
      });
    };
    medir();
    this.timerPing = setInterval(medir, 2000);
  }

  enviarInput(input) {
    this.socket?.emit('i', input);
  }

  enviarVisao(visao) {
    this.socket?.emit('visao', visao);
  }

  // ---------------- relógio ----------------

  tempoServidor() {
    return performance.now() + (this.offset ?? 0);
  }

  // Ajusta o offset do relógio aos poucos. Snapshots que chegam "cedo"
  // (latência menor) puxam o relógio mais rápido que os atrasados.
  ajustarRelogio(tServidor) {
    const amostra = tServidor - performance.now();
    if (this.offset === null) this.offset = amostra;
    else this.offset += (amostra - this.offset) * (amostra > this.offset ? 0.2 : 0.02);
  }

  // ---------------- snapshots ----------------

  receberSnapshot(snap) {
    this.ajustarRelogio(snap.t);
    this.online = snap.n;
    const jogadores = new Map();
    for (const [id, x, y, a] of snap.p) jogadores.set(id, { x, y, a: a / 100 });
    this.snapshots.push({ t: snap.t, jogadores });
    if (this.snapshots.length > CONFIG.rede.bufferSnapshots) this.snapshots.shift();
    this.aoSnapshot?.(snap);
  }

  // Posições interpoladas dos outros jogadores no "tempo de renderização"
  // (um pouco no passado, pra sempre ter dois snapshots entre os quais
  // interpolar). Retorna Map(id -> {x, y, a}).
  amostrarJogadores() {
    const snaps = this.snapshots;
    const res = new Map();
    if (!snaps.length) return res;
    const rt = this.tempoServidor() - CONFIG.rede.atrasoInterpolacao;

    // descarta snapshots velhos, mas mantém um anterior ao tempo de render
    while (snaps.length > 2 && snaps[1].t <= rt) snaps.shift();

    let a = snaps[0];
    let b = snaps[1];
    if (!b) {
      for (const [id, e] of a.jogadores) res.set(id, { ...e });
      return res;
    }
    let f;
    if (rt <= a.t) {
      f = 0;
    } else if (rt <= b.t) {
      f = (rt - a.t) / (b.t - a.t || 1);
    } else {
      // passou do último snapshot: extrapola um pouco, com limite
      const extra = Math.min(rt - b.t, CONFIG.rede.extrapolacaoMax);
      f = 1 + extra / (b.t - a.t || 1);
    }
    for (const [id, eb] of b.jogadores) {
      const ea = a.jogadores.get(id);
      if (!ea) {
        res.set(id, { ...eb });
        continue;
      }
      res.set(id, {
        x: ea.x + (eb.x - ea.x) * f,
        y: ea.y + (eb.y - ea.y) * f,
        a: lerpAngulo(ea.a, eb.a, Math.min(f, 1)),
      });
    }
    return res;
  }
}

export function lerpAngulo(a, b, f) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}
