// =============================================================
// Jogador (camelô) do lado do servidor.
// O cliente só manda inputs; tudo aqui é a "verdade" do jogo.
// =============================================================

import { CONFIG } from '../../shared/config.js';

export class Jogador {
  constructor(id, socket, nome, cor, x, y) {
    this.id = id;
    this.socket = socket;
    this.nome = nome;
    this.cor = cor;
    this.x = x;
    this.y = y;
    this.angulo = 0;
    this.bot = false;

    // controle de inputs (predição + anti-trapaça)
    this.ultimoSeq = 0;
    this.balde = CONFIG.rede.inputsBalde;
    this.ultimoBalde = Date.now();

    // área visível do cliente (meia largura/altura em unidades do mundo)
    this.visao = { mw: 800, mh: 450 };
  }

  // Token bucket: limita quantos passos de movimento por segundo o
  // cliente consegue mandar (evita speedhack mandando inputs demais).
  consumirBalde() {
    const agora = Date.now();
    const taxa = CONFIG.servidor.tickRate * CONFIG.rede.inputsToleranciaTaxa;
    this.balde = Math.min(CONFIG.rede.inputsBalde, this.balde + ((agora - this.ultimoBalde) / 1000) * taxa);
    this.ultimoBalde = agora;
    if (this.balde < 1) return false;
    this.balde -= 1;
    return true;
  }

  definirVisao(mw, mh) {
    if (!Number.isFinite(mw) || !Number.isFinite(mh)) return;
    this.visao.mw = Math.max(100, Math.min(CONFIG.rede.visaoMaxMeiaLargura, mw));
    this.visao.mh = Math.max(100, Math.min(CONFIG.rede.visaoMaxMeiaAltura, mh));
  }

  // Informação "estática" (não muda a cada snapshot)
  info() {
    return { id: this.id, nome: this.nome, cor: this.cor, bot: this.bot };
  }
}
