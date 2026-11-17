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

export { retArred };
