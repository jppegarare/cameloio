// =============================================================
// Estado do mundo e loop do jogo (servidor autoritativo).
// - Simulação a CONFIG.servidor.tickRate Hz
// - Snapshots a CONFIG.servidor.snapshotRate Hz, com culling por jogador
// - Movimento: cada input do cliente é um passo fixo de 1/tickRate,
//   aplicado assim que chega (com limite de taxa). O snapshot devolve o
//   último seq processado pra o cliente reconciliar a predição.
// =============================================================

import { CONFIG } from '../shared/config.js';
import { criarGradeColisao, passoMovimento } from '../shared/physics.js';
import { gerarMapa, pontoAleatorioRua } from './map.js';
import { Jogador } from './entities/player.js';

const DT = 1 / CONFIG.servidor.tickRate;

export class Jogo {
  constructor(io) {
    this.io = io;
    this.mapa = gerarMapa(CONFIG.mapa.semente);
    this.grade = criarGradeColisao(this.mapa.predios, this.mapa.largura, this.mapa.altura);
    this.jogadores = new Map(); // id -> Jogador
    this.proximoId = 1;
    this.inicio = Date.now();
    this.ticks = 0;
  }

  // Tempo do servidor em ms (usado pelo cliente pra interpolar)
  agora() {
    return Date.now() - this.inicio;
  }

  iniciar() {
    this.timerTick = setInterval(() => this.tick(), 1000 / CONFIG.servidor.tickRate);
    this.timerSnap = setInterval(() => this.enviarSnapshots(), 1000 / CONFIG.servidor.snapshotRate);
    console.log(`[jogo] mapa ${this.mapa.largura}x${this.mapa.altura}, semente ${this.mapa.semente}`);
  }

  parar() {
    clearInterval(this.timerTick);
    clearInterval(this.timerSnap);
  }

  // ---------------- conexões ----------------

  entrar(socket, dados) {
    if (this.jogadores.size >= CONFIG.servidor.maxJogadores) {
      socket.emit('cheio');
      return null;
    }
    const nome = limparNome(dados?.nome);
    const cor = CONFIG.jogador.cores.includes(dados?.cor) ? dados.cor : CONFIG.jogador.cores[0];
    const p = this.pontoNascimento();
    const j = new Jogador(this.proximoId++, socket, nome, cor, p.x, p.y);
    j.angulo = Math.random() * Math.PI * 2;
    j.definirVisao(dados?.visao?.mw, dados?.visao?.mh);
    this.jogadores.set(j.id, j);

    socket.emit('init', {
      id: j.id,
      mapa: this.mapa,
      tempo: this.agora(),
      jogadores: [...this.jogadores.values()].map((o) => o.info()),
      eu: { x: j.x, y: j.y, angulo: j.angulo },
    });
    socket.broadcast.emit('entrou', j.info());
    console.log(`[jogo] ${j.nome} (#${j.id}) entrou — ${this.jogadores.size} online`);
    return j;
  }

  // Onde o camelô nasce. CAMELO_SPAWN="x,y" fixa o ponto (só pra testes).
  pontoNascimento() {
    const fixo = process.env.CAMELO_SPAWN?.split(',').map(Number);
    if (fixo?.length === 2 && fixo.every(Number.isFinite)) {
      return { x: fixo[0] + (Math.random() - 0.5) * 40, y: fixo[1] };
    }
    return pontoAleatorioRua(this.mapa);
  }

  sair(j) {
    if (!this.jogadores.has(j.id)) return;
    this.jogadores.delete(j.id);
    this.io.emit('saiu', j.id);
    console.log(`[jogo] ${j.nome} (#${j.id}) saiu — ${this.jogadores.size} online`);
  }

  // input = [seq, dx, dy]
  input(j, input) {
    if (!Array.isArray(input) || input.length < 3) return;
    const [seq, dx, dy] = input;
    if (!Number.isInteger(seq) || seq <= j.ultimoSeq) return;
    j.ultimoSeq = seq;
    if (!j.consumirBalde()) return; // mandando rápido demais: descarta o passo
    passoMovimento(j, Number(dx), Number(dy), DT, this.grade);
  }

  // ---------------- simulação ----------------

  tick() {
    this.ticks++;
    // Fase 1: o movimento já é aplicado quando o input chega.
    // NPCs, rapa, eventos etc. entram aqui nas próximas fases.
  }

  // ---------------- snapshots ----------------

  enviarSnapshots() {
    const t = this.agora();
    const margem = CONFIG.rede.margemCulling;
    const todos = [...this.jogadores.values()];
    for (const j of this.jogadores.values()) {
      if (!j.socket) continue;
      const mw = j.visao.mw + margem;
      const mh = j.visao.mh + margem;
      const visiveis = [];
      for (const o of todos) {
        if (o === j) continue;
        if (Math.abs(o.x - j.x) > mw || Math.abs(o.y - j.y) > mh) continue;
        visiveis.push([o.id, Math.round(o.x), Math.round(o.y), Math.round(o.angulo * 100)]);
      }
      j.socket.emit('s', {
        t,
        a: j.ultimoSeq, // último input processado (reconciliação)
        eu: [Math.round(j.x * 100) / 100, Math.round(j.y * 100) / 100, Math.round(j.angulo * 100)],
        p: visiveis,
        n: this.jogadores.size,
      });
    }
  }
}

// Limpa o nome: tira caracteres de controle, espaços extras e limita o tamanho
function limparNome(nome) {
  let s = typeof nome === 'string' ? nome : '';
  s = s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, CONFIG.jogador.nomeMax);
  if (!s) {
    const lista = CONFIG.jogador.nomesAleatorios;
    s = lista[Math.floor(Math.random() * lista.length)];
  }
  return s;
}
