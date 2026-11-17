// =============================================================
// Estado do mundo e loop do jogo (servidor autoritativo).
// - Simulação a CONFIG.servidor.tickRate Hz
// - Snapshots a CONFIG.servidor.snapshotRate Hz, com culling por jogador
// - Movimento: cada input do cliente é um passo fixo de 1/tickRate,
//   aplicado assim que chega (com limite de taxa). O snapshot devolve o
//   último seq processado pra o cliente reconciliar a predição.
// =============================================================

import { CONFIG } from '../shared/config.js';
import { criarGradeColisao, passoMovimento, dentroRet } from '../shared/physics.js';
import { ITENS, centavos, itemDisponivel, formatarDinheiro } from '../shared/economia.js';
import { gerarMapa, gerarGrafoCalcadas, pontoAleatorioRua } from './map.js';
import { Jogador } from './entities/player.js';
import { Cliente, PASSEANDO, INDO } from './entities/client.js';

const DT = 1 / CONFIG.servidor.tickRate;
const CC = CONFIG.clientes;
const aleatorio = (a, b) => a + Math.random() * (b - a);

export class Jogo {
  constructor(io) {
    this.io = io;
    this.mapa = gerarMapa(Number(process.env.CAMELO_SEMENTE) || CONFIG.mapa.semente);
    this.grade = criarGradeColisao(this.mapa.predios, this.mapa.largura, this.mapa.altura);
    this.grafo = gerarGrafoCalcadas(this.mapa);
    this.jogadores = new Map(); // id -> Jogador
    this.clientes = new Map();  // id -> Cliente
    this.proximoId = 1;
    this.proximoIdCliente = 1;
    this.inicio = Date.now();
    this.ticks = 0;
    this.eventoAtivo = null;    // fase 5: 'chuva', 'calor', 'jogoDoBrasil', 'operacaoRapa'

    this.acumNascimento = 0;
    this.timerIA = 0;
    this.timerPico = aleatorio(CC.picoIntervaloMin, CC.picoIntervaloMax);
    this.timerSegundo = 0;
  }

  // Tempo do servidor em ms (usado pelo cliente pra interpolar)
  agora() {
    return Date.now() - this.inicio;
  }

  iniciar() {
    this.timerTick = setInterval(() => this.tick(), 1000 / CONFIG.servidor.tickRate);
    this.timerSnap = setInterval(() => this.enviarSnapshots(), 1000 / CONFIG.servidor.snapshotRate);
    this.timerRank = setInterval(() => this.enviarRanking(), CONFIG.ranking.intervalo);
    // já começa com a cidade movimentada
    for (let k = 0; k < CC.minimo; k++) this.nascerCliente();
    console.log(`[jogo] mapa ${this.mapa.largura}x${this.mapa.altura}, semente ${this.mapa.semente}`);
  }

  parar() {
    clearInterval(this.timerTick);
    clearInterval(this.timerSnap);
    clearInterval(this.timerRank);
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
      evento: this.eventoAtivo,
      jogadores: [...this.jogadores.values()].map((o) => o.info()),
      eu: { x: j.x, y: j.y, angulo: j.angulo },
    });
    socket.broadcast.emit('entrou', j.info());
    console.log(`[jogo] ${j.nome} (#${j.id}) entrou — ${this.jogadores.size} online`);
    this.enviarRanking();
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
    this.enviarRanking();
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

  // ---------------- economia ----------------

  // Depósito em que o jogador está (ou null)
  depositoDe(j) {
    const tol = CONFIG.economia.toleranciaDeposito;
    for (const d of this.mapa.depositos) {
      const z = d.zona;
      if (dentroRet(j.x, j.y, { x: z.x - tol, y: z.y - tol, w: z.w + 2 * tol, h: z.h + 2 * tol })) return d;
    }
    return null;
  }

  naFeirinha(x, y) {
    return this.mapa.feirinhas.some((f) => dentroRet(x, y, f.zona));
  }

  // pedido = { i: índice do item, q: quantidade }
  comprar(j, pedido) {
    const agora = Date.now();
    if (agora - j.ultimaCompra < 50) return; // anti-flood
    j.ultimaCompra = agora;

    const i = pedido?.i;
    const item = ITENS[i];
    if (!Number.isInteger(i) || !item) return;
    let q = Math.floor(Number(pedido.q));
    if (!Number.isFinite(q) || q < 1) return;
    q = Math.min(q, CONFIG.economia.compraMaxPorPedido);

    if (!this.depositoDe(j)) return j.enviar('erro', 'Vai até um depósito pra comprar!');
    if (!itemDisponivel(item, this.eventoAtivo)) return j.enviar('erro', `${item.nome} esgotou!`);
    const custo = centavos(item.custo);
    q = Math.min(q, j.espacoLivre, Math.floor(j.dinheiro / custo));
    if (j.espacoLivre <= 0) return j.enviar('erro', 'Carrinho lotado!');
    if (q <= 0) return j.enviar('erro', 'Tá sem grana pra isso, chefia!');

    j.dinheiro -= custo * q;
    j.carrinho[i] += q;
    j.enviar('compra', { i, q, gasto: custo * q });
  }

  // O jogador tem o item e pode vender? (fase 3: banca fechada não vende)
  podeAtender(j, itemIdx) {
    return itemIdx >= 0 && j.carrinho[itemIdx] > 0;
  }

  // Raio em que o jogador atrai clientes (fase 5: caixa de som aumenta)
  raioAtracao(_j) {
    return CC.raioAtracao;
  }

  // Preço que o cliente paga (centavos), com os modificadores
  precoVenda(itemIdx, j) {
    let preco = ITENS[itemIdx].venda;
    if (this.naFeirinha(j.x, j.y)) preco *= 1 - CONFIG.economia.descontoFeirinha;
    return centavos(preco);
  }

  realizarVenda(cliente, j) {
    const i = cliente.desejo;
    if (!this.podeAtender(j, i)) {
      cliente.voltarAPassear(this);
      return;
    }
    const valor = this.precoVenda(i, j);
    j.carrinho[i]--;
    j.dinheiro += valor;
    j.vendas++;
    cliente.irEmbora(true);
    // efeito "+R$12" pra quem estiver vendo
    this.efeito({ t: 'venda', x: Math.round(j.x), y: Math.round(j.y), v: valor, id: j.id, i });
  }

  // Manda um efeito visual pros jogadores que enxergam aquele ponto
  efeito(fx) {
    for (const o of this.jogadores.values()) if (o.enxerga(fx.x, fx.y)) o.enviar('fx', fx);
  }

  // Falido (sem dinheiro pro item mais barato e carrinho vazio): PIX da tia
  verificarFalidos(dt) {
    const maisBarato = Math.min(...ITENS.filter((it) => itemDisponivel(it, this.eventoAtivo)).map((it) => centavos(it.custo)));
    for (const j of this.jogadores.values()) {
      if (j.totalItens === 0 && j.dinheiro < maisBarato) {
        j.timerFalido += dt;
        if (j.timerFalido >= CONFIG.economia.auxilioEspera) {
          j.timerFalido = 0;
          const v = centavos(CONFIG.economia.auxilioValor);
          j.dinheiro += v;
          j.enviar('aviso', { texto: `Tua tia mandou um PIX de ${formatarDinheiro(v)}! 💸`, tipo: 'bom', som: 'pix' });
        }
      } else {
        j.timerFalido = 0;
      }
    }
  }

  // ---------------- clientes (NPCs) ----------------

  quantidadeAlvoClientes() {
    const camelos = this.jogadores.size;
    return Math.min(CC.maximo, CC.minimo + CC.porCamelo * camelos);
  }

  sortearDesejo(chance = CC.chanceDesejo) {
    if (Math.random() >= chance) return -1;
    const disponiveis = ITENS.map((it, i) => ({ it, i })).filter(({ it }) => itemDisponivel(it, this.eventoAtivo));
    const total = disponiveis.reduce((s, d) => s + d.it.procura, 0);
    let r = Math.random() * total;
    for (const d of disponiveis) {
      r -= d.it.procura;
      if (r <= 0) return d.i;
    }
    return disponiveis[disponiveis.length - 1].i;
  }

  // Alguém está vendo este ponto? (pra cliente não "brotar" na cara do jogador)
  alguemVe(x, y) {
    for (const j of this.jogadores.values()) if (j.enxerga(x, y, 40)) return true;
    return false;
  }

  nascerCliente(onde) {
    const id = this.proximoIdCliente++;
    if (!onde) {
      const r = Math.random() * (CC.pesoNascerCalcada + CC.pesoNascerPraca + CC.pesoNascerTerminal);
      if (r < CC.pesoNascerCalcada) onde = 'calcada';
      else if (r < CC.pesoNascerCalcada + CC.pesoNascerPraca) onde = 'praca';
      else onde = 'terminal';
    }
    let c;
    if (onde === 'praca' && this.mapa.pracas.length) {
      const p = this.mapa.pracas[Math.floor(Math.random() * this.mapa.pracas.length)];
      const pt = pontoEmRet(p.zona);
      c = new Cliente(id, pt.x, pt.y, this.sortearDesejo(), { modo: 'zona', zona: p.zona });
    } else if (onde === 'terminal' && this.mapa.terminais.length) {
      const t = this.mapa.terminais[Math.floor(Math.random() * this.mapa.terminais.length)];
      const pt = pontoEmRet(t.zona);
      c = new Cliente(id, pt.x, pt.y, this.sortearDesejo(), { modo: 'zona', zona: t.zona });
    } else {
      // calçada, de preferência fora da vista dos jogadores
      let no;
      for (let tent = 0; tent < 8; tent++) {
        no = this.grafo[Math.floor(Math.random() * this.grafo.length)];
        if (!this.alguemVe(no.x, no.y)) break;
      }
      c = new Cliente(id, no.x, no.y, this.sortearDesejo(), { modo: 'grafo', no: no.id });
    }
    this.clientes.set(id, c);
    return c;
  }

  // Chegou ônibus no terminal: um monte de cliente de uma vez
  picoTerminal() {
    if (!this.mapa.terminais.length) return;
    const t = this.mapa.terminais[0];
    for (let k = 0; k < CC.picoQuantidade; k++) {
      const pt = pontoEmRet(t.zona);
      const c = new Cliente(this.proximoIdCliente++, pt.x, pt.y, this.sortearDesejo(CC.picoChanceDesejo), { modo: 'zona', zona: t.zona });
      this.clientes.set(c.id, c);
    }
    this.io.emit('aviso', { texto: '🚌 Chegou ônibus no terminal! Freguesia na área!', tipo: 'info', som: 'buzina' });
  }

  noMaisProximo(x, y) {
    let melhor = this.grafo[0];
    let md = Infinity;
    for (const n of this.grafo) {
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < md) {
        md = d;
        melhor = n;
      }
    }
    return melhor;
  }

  // Clientes com desejo procuram um camelô próximo que tenha o item
  procurarCamelos() {
    const jogadores = [...this.jogadores.values()];
    for (const c of this.clientes.values()) {
      if (c.estado !== PASSEANDO || c.desejo < 0) continue;
      let melhor = null;
      let md = Infinity;
      for (const j of jogadores) {
        if (!this.podeAtender(j, c.desejo)) continue;
        const r = this.raioAtracao(j);
        const d = (j.x - c.x) ** 2 + (j.y - c.y) ** 2;
        if (d < r * r && d < md) {
          md = d;
          melhor = j;
        }
      }
      if (melhor) {
        c.estado = INDO;
        c.alvoId = melhor.id;
        c.timerVenda = 0;
      }
    }
  }

  atualizarClientes(dt) {
    // repovoa aos poucos
    const alvo = this.quantidadeAlvoClientes();
    if (this.clientes.size < alvo) {
      this.acumNascimento += dt * CC.nascimentosPorSegundo;
      while (this.acumNascimento >= 1 && this.clientes.size < alvo) {
        this.nascerCliente();
        this.acumNascimento -= 1;
      }
    } else {
      this.acumNascimento = 0;
    }

    this.timerPico -= dt;
    if (this.timerPico <= 0) {
      this.timerPico = aleatorio(CC.picoIntervaloMin, CC.picoIntervaloMax);
      this.picoTerminal();
    }

    this.timerIA -= dt;
    if (this.timerIA <= 0) {
      this.timerIA = CC.intervaloIA;
      this.procurarCamelos();
    }

    for (const c of this.clientes.values()) {
      c.atualizar(dt, this);
      if (c.remover) this.clientes.delete(c.id);
    }
  }

  // ---------------- simulação ----------------

  tick() {
    this.ticks++;
    // movimento dos jogadores já é aplicado quando o input chega
    this.atualizarClientes(DT);
    this.timerSegundo += DT;
    if (this.timerSegundo >= 1) {
      this.verificarFalidos(this.timerSegundo);
      this.timerSegundo = 0;
    }
  }

  // ---------------- snapshots ----------------

  enviarSnapshots() {
    const t = this.agora();
    const margem = CONFIG.rede.margemCulling;
    const todos = [...this.jogadores.values()];
    const clientes = [...this.clientes.values()];
    for (const j of this.jogadores.values()) {
      if (!j.socket) continue;
      const mw = j.visao.mw + margem;
      const mh = j.visao.mh + margem;
      const p = [];
      for (const o of todos) {
        if (o === j) continue;
        if (Math.abs(o.x - j.x) > mw || Math.abs(o.y - j.y) > mh) continue;
        p.push([o.id, Math.round(o.x), Math.round(o.y), Math.round(o.angulo * 100), o.carga()]);
      }
      const c = [];
      for (const cl of clientes) {
        if (Math.abs(cl.x - j.x) > mw || Math.abs(cl.y - j.y) > mh) continue;
        c.push([cl.id, Math.round(cl.x), Math.round(cl.y), cl.desejo, cl.estadoRede(), cl.progressoRede(), cl.alvoId]);
      }
      j.socket.emit('s', {
        t,
        a: j.ultimoSeq, // último input processado (reconciliação)
        eu: {
          x: Math.round(j.x * 100) / 100,
          y: Math.round(j.y * 100) / 100,
          a: Math.round(j.angulo * 100),
          d: j.dinheiro,
          c: j.carrinho,
          cap: j.capacidade,
          rk: j.posicaoRanking,
        },
        p,
        c,
        n: this.jogadores.size,
      });
    }
  }

  // Ranking: top N pra todo mundo + posição de cada um no próprio snapshot
  enviarRanking() {
    const ordem = [...this.jogadores.values()].sort((a, b) => b.dinheiro - a.dinheiro || a.id - b.id);
    ordem.forEach((j, k) => (j.posicaoRanking = k + 1));
    this.io.emit('rank', {
      top: ordem.slice(0, CONFIG.ranking.tamanho).map((j) => [j.id, j.dinheiro]),
      total: ordem.length,
    });
  }
}

function pontoEmRet(z, m = 16) {
  return { x: z.x + m + Math.random() * (z.w - 2 * m), y: z.y + m + Math.random() * (z.h - 2 * m) };
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
