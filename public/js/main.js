// =============================================================
// Camelô.io — ponto de entrada do cliente.
// Tela inicial, conexão e o loop principal (predição + desenho).
// =============================================================

import { CONFIG } from '/shared/config.js';
import { criarGradeColisao, passoMovimento } from '/shared/physics.js';
import { Rede } from './net.js';
import { Renderizador } from './render.js';
import { Hud } from './hud.js';
import { Entrada } from './input.js';

const DT = 1 / CONFIG.servidor.tickRate;

const canvas = document.getElementById('jogo');
const render = new Renderizador(canvas);
const hud = new Hud();
const entrada = new Entrada();
const rede = new Rede();

// Estado do jogador local (predito no cliente)
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
};

let grade = null;
let jogando = false;
let acumulador = 0;
let ultimoQuadro = performance.now();
const animOutros = new Map(); // id -> { x, y, fase, andando }

// =============================================================
// Tela inicial
// =============================================================

const telaInicial = document.getElementById('tela-inicial');
const telaDesc = document.getElementById('tela-desconectado');
const inputNome = document.getElementById('nome');
const divCores = document.getElementById('cores');
const btnJogar = document.getElementById('btn-jogar');
const status = document.getElementById('status-conexao');

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

async function comecar() {
  if (btnJogar.disabled) return;
  btnJogar.disabled = true;
  status.textContent = '';
  const nome = inputNome.value.trim();
  salvarPreferencia('camelo.nome', nome);
  salvarPreferencia('camelo.cor', corEscolhida);
  try {
    btnJogar.textContent = 'Montando a banca...';
    await rede.conectar();
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

  grade = criarGradeColisao(init.mapa.predios, init.mapa.largura, init.mapa.altura);
  render.definirMapa(init.mapa);
  hud.prepararMinimapa(init.mapa);

  rede.aoSnapshot = reconciliar;
  rede.aoDesconectar = desconectado;

  telaInicial.classList.add('oculto');
  hud.mostrar();
  entrada.ativo = true;
  jogando = true;
  canvas.focus?.();
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
  const antesX = local.x;
  const antesY = local.y;
  local.x = snap.eu[0];
  local.y = snap.eu[1];
  local.pendentes = local.pendentes.filter((p) => p[0] > snap.a);
  if (local.pendentes.length === 0) local.angulo = snap.eu[2] / 100;
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

// Gancho pra depuração no console do navegador (e testes automáticos)
window.__camelo = { local, rede, render };
  const dt = Math.min((agora - ultimoQuadro) / 1000, 0.25);
  ultimoQuadro = agora;

  if (!jogando) {
    render.desenhar({ local: null, outros: [] });
    return;
  }

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

  // outros jogadores (interpolados)
  const amostra = rede.amostrarJogadores();
  const outros = [];
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
    outros.push({ id, x: e.x, y: e.y, angulo: e.a, cor: info.cor, nome: info.nome, fase: an.fase, andando: an.andando });
  }
  for (const id of animOutros.keys()) if (!amostra.has(id)) animOutros.delete(id);

  render.posicionarCamera(rx, ry);
  render.desenhar({
    local: { id: local.id, x: rx, y: ry, angulo: local.angulo, cor: local.cor, nome: local.nome, fase: local.fase, andando: local.andando },
    outros,
  });

  const visao = render.visao();
  hud.desenharMinimapa({ x: rx, y: ry, angulo: local.angulo, cor: local.cor, camX: render.cam.x, camY: render.cam.y }, visao);
  hud.atualizarInfo(rede.online, rede.ping, dt);
}

requestAnimationFrame(quadro);

// Gancho pra depuração no console do navegador (e testes automáticos)
window.__camelo = { local, rede, render };

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
