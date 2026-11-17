// =============================================================
// Camelô.io — ponto de entrada do cliente.
// Tela inicial, conexão e o loop principal (predição + desenho).
// =============================================================

import { CONFIG } from '/shared/config.js';
import { criarGradeColisao, passoMovimento, dentroRet } from '/shared/physics.js';
import { ITENS, carrinhoVazio, centavos, formatarDinheiro, resumoCarga } from '/shared/economia.js';
import { Rede } from './net.js';
import { Renderizador } from './render.js';
import { Hud } from './hud.js';
import { Entrada } from './input.js';
import { Som } from './audio.js';

const DT = 1 / CONFIG.servidor.tickRate;

const canvas = document.getElementById('jogo');
const render = new Renderizador(canvas);
const hud = new Hud();
const entrada = new Entrada();
const rede = new Rede();
const som = new Som();

// Estado do jogador local (posição predita no cliente; economia vem do servidor)
const local = {
  id: 0,
  nome: '',
  cor: CONFIG.jogador.cores[0],
  x: 0, y: 0, angulo: 0,
  antX: 0, antY: 0,          // posição no passo anterior (interpolação entre passos)
  erroX: 0, erroY: 0,        // erro de predição sendo suavizado
  seq: 0,
  pendentes: [],             // inputs ainda não confirmados pelo servidor
  fase: 0, andando: false,   // animação
  dinheiro: centavos(CONFIG.economia.dinheiroInicial),
  carrinho: carrinhoVazio(),
  capacidade: CONFIG.economia.capacidadeInicial,
  posicaoRanking: 0,
  carga: '',
};

let mapa = null;
let grade = null;
let jogando = false;
let evento = null;
let acumulador = 0;
let ultimoQuadro = performance.now();
let ultimoRank = null;
const animOutros = new Map();   // id -> { x, y, fase, andando }
const animClientes = new Map(); // id -> { x, y, angulo, fase, andando, nasceu }

// =============================================================
// Tela inicial
// =============================================================

const telaInicial = document.getElementById('tela-inicial');
const telaDesc = document.getElementById('tela-desconectado');
const inputNome = document.getElementById('nome');
const divCores = document.getElementById('cores');
const btnJogar = document.getElementById('btn-jogar');
const status = document.getElementById('status-conexao');
const btnSom = document.getElementById('btn-som');

let corEscolhida = lerPreferencia('camelo.cor', CONFIG.jogador.cores[0]);
if (!CONFIG.jogador.cores.includes(corEscolhida)) corEscolhida = CONFIG.jogador.cores[0];
inputNome.value = lerPreferencia('camelo.nome', '');
inputNome.maxLength = CONFIG.jogador.nomeMax;

for (const cor of CONFIG.jogador.cores) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cor' + (cor === corEscolhida ? ' ativa' : '');
  b.style.background = cor;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-label', 'Lona ' + cor);
  b.addEventListener('click', () => {
    corEscolhida = cor;
    for (const o of divCores.children) o.classList.toggle('ativa', o === b);
  });
  divCores.appendChild(b);
}

btnJogar.addEventListener('click', comecar);
inputNome.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') comecar();
});
document.getElementById('btn-voltar').addEventListener('click', () => location.reload());

btnSom.textContent = som.mudo ? '🔇' : '🔊';
btnSom.addEventListener('click', () => {
  som.iniciar();
  btnSom.textContent = som.alternarMudo() ? '🔇' : '🔊';
  btnSom.blur();
});

async function comecar() {
  if (btnJogar.disabled) return;
  btnJogar.disabled = true;
  status.textContent = '';
  som.iniciar(); // precisa ser num clique
  const nome = inputNome.value.trim();
  salvarPreferencia('camelo.nome', nome);
  salvarPreferencia('camelo.cor', corEscolhida);
  try {
    btnJogar.textContent = 'Montando a banca...';
    await rede.conectar();
    registrarEventosJogo();
    const init = await rede.entrar(nome, corEscolhida, render.visao());
    iniciarPartida(init);
  } catch (err) {
    console.warn('[camelo] falha ao entrar:', err);
    status.textContent = err?.message?.startsWith('Servidor') ? err.message : 'Não deu pra conectar no servidor. Tenta de novo!';
    btnJogar.disabled = false;
    btnJogar.textContent = 'Bora vender!';
    rede.socket?.disconnect();
  }
}

function iniciarPartida(init) {
  const info = rede.infos.get(init.id);
  local.id = init.id;
  local.nome = info?.nome ?? 'Camelô';
  local.cor = info?.cor ?? corEscolhida;
  local.x = local.antX = init.eu.x;
  local.y = local.antY = init.eu.y;
  local.angulo = init.eu.angulo;
  evento = init.evento;

  mapa = init.mapa;
  grade = criarGradeColisao(mapa.predios, mapa.largura, mapa.altura);
  render.definirMapa(mapa);
  hud.prepararMinimapa(mapa);
  hud.atualizarEconomia(local);

  rede.aoSnapshot = reconciliar;
  rede.aoDesconectar = desconectado;

  telaInicial.classList.add('oculto');
  hud.mostrar();
  entrada.ativo = true;
  jogando = true;
  hud.aviso('Passa num depósito ($) pra encher o carrinho!', 'info', 5000);
}

function desconectado(motivo) {
  jogando = false;
  entrada.ativo = false;
  hud.esconder();
  const msg = document.getElementById('motivo-desconexao');
  if (motivo === 'io server disconnect') msg.textContent = 'O servidor te desconectou.';
  telaDesc.classList.remove('oculto');
}

// =============================================================
// Eventos do jogo vindos do servidor
// =============================================================

function registrarEventosJogo() {
  const s = rede.socket;

  s.on('rank', (rank) => {
    ultimoRank = rank;
    atualizarRanking();
  });

  // efeitos visuais (vendas perto de você)
  s.on('fx', (fx) => {
    if (fx.t === 'venda') {
      const meu = fx.id === local.id;
      const x = meu ? local.x : fx.x;
      const y = meu ? local.y : fx.y;
      render.adicionarTexto(x, y, '+' + formatarDinheiro(fx.v), {
        cor: meu ? '#7CFC00' : '#ffffff',
        tamanho: meu ? 26 : 16,
      });
      if (meu) som.chaChing();
    }
  });

  s.on('compra', ({ i, q }) => {
    som.compra();
    render.adicionarTexto(local.x, local.y, `+${q} ${ITENS[i].nome}`, { cor: '#ffd23f', tamanho: 15, duracao: 1000 });
  });

  s.on('erro', (texto) => {
    som.erro();
    hud.aviso(texto, 'erro', 2200);
  });

  s.on('aviso', (a) => {
    hud.aviso(a.texto, a.tipo);
    if (a.som === 'pix') som.pix();
    if (a.som === 'buzina') som.buzina();
  });

  // trocar de nome/sair muda o ranking
  s.on('entrou', atualizarRanking);
  s.on('saiu', atualizarRanking);
}

function atualizarRanking() {
  if (!ultimoRank) return;
  hud.atualizarRanking(ultimoRank, local.id, local.posicaoRanking, local.dinheiro, rede.infos);
}

// =============================================================
// Depósito: menu aparece quando o camelô está na zona amarela
// =============================================================

function noDeposito() {
  if (!mapa) return false;
  const tol = CONFIG.economia.toleranciaDeposito;
  return mapa.depositos.some(({ zona: z }) => dentroRet(local.x, local.y, { x: z.x - tol, y: z.y - tol, w: z.w + 2 * tol, h: z.h + 2 * tol }));
}

function comprar(i, q) {
  if (!jogando || !hud.menuAberto) return;
  rede.socket.emit('comprar', { i, q });
}

hud.aoComprar = comprar;
entrada.aoNumero = (i, shift) => {
  if (i < ITENS.length) comprar(i, shift ? 5 : 1);
};

// =============================================================
// Predição do jogador local
// =============================================================

// Um passo fixo de simulação local: lê o input, manda pro servidor e
// já aplica o movimento (sem esperar a resposta).
function passoLocal() {
  local.antX = local.x;
  local.antY = local.y;
  const { dx, dy } = entrada.direcao();
  if (dx === 0 && dy === 0) return; // parado: nada a mandar
  const input = [++local.seq, dx, dy];
  rede.enviarInput(input);
  passoMovimento(local, dx, dy, DT, grade);
  local.pendentes.push(input);
}

// Chegou snapshot: parte da posição oficial e reaplica os inputs que o
// servidor ainda não processou. A diferença vira "erro visual" que some
// suavemente, pra não dar tranco na tela.
function reconciliar(snap) {
  const eu = snap.eu;

  // economia (sempre do servidor)
  const rankMudou = eu.rk !== local.posicaoRanking || eu.d !== local.dinheiro;
  local.dinheiro = eu.d;
  local.carrinho = eu.c;
  local.capacidade = eu.cap;
  local.posicaoRanking = eu.rk;
  local.carga = resumoCarga(local.carrinho, local.capacidade);
  hud.atualizarEconomia(local);
  if (rankMudou) atualizarRanking();

  // posição
  const antesX = local.x;
  const antesY = local.y;
  local.x = eu.x;
  local.y = eu.y;
  local.pendentes = local.pendentes.filter((p) => p[0] > snap.a);
  if (local.pendentes.length === 0) local.angulo = eu.a / 100;
  for (const [, dx, dy] of local.pendentes) passoMovimento(local, dx, dy, DT, grade);

  const ex = antesX - local.x;
  const ey = antesY - local.y;
  // desloca também a posição anterior, pra interpolação entre passos continuar contínua
  local.antX -= ex;
  local.antY -= ey;
  if (Math.hypot(ex, ey) > CONFIG.rede.erroSnapDistancia) {
    local.erroX = 0;
    local.erroY = 0;
    local.antX = local.x;
    local.antY = local.y;
  } else {
    local.erroX += ex;
    local.erroY += ey;
  }
}

// =============================================================
// Loop principal
// =============================================================

function quadro(agora) {
  requestAnimationFrame(quadro);
  const dt = Math.min((agora - ultimoQuadro) / 1000, 0.25);
  ultimoQuadro = agora;
  if (!jogando) return;

  // passos fixos de simulação (no máx. 5 por quadro pra não travar)
  acumulador += dt;
  let passos = 0;
  while (acumulador >= DT && passos < 5) {
    passoLocal();
    acumulador -= DT;
    passos++;
  }
  if (passos === 5) acumulador = 0;
  const alfa = acumulador / DT;

  // erro de predição decai
  const decai = Math.pow(CONFIG.rede.erroSuavizacao, dt * 60);
  local.erroX *= decai;
  local.erroY *= decai;
  if (Math.abs(local.erroX) < 0.01) local.erroX = 0;
  if (Math.abs(local.erroY) < 0.01) local.erroY = 0;

  const rx = local.antX + (local.x - local.antX) * alfa + local.erroX;
  const ry = local.antY + (local.y - local.antY) * alfa + local.erroY;

  // animação de andar do jogador local
  const mov = Math.hypot(local.x - local.antX, local.y - local.antY);
  local.andando = mov > 0.5;
  if (local.andando) local.fase += dt * 14;

  rede.prepararQuadro();
  const outros = montarOutros(dt);
  const clientes = montarClientes(dt, agora);

  hud.abrirMenu(noDeposito(), local, evento);

  render.posicionarCamera(rx, ry);
  render.desenhar({
    local: {
      id: local.id, x: rx, y: ry, angulo: local.angulo, cor: local.cor, nome: local.nome,
      fase: local.fase, andando: local.andando, carga: local.carga,
    },
    outros,
    clientes,
    t: agora / 1000,
  });

  const visao = render.visao();
  hud.desenharMinimapa({ x: rx, y: ry, angulo: local.angulo, cor: local.cor, camX: render.cam.x, camY: render.cam.y }, visao);
  hud.atualizarInfo(rede.online, rede.ping, dt);
}

// Outros camelôs, interpolados, com animação de andar
function montarOutros(dt) {
  const amostra = rede.amostrar('jogadores');
  const lista = [];
  for (const [id, e] of amostra) {
    const info = rede.infos.get(id);
    if (!info) continue;
    let an = animOutros.get(id);
    if (!an) {
      an = { x: e.x, y: e.y, fase: 0, andando: false };
      animOutros.set(id, an);
    }
    const v = Math.hypot(e.x - an.x, e.y - an.y) / Math.max(dt, 1e-3);
    an.andando = v > 20;
    if (an.andando) an.fase += dt * 14;
    an.x = e.x;
    an.y = e.y;
    lista.push({ id, x: e.x, y: e.y, angulo: e.a, cor: info.cor, nome: info.nome, fase: an.fase, andando: an.andando, carga: e.carga });
  }
  for (const id of animOutros.keys()) if (!amostra.has(id)) animOutros.delete(id);
  return lista;
}

// Clientes (NPCs): direção calculada pelo movimento, aparecem com fade
function montarClientes(dt, agora) {
  const amostra = rede.amostrar('clientes');
  const lista = [];
  for (const [id, e] of amostra) {
    let an = animClientes.get(id);
    if (!an) {
      an = { x: e.x, y: e.y, angulo: Math.random() * Math.PI * 2, fase: Math.random() * 6, andando: false, nasceu: agora };
      animClientes.set(id, an);
    }
    const dx = e.x - an.x;
    const dy = e.y - an.y;
    const v = Math.hypot(dx, dy) / Math.max(dt, 1e-3);
    an.andando = v > 8;
    if (an.andando) {
      an.fase += dt * 12;
      // gira suavemente pra direção do movimento
      const alvo = Math.atan2(dy, dx);
      let d = alvo - an.angulo;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      an.angulo += d * Math.min(1, dt * 10);
    }
    an.x = e.x;
    an.y = e.y;
    let alpha = Math.min(1, (agora - an.nasceu) / 400);
    if (e.estado === 3 || e.estado === 4) alpha = Math.min(alpha, e.prog / 10);
    lista.push({
      id, x: e.x, y: e.y, angulo: an.angulo, fase: an.fase, andando: an.andando, alpha,
      desejo: e.desejo, estado: e.estado, prog: e.prog, praMim: e.alvo === local.id,
    });
  }
  for (const id of animClientes.keys()) if (!amostra.has(id)) animClientes.delete(id);
  return lista;
}

requestAnimationFrame(quadro);

// Gancho pra depuração no console do navegador (e testes automáticos)
window.__camelo = { local, rede, render, hud, entrada };

// =============================================================
// Redimensionamento da janela
// =============================================================

let timerResize = 0;
window.addEventListener('resize', () => {
  clearTimeout(timerResize);
  timerResize = setTimeout(() => {
    render.redimensionar();
    if (jogando) rede.enviarVisao(render.visao());
  }, 100);
});

// =============================================================
// Preferências (nome e cor) no localStorage — opcional
// =============================================================

function lerPreferencia(chave, padrao) {
  try {
    return localStorage.getItem(chave) ?? padrao;
  } catch {
    return padrao;
  }
}

function salvarPreferencia(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem localStorage: tudo bem */
  }
}
