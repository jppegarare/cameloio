// =============================================================
// Sprites desenhados em código (sem imagens externas).
// Todas as funções desenham em coordenadas do MUNDO: o contexto já
// vem com a transformação da câmera aplicada.
// =============================================================

const PELES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

// ---------- utilidades de cor ----------

const cacheCores = new Map();

// Escurece (f < 1) ou clareia (f > 1) uma cor hex
export function ajustarCor(hex, f) {
  const chave = hex + f;
  let r = cacheCores.get(chave);
  if (r) return r;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))));
  r = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  cacheCores.set(chave, r);
  return r;
}

// Hash simples e determinístico (0..1) pra variar detalhes por id
export function hash01(a, b = 0) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function retArred(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- Camelô ----------

/**
 * Desenha um camelô visto de cima, virado pro ângulo dado, puxando o
 * carrinho atrás dele.
 *  e: { x, y, angulo, cor, id, fase (animação de andar), andando }
 */
export function desenharCamelo(ctx, e) {
  const cor = e.cor;
  const corEsc = ajustarCor(cor, 0.62);
  const pele = PELES[Math.floor(hash01(e.id, 7) * PELES.length)];
  const balanco = e.andando ? Math.sin(e.fase) : 0;

  ctx.save();
  ctx.translate(e.x, e.y);

  // sombra (não gira)
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(-Math.cos(e.angulo) * 12 + 3, -Math.sin(e.angulo) * 12 + 5, 34, 24, e.angulo, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(e.angulo);

  // ---- carrinho (atrás, no -x) ----
  // varais (alças)
  ctx.strokeStyle = '#5b3a1e';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-9, -9); ctx.lineTo(-22, -11);
  ctx.moveTo(-9, 9); ctx.lineTo(-22, 11);
  ctx.stroke();
  // rodas
  ctx.fillStyle = '#222';
  retArred(ctx, -42, -19, 12, 5, 2); ctx.fill();
  retArred(ctx, -42, 14, 12, 5, 2); ctx.fill();
  // caixa de madeira
  ctx.fillStyle = '#a0703c';
  retArred(ctx, -50, -15, 30, 30, 4); ctx.fill();
  ctx.strokeStyle = '#5b3a1e';
  ctx.lineWidth = 2;
  ctx.stroke();
  // tábuas
  ctx.strokeStyle = 'rgba(91,58,30,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = -5; k <= 5; k += 10) { ctx.moveTo(-48, k); ctx.lineTo(-22, k); }
  ctx.stroke();
  // mercadoria dentro do carrinho (grade 3x3, proporcional ao que tem)
  if (e.carga) desenharCarga(ctx, e.carga);
  // lona dobrada nas laterais do carrinho (cor do jogador)
  ctx.fillStyle = cor;
  retArred(ctx, -52, -17, 34, 6, 3); ctx.fill();
  retArred(ctx, -52, 11, 34, 6, 3); ctx.fill();
  ctx.strokeStyle = corEsc;
  ctx.lineWidth = 1.5;
  retArred(ctx, -52, -17, 34, 6, 3); ctx.stroke();
  retArred(ctx, -52, 11, 34, 6, 3); ctx.stroke();

  // ---- pés (aparecem alternando ao andar) ----
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath();
  ctx.ellipse(4 + balanco * 7, -6, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.ellipse(4 - balanco * 7, 6, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- corpo (camiseta da cor da lona) ----
  ctx.fillStyle = cor;
  ctx.strokeStyle = corEsc;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ---- braços: segurando as alças do carrinho, balançando ----
  ctx.fillStyle = pele;
  ctx.strokeStyle = ajustarCor(pele, 0.7);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(-8 - balanco * 2, -14, 4.2, 0, Math.PI * 2);
  ctx.arc(-8 + balanco * 2, 14, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ---- cabeça + boné ----
  ctx.fillStyle = pele;
  ctx.beginPath();
  ctx.arc(2, 0, 8.5, 0, Math.PI * 2);
  ctx.fill();
  // aba do boné (pra frente)
  ctx.fillStyle = corEsc;
  ctx.beginPath();
  ctx.ellipse(9, 0, 7, 7.5, 0, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  // copa do boné
  ctx.fillStyle = cor;
  ctx.strokeStyle = corEsc;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(1, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // botãozinho do boné
  ctx.fillStyle = corEsc;
  ctx.beginPath();
  ctx.arc(1, 0, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Nome em cima do camelô (desenhado sem rotação)
export function desenharNome(ctx, x, y, nome, destaque = false) {
  ctx.font = `bold ${destaque ? 15 : 13}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(nome, x, y);
  ctx.fillStyle = destaque ? '#ffd23f' : '#fff';
  ctx.fillText(nome, x, y);
}

// Mercadoria no carrinho: cada dígito da string é o código de um item
function desenharCarga(ctx, carga) {
  for (let k = 0; k < carga.length && k < 9; k++) {
    const item = ICONES[carga.charCodeAt(k) - 48];
    if (!item) continue;
    const col = k % 3;
    const lin = Math.floor(k / 3);
    const x = -47 + col * 8.5;
    const y = -10 + lin * 7;
    ctx.fillStyle = item.cor;
    ctx.fillRect(x, y, 7, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, 6, 5);
  }
}

// =============================================================
// Ícones das mercadorias (mesma ordem de CONFIG.itens)
// Cada função desenha centrada em (0,0) numa caixa de 1x1 (escalada).
// =============================================================

export const ICONES = [
  { id: 'agua', cor: '#4cc9f0', desenhar: iconeAgua },
  { id: 'chip', cor: '#f77f00', desenhar: iconeChip },
  { id: 'pano', cor: '#e63946', desenhar: iconePano },
  { id: 'capinha', cor: '#8338ec', desenhar: iconeCapinha },
  { id: 'carregador', cor: '#f1f1f1', desenhar: iconeCarregador },
  { id: 'fone', cor: '#ff5d8f', desenhar: iconeFone },
  { id: 'guardachuva', cor: '#3a86ff', desenhar: iconeGuardaChuva },
  { id: 'camisa', cor: '#ffd23f', desenhar: iconeCamisa },
];

const CONTORNO = '#1b1b2f';

function iconeAgua(c) {
  // garrafinha de água com gotinhas de gelado
  c.fillStyle = '#bde8f7';
  retArred(c, -0.2, -0.25, 0.4, 0.68, 0.1);
  c.fill();
  c.lineWidth = 0.05;
  c.strokeStyle = CONTORNO;
  c.stroke();
  c.fillStyle = '#2f6fb5';
  c.fillRect(-0.21, -0.02, 0.42, 0.2); // rótulo
  c.fillStyle = '#4cc9f0';
  retArred(c, -0.1, -0.42, 0.2, 0.18, 0.04); // tampa
  c.fill();
  c.stroke();
  c.fillStyle = '#fff';
  for (const [x, y] of [[-0.1, -0.15], [0.08, 0.3], [-0.06, 0.32]]) {
    c.beginPath(); c.arc(x, y, 0.035, 0, Math.PI * 2); c.fill();
  }
}

function iconeChip(c) {
  // chip de celular: cartão laranja com canto cortado e contatos dourados
  c.fillStyle = '#f77f00';
  c.beginPath();
  c.moveTo(-0.3, -0.4); c.lineTo(0.15, -0.4); c.lineTo(0.3, -0.25); c.lineTo(0.3, 0.4); c.lineTo(-0.3, 0.4);
  c.closePath();
  c.fill();
  c.lineWidth = 0.05;
  c.strokeStyle = CONTORNO;
  c.stroke();
  c.fillStyle = '#ffd23f';
  retArred(c, -0.17, -0.12, 0.34, 0.32, 0.05);
  c.fill();
  c.strokeStyle = '#b8860b';
  c.lineWidth = 0.03;
  c.stroke();
  c.beginPath();
  c.moveTo(-0.17, 0.04); c.lineTo(0.17, 0.04);
  c.moveTo(0, -0.12); c.lineTo(0, 0.2);
  c.stroke();
}

function iconePano(c) {
  // pano de prato xadrez dobrado
  c.fillStyle = '#fff';
  retArred(c, -0.38, -0.3, 0.76, 0.6, 0.06);
  c.fill();
  c.fillStyle = 'rgba(230,57,70,0.85)';
  for (let k = 0; k < 4; k++) {
    c.fillRect(-0.38 + k * 0.2, -0.3, 0.1, 0.6);
    c.fillRect(-0.38, -0.3 + k * 0.16, 0.76, 0.08);
  }
  c.strokeStyle = CONTORNO;
  c.lineWidth = 0.05;
  retArred(c, -0.38, -0.3, 0.76, 0.6, 0.06);
  c.stroke();
}

function iconeCapinha(c) {
  // capinha de celular roxa com câmera e brilho
  c.fillStyle = '#8338ec';
  retArred(c, -0.24, -0.42, 0.48, 0.84, 0.12);
  c.fill();
  c.lineWidth = 0.05;
  c.strokeStyle = CONTORNO;
  c.stroke();
  c.fillStyle = '#1b1b2f';
  retArred(c, -0.15, -0.33, 0.16, 0.2, 0.05);
  c.fill();
  c.fillStyle = '#ff5d8f';
  c.beginPath(); c.arc(0.06, 0.12, 0.09, 0, Math.PI * 2); c.fill(); // coraçãozinho/strass
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.fillRect(0.12, -0.3, 0.05, 0.5);
}

function iconeCarregador(c) {
  // tomada branca com pinos e fio
  c.strokeStyle = '#555';
  c.lineWidth = 0.06;
  c.beginPath();
  c.moveTo(0, 0.2); c.bezierCurveTo(0, 0.45, 0.35, 0.3, 0.32, 0.45);
  c.stroke();
  c.fillStyle = '#f1f1f1';
  retArred(c, -0.22, -0.2, 0.44, 0.42, 0.08);
  c.fill();
  c.strokeStyle = CONTORNO;
  c.lineWidth = 0.05;
  c.stroke();
  c.fillStyle = '#aaa';
  c.fillRect(-0.13, -0.42, 0.07, 0.22);
  c.fillRect(0.06, -0.42, 0.07, 0.22);
  c.fillStyle = '#2ec4b6';
  c.beginPath(); c.arc(0, 0.02, 0.06, 0, Math.PI * 2); c.fill();
}

function iconeFone(c) {
  // fone de ouvido (arco + conchas rosas)
  c.strokeStyle = CONTORNO;
  c.lineWidth = 0.09;
  c.beginPath();
  c.arc(0, 0.05, 0.3, Math.PI, 0);
  c.stroke();
  c.fillStyle = '#ff5d8f';
  c.lineWidth = 0.05;
  for (const x of [-0.3, 0.3]) {
    retArred(c, x - 0.1, -0.02, 0.2, 0.34, 0.08);
    c.fill();
    c.stroke();
  }
}

function iconeGuardaChuva(c) {
  // guarda-chuva azul aberto
  c.fillStyle = '#3a86ff';
  c.beginPath();
  c.moveTo(-0.42, 0.02);
  c.quadraticCurveTo(-0.4, -0.42, 0, -0.42);
  c.quadraticCurveTo(0.4, -0.42, 0.42, 0.02);
  for (let k = 3; k >= 0; k--) {
    const x0 = -0.42 + (k + 1) * 0.21;
    const x1 = -0.42 + k * 0.21;
    c.quadraticCurveTo((x0 + x1) / 2, -0.08, x1, 0.02);
  }
  c.closePath();
  c.fill();
  c.strokeStyle = CONTORNO;
  c.lineWidth = 0.05;
  c.stroke();
  c.beginPath();
  c.moveTo(0, -0.42); c.lineTo(0, 0.3);
  c.arc(-0.08, 0.3, 0.08, 0, Math.PI);
  c.stroke();
}

function iconeCamisa(c) {
  // camisa amarela com gola verde
  c.fillStyle = '#ffd23f';
  c.beginPath();
  c.moveTo(-0.16, -0.38); c.lineTo(-0.42, -0.22); c.lineTo(-0.32, -0.02); c.lineTo(-0.22, -0.08);
  c.lineTo(-0.22, 0.4); c.lineTo(0.22, 0.4); c.lineTo(0.22, -0.08); c.lineTo(0.32, -0.02);
  c.lineTo(0.42, -0.22); c.lineTo(0.16, -0.38);
  c.quadraticCurveTo(0, -0.22, -0.16, -0.38);
  c.closePath();
  c.fill();
  c.strokeStyle = CONTORNO;
  c.lineWidth = 0.05;
  c.stroke();
  c.strokeStyle = '#2a9d8f';
  c.lineWidth = 0.07;
  c.beginPath();
  c.moveTo(-0.15, -0.37); c.quadraticCurveTo(0, -0.2, 0.15, -0.37);
  c.stroke();
  c.fillStyle = '#2a9d8f';
  c.beginPath(); c.arc(0.1, 0.0, 0.05, 0, Math.PI * 2); c.fill();
}

// Ícone pré-desenhado num canvas (cache por item e tamanho em pixels)
const cacheIcones = new Map();
export function iconeCanvas(i, px) {
  px = Math.max(8, Math.round(px));
  const chave = i + ':' + px;
  let cv = cacheIcones.get(chave);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const c = cv.getContext('2d');
  c.translate(px / 2, px / 2);
  c.scale(px, px);
  ICONES[i]?.desenhar(c);
  cacheIcones.set(chave, cv);
  return cv;
}

// Ícone como data URL (pra usar em <img> no HUD)
const cacheURLs = new Map();
export function iconeURL(i, px = 64) {
  const chave = i + ':' + px;
  if (!cacheURLs.has(chave)) cacheURLs.set(chave, iconeCanvas(i, px).toDataURL());
  return cacheURLs.get(chave);
}

// =============================================================
// Cliente (NPC)
// =============================================================

const CAMISAS = ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51', '#6d597a', '#b5838d', '#457b9d', '#ffffff', '#8ab17d'];
const CABELOS = ['#2b1d0e', '#4a2c12', '#1b1b1b', '#8d5524', '#d4a017', '#9e9e9e', '#c0392b'];

/**
 * e: { x, y, angulo, id, fase, andando, alpha }
 */
export function desenharCliente(ctx, e) {
  const camisa = CAMISAS[Math.floor(hash01(e.id, 1) * CAMISAS.length)];
  const cabelo = CABELOS[Math.floor(hash01(e.id, 2) * CABELOS.length)];
  const pele = PELES[Math.floor(hash01(e.id, 3) * PELES.length)];
  const temSacola = hash01(e.id, 4) < 0.3;
  const balanco = e.andando ? Math.sin(e.fase) : 0;

  ctx.save();
  ctx.globalAlpha = e.alpha ?? 1;
  ctx.translate(e.x, e.y);
  ctx.scale(1.15, 1.15);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 13, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(e.angulo);

  // pés
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.ellipse(3 + balanco * 5, -4, 3.5, 2.5, 0, 0, Math.PI * 2);
  ctx.ellipse(3 - balanco * 5, 4, 3.5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // sacola
  if (temSacola) {
    ctx.fillStyle = '#f1f1f1';
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    retArred(ctx, -4 - balanco * 3, 11, 9, 6, 2);
    ctx.fill();
    ctx.stroke();
  }
  // corpo
  ctx.fillStyle = camisa;
  ctx.strokeStyle = ajustarCor(camisa === '#ffffff' ? '#cccccc' : camisa, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7.5, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // mãos
  ctx.fillStyle = pele;
  ctx.beginPath();
  ctx.arc(-balanco * 5, -10.5, 3, 0, Math.PI * 2);
  ctx.arc(balanco * 5, 10.5, 3, 0, Math.PI * 2);
  ctx.fill();
  // cabeça e cabelo
  ctx.fillStyle = pele;
  ctx.beginPath();
  ctx.arc(1, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cabelo;
  ctx.beginPath();
  ctx.arc(0, 0, 6.2, Math.PI * 0.55, Math.PI * 1.45);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-1, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Balão de desejo em cima do cliente.
 *  estado: 0 passeando, 1 indo, 2 comprando, 3 satisfeito, 4 indo embora
 *  prog: 0..10 (progresso da compra ou do sumiço)
 *  praMim: o cliente está vindo até o jogador local
 *  t: tempo em segundos (animação)
 */
export function desenharBalao(ctx, x, y, item, estado, prog, praMim, t, escala) {
  if (estado === 3) {
    // comprou: coraçãozinho subindo e sumindo
    const f = prog / 10;
    ctx.save();
    ctx.globalAlpha = f;
    desenharCoracao(ctx, x, y - 34 - (1 - f) * 18, 10);
    ctx.restore();
    return;
  }
  if (item < 0 || estado === 4) return;
  const pulo = estado === 1 || estado === 2 ? Math.abs(Math.sin(t * 8)) * 3 : Math.sin(t * 2 + x) * 1.2;
  const bx = x;
  const by = y - 40 - pulo;
  const w = 36;
  const h = 32;
  ctx.save();
  // corpo do balão + rabinho
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = praMim ? '#ffb000' : estado === 1 || estado === 2 ? '#2ec4b6' : 'rgba(27,27,47,0.7)';
  ctx.lineWidth = praMim ? 3 : 2;
  retArred(ctx, bx - w / 2, by - h / 2, w, h, 9);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx - 5, by + h / 2 - 1);
  ctx.lineTo(bx, by + h / 2 + 7);
  ctx.lineTo(bx + 5, by + h / 2 - 1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bx - 5, by + h / 2);
  ctx.lineTo(bx, by + h / 2 + 7);
  ctx.lineTo(bx + 5, by + h / 2);
  ctx.stroke();
  // ícone
  const tam = 27;
  ctx.drawImage(iconeCanvas(item, tam * escala), bx - tam / 2, by - tam / 2, tam, tam);
  // progresso da compra: anel verde
  if (estado === 2 && prog > 0) {
    ctx.strokeStyle = '#2ec4b6';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(bx, by, 24, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * prog) / 10);
    ctx.stroke();
  }
  ctx.restore();
}

export function desenharCoracao(ctx, x, y, r) {
  ctx.fillStyle = '#ff4d6d';
  ctx.strokeStyle = '#a4133c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.fill();
  ctx.stroke();
}

export { retArred };
