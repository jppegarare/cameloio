// =============================================================
// Jogador (camelô) do lado do servidor.
// O cliente só manda inputs; tudo aqui é a "verdade" do jogo.
// =============================================================

import { CONFIG } from '../../shared/config.js';
import { carrinhoVazio, centavos, totalCarrinho, resumoCarga } from '../../shared/economia.js';

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

    // economia (dinheiro em centavos)
    this.dinheiro = centavos(CONFIG.economia.dinheiroInicial);
    this.carrinho = carrinhoVazio();
    this.capacidade = CONFIG.economia.capacidadeInicial;
    this.vendas = 0;
    this.timerFalido = 0;
    this.posicaoRanking = 0;

    // controle de inputs (predição + anti-trapaça)
    this.ultimoSeq = 0;
    this.balde = CONFIG.rede.inputsBalde;
    this.ultimoBalde = Date.now();
    this.ultimaCompra = 0;

    // área visível do cliente (meia largura/altura em unidades do mundo)
    this.visao = { mw: 800, mh: 450 };
  }

  get totalItens() {
    return totalCarrinho(this.carrinho);
  }

  get espacoLivre() {
    return this.capacidade - this.totalItens;
  }

  // Resumo do carrinho pro desenho (cache: só recalcula se mudou)
  carga() {
    const chave = this.carrinho.join(',') + '/' + this.capacidade;
    if (chave !== this._chaveCarga) {
      this._chaveCarga = chave;
      this._carga = resumoCarga(this.carrinho, this.capacidade);
    }
    return this._carga;
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

  // O ponto (x, y) está na tela deste jogador (com margem)?
  enxerga(x, y, margem = CONFIG.rede.margemCulling) {
    return Math.abs(x - this.x) <= this.visao.mw + margem && Math.abs(y - this.y) <= this.visao.mh + margem;
  }

  // Manda um evento só pra este jogador (bots não têm socket)
  enviar(evento, dados) {
    this.socket?.emit(evento, dados);
  }

  // Informação "estática" (não muda a cada snapshot)
  info() {
    return { id: this.id, nome: this.nome, cor: this.cor, bot: this.bot };
  }
}
