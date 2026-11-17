// =============================================================
// Desenho do mundo: chão da cidade (pré-desenhado em "chunks" que
// ficam em cache), câmera e entidades.
// =============================================================

import { CONFIG } from '/shared/config.js';
import { ajustarCor, hash01, retArred, desenharCamelo, desenharNome } from './sprites.js';

const COR = {
  foraDoMapa: '#3d5a3d',
  asfalto: '#4a4e57',
  asfaltoRemendo: '#43474f',
  faixa: '#f2c94c',
  zebra: 'rgba(255,255,255,0.85)',
  calcada: '#d8cfbd',
  calcadaLinha: 'rgba(120,105,80,0.18)',
  meioFio: '#9e9583',
  grama: '#78b159',
  terra: '#d9c39a',
  concreto: '#c9c4b5',
  terminal: '#9ea3a8',
};

const TELHADOS = ['#c8553d', '#e9c46a', '#8ab17d', '#6d9dc5', '#b5838d', '#f4a261', '#a8a8a8', '#d4a5a5'];
const LONAS_FEIRA = ['#e63946', '#2a9d8f', '#f77f00', '#8338ec', '#ffbe0b', '#3a86ff'];
const ROUPAS = ['#e63946', '#ffbe0b', '#3a86ff', '#fff', '#2a9d8f', '#ff5d8f'];

// rng determinístico pros detalhes (mesma semente = mesmo desenho)
function rngDe(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Renderizador {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mapa = null;
    this.chunks = new Map();
    this.cam = { x: 0, y: 0 };
    this.zoom = 1;
    this.dpr = 1;
    this.escala = 1; // pixels do canvas por unidade do mundo
    this.redimensionar();
  }

  redimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.camera.dprMax);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    // zoom: o lado menor mostra no máx. ladoMenorUnidades e o maior no máx. ladoMaiorUnidades
    this.zoom = Math.max(
      Math.min(w, h) / CONFIG.camera.ladoMenorUnidades,
      Math.max(w, h) / CONFIG.camera.ladoMaiorUnidades,
    );
    this.escala = this.zoom * dpr;
    this.chunks.clear();
  }

  // Meia largura/altura visível em unidades do mundo (mandado ao servidor pro culling)
  visao() {
    return { mw: this.cssW / this.zoom / 2, mh: this.cssH / this.zoom / 2 };
  }

  definirMapa(mapa) {
    this.mapa = mapa;
    this.chunks.clear();
  }

  // Câmera centrada no jogador, presa nas bordas do mapa
  posicionarCamera(x, y) {
    const { mw, mh } = this.visao();
    const M = this.mapa;
    let cx = M.largura > mw * 2 ? Math.min(Math.max(x, mw), M.largura - mw) : M.largura / 2;
    let cy = M.altura > mh * 2 ? Math.min(Math.max(y, mh), M.altura - mh) : M.altura / 2;
    // arredonda pro pixel do canvas (evita tremidinha)
    this.cam.x = Math.round(cx * this.escala) / this.escala;
    this.cam.y = Math.round(cy * this.escala) / this.escala;
  }

  // Mundo -> pixel do canvas
  telaX(x) { return (x - this.cam.x) * this.escala + this.canvas.width / 2; }
  telaY(y) { return (y - this.cam.y) * this.escala + this.canvas.height / 2; }

  // ---------------------------------------------------------
  // Quadro
  // ---------------------------------------------------------

  /**
   * cena: { local: {x,y,angulo,cor,id,nome,fase,andando}, outros: [mesmo formato] }
   */
  desenhar(cena) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COR.foraDoMapa;
    ctx.fillRect(0, 0, W, H);
    if (!this.mapa) return;

    this.desenharChao();

    // transformação da câmera pras entidades
    ctx.setTransform(this.escala, 0, 0, this.escala, W / 2 - this.cam.x * this.escala, H / 2 - this.cam.y * this.escala);
    const { mw, mh } = this.visao();
    const visivel = (e) => Math.abs(e.x - this.cam.x) < mw + 80 && Math.abs(e.y - this.cam.y) < mh + 80;

    const lista = cena.outros.filter(visivel);
    if (cena.local) lista.push(cena.local);
    lista.sort((a, b) => a.y - b.y);
    for (const e of lista) desenharCamelo(ctx, e);
    for (const e of lista) desenharNome(ctx, e.x, e.y - 44, e.nome, e === cena.local);
  }

  // ---------------------------------------------------------
  // Chão em chunks
  // ---------------------------------------------------------

  desenharChao() {
    const T = CONFIG.camera.tamanhoChunk;
    const { mw, mh } = this.visao();
    const x0 = Math.max(0, Math.floor((this.cam.x - mw) / T));
    const y0 = Math.max(0, Math.floor((this.cam.y - mh) / T));
    const x1 = Math.min(Math.ceil(this.mapa.largura / T) - 1, Math.floor((this.cam.x + mw) / T));
    const y1 = Math.min(Math.ceil(this.mapa.altura / T) - 1, Math.floor((this.cam.y + mh) / T));
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const img = this.obterChunk(cx, cy);
        const wx = cx * T;
        const wy = cy * T;
        const wMax = Math.min(T, this.mapa.largura - wx);
        const hMax = Math.min(T, this.mapa.altura - wy);
        const sx0 = Math.round(this.telaX(wx));
        const sy0 = Math.round(this.telaY(wy));
        const sx1 = Math.round(this.telaX(wx + wMax));
        const sy1 = Math.round(this.telaY(wy + hMax));
        ctx.drawImage(img, 0, 0, img.width, img.height, sx0, sy0, sx1 - sx0, sy1 - sy0);
      }
    }
  }

  obterChunk(cx, cy) {
    const chave = cx + ',' + cy;
    let img = this.chunks.get(chave);
    if (img) {
      // LRU: move pro fim
      this.chunks.delete(chave);
      this.chunks.set(chave, img);
      return img;
    }
    const T = CONFIG.camera.tamanhoChunk;
    const wx = cx * T;
    const wy = cy * T;
    const wMax = Math.min(T, this.mapa.largura - wx);
    const hMax = Math.min(T, this.mapa.altura - wy);
    img = document.createElement('canvas');
    img.width = Math.ceil(wMax * this.escala);
    img.height = Math.ceil(hMax * this.escala);
    const c = img.getContext('2d');
    c.setTransform(img.width / wMax, 0, 0, img.height / hMax, -wx * (img.width / wMax), -wy * (img.height / hMax));
    desenharCenario(c, this.mapa, { x: wx, y: wy, w: wMax, h: hMax });
    this.chunks.set(chave, img);
    while (this.chunks.size > CONFIG.camera.maxChunksCache) {
      this.chunks.delete(this.chunks.keys().next().value);
    }
    return img;
  }
}

// =============================================================
// Cenário estático (desenhado uma vez por chunk)
// =============================================================

function intersecta(r, area, m = 0) {
  return r.x - m < area.x + area.w && r.x + r.w + m > area.x && r.y - m < area.y + area.h && r.y + r.h + m > area.y;
}

export function desenharCenario(ctx, M, area) {
  // asfalto
  ctx.fillStyle = COR.asfalto;
  ctx.fillRect(area.x, area.y, area.w, area.h);

  desenharRuas(ctx, M, area);

  for (const q of M.quarteiroes) {
    if (intersecta(q, area, 4)) desenharCalcada(ctx, q, M);
  }
  for (const f of M.feirinhas) if (intersecta(f.zona, area, 4)) desenharFeirinha(ctx, f, M);
  for (const p of M.pracas) if (intersecta(p.zona, area, 4)) desenharPraca(ctx, p);
  for (const t of M.terminais) if (intersecta(t.zona, area, 4)) desenharTerminal(ctx, t);
  for (const d of M.depositos) if (intersecta(d.patio, area, 4)) desenharPatio(ctx, d);

  // sombras primeiro, depois telhados (sombra cai na calçada)
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (const p of M.predios) {
    if (intersecta(p, area, 14)) ctx.fillRect(p.x + 6, p.y + 8, p.w, p.h);
  }
  for (const p of M.predios) {
    if (!intersecta(p, area, 2)) continue;
    if (p.tipo === 'galpao') desenharGalpao(ctx, p);
    else desenharPredio(ctx, p);
  }
}

// ---------- ruas: faixas, zebras, bueiros ----------

function desenharRuas(ctx, M, area) {
  const rua = M.rua;
  const passo = M.passo;
  const nH = Math.round((M.altura - rua) / passo) + 1; // ruas horizontais
  const nV = Math.round((M.largura - rua) / passo) + 1; // ruas verticais

  // remendos no asfalto
  ctx.fillStyle = COR.asfaltoRemendo;
  for (let m = 0; m < nH; m++) {
    for (let k = 0; k < nV; k++) {
      const x = k * passo + rua + hash01(k, m) * (passo - rua - 60);
      const y = m * passo + 10 + hash01(m, k + 50) * (rua - 50);
      if (x > area.x - 80 && x < area.x + area.w + 80 && y > area.y - 80 && y < area.y + area.h + 80) {
        retArred(ctx, x, y, 30 + hash01(k + 3, m) * 40, 18 + hash01(k, m + 3) * 16, 6);
        ctx.fill();
      }
    }
  }

  for (let m = 0; m < nH; m++) {
    for (let k = 0; k < nV - 1; k++) {
      // trecho horizontal entre dois cruzamentos
      const seg = { x: k * passo + rua, y: m * passo, w: passo - rua, h: rua };
      if (intersecta(seg, area, 10)) desenharTrecho(ctx, seg, true, k, m);
    }
  }
  for (let k = 0; k < nV; k++) {
    for (let m = 0; m < nH - 1; m++) {
      const seg = { x: k * passo, y: m * passo + rua, w: rua, h: passo - rua };
      if (intersecta(seg, area, 10)) desenharTrecho(ctx, seg, false, k, m);
    }
  }
}

function desenharTrecho(ctx, s, horizontal, k, m) {
  // faixa amarela tracejada no meio
  ctx.fillStyle = COR.faixa;
  if (horizontal) {
    const y = s.y + s.h / 2 - 2;
    for (let x = s.x + 44; x < s.x + s.w - 60; x += 42) ctx.fillRect(x, y, 24, 4);
  } else {
    const x = s.x + s.w / 2 - 2;
    for (let y = s.y + 44; y < s.y + s.h - 60; y += 42) ctx.fillRect(x, y, 4, 24);
  }
  // faixas de pedestre (zebra) nas duas pontas
  ctx.fillStyle = COR.zebra;
  for (const ponta of [0, 1]) {
    if (horizontal) {
      const x = ponta === 0 ? s.x + 4 : s.x + s.w - 28;
      for (let y = s.y + 10; y < s.y + s.h - 12; y += 15) ctx.fillRect(x, y, 24, 8);
    } else {
      const y = ponta === 0 ? s.y + 4 : s.y + s.h - 28;
      for (let x = s.x + 10; x < s.x + s.w - 12; x += 15) ctx.fillRect(x, y, 8, 24);
    }
  }
  // bueiro
  const h = hash01(k * 31 + (horizontal ? 1 : 2), m * 17);
  const bx = horizontal ? s.x + 70 + h * (s.w - 140) : s.x + 22 + h * (s.w - 44);
  const by = horizontal ? s.y + 22 + hash01(m, k) * (s.h - 44) : s.y + 70 + h * (s.h - 140);
  ctx.fillStyle = '#35383f';
  ctx.beginPath();
  ctx.arc(bx, by, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a5f69';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx - 5, by); ctx.lineTo(bx + 5, by);
  ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by + 5);
  ctx.stroke();
}

// ---------- calçada ----------

function desenharCalcada(ctx, q, M) {
  // meio-fio (borda)
  ctx.fillStyle = COR.meioFio;
  retArred(ctx, q.x - 3, q.y - 3, q.w + 6, q.h + 6, 18);
  ctx.fill();
  ctx.fillStyle = COR.calcada;
  retArred(ctx, q.x, q.y, q.w, q.h, 15);
  ctx.fill();
  // ladrilhos
  ctx.save();
  retArred(ctx, q.x, q.y, q.w, q.h, 15);
  ctx.clip();
  ctx.strokeStyle = COR.calcadaLinha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = q.x + 13; x < q.x + q.w; x += 13) { ctx.moveTo(x, q.y); ctx.lineTo(x, q.y + M.calcada); ctx.moveTo(x, q.y + q.h - M.calcada); ctx.lineTo(x, q.y + q.h); }
  for (let y = q.y + 13; y < q.y + q.h; y += 13) { ctx.moveTo(q.x, y); ctx.lineTo(q.x + M.calcada, y); ctx.moveTo(q.x + q.w - M.calcada, y); ctx.lineTo(q.x + q.w, y); }
  ctx.stroke();
  ctx.restore();
}

// ---------- prédios ----------

function desenharPredio(ctx, p) {
  const r = rngDe(p.semente);
  const telha = p.estilo === 1;
  const cor = telha ? '#c4622d' : TELHADOS[p.cor];
  ctx.fillStyle = cor;
  ctx.fillRect(p.x, p.y, p.w, p.h);

  if (telha) {
    // telhado de telha colonial: fileiras + cumeeira
    ctx.strokeStyle = ajustarCor(cor, 0.78);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const horiz = p.w >= p.h;
    if (horiz) {
      for (let y = p.y + 8; y < p.y + p.h; y += 9) { ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.w, y); }
    } else {
      for (let x = p.x + 8; x < p.x + p.w; x += 9) { ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); }
    }
    ctx.stroke();
    ctx.strokeStyle = ajustarCor(cor, 0.6);
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (horiz) { ctx.moveTo(p.x + 6, p.y + p.h / 2); ctx.lineTo(p.x + p.w - 6, p.y + p.h / 2); }
    else { ctx.moveTo(p.x + p.w / 2, p.y + 6); ctx.lineTo(p.x + p.w / 2, p.y + p.h - 6); }
    ctx.stroke();
  } else {
    // laje com parapeito
    ctx.strokeStyle = ajustarCor(cor, 0.7);
    ctx.lineWidth = 5;
    ctx.strokeRect(p.x + 2.5, p.y + 2.5, p.w - 5, p.h - 5);
    ctx.strokeStyle = ajustarCor(cor, 1.18);
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
  }

  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;

  if (p.estilo === 0 || p.estilo === 2) {
    // caixa d'água azul (clássica)
    const wx = p.x + 26 + r() * Math.max(1, p.w - 52);
    const wy = p.y + 26 + r() * Math.max(1, p.h - 52);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.arc(wx + 3, wy + 4, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f6fb5';
    ctx.beginPath(); ctx.arc(wx, wy, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4c8fd6';
    ctx.beginPath(); ctx.arc(wx, wy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f6fb5';
    ctx.beginPath(); ctx.arc(wx, wy, 3, 0, Math.PI * 2); ctx.fill();
  }
  if (p.estilo === 0) {
    // ar-condicionado
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const ax = p.x + 14 + r() * Math.max(1, p.w - 46);
      const ay = p.y + 14 + r() * Math.max(1, p.h - 36);
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(ax, ay, 22, 16);
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      ctx.strokeRect(ax, ay, 22, 16);
      ctx.beginPath(); ctx.arc(ax + 11, ay + 8, 5, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (p.estilo === 2) {
    // varal com roupa no telhado
    const vy = cy + (r() - 0.5) * p.h * 0.3;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x + 14, vy); ctx.lineTo(p.x + p.w - 14, vy); ctx.stroke();
    for (let x = p.x + 20; x < p.x + p.w - 26; x += 14 + r() * 8) {
      ctx.fillStyle = ROUPAS[Math.floor(r() * ROUPAS.length)];
      ctx.fillRect(x, vy - 1, 9, 12);
    }
  }
  if (p.estilo === 3) {
    // placas solares + antena
    const cols = Math.max(1, Math.floor((p.w - 40) / 26));
    const lins = Math.max(1, Math.min(3, Math.floor((p.h - 40) / 34)));
    ctx.fillStyle = '#1e3a5f';
    ctx.strokeStyle = '#7aa6d6';
    ctx.lineWidth = 1;
    for (let a = 0; a < lins; a++) {
      for (let b = 0; b < cols; b++) {
        const x = p.x + 20 + b * 26;
        const y = p.y + 20 + a * 34;
        ctx.fillRect(x, y, 22, 28);
        ctx.strokeRect(x + 0.5, y + 0.5, 21, 27);
      }
    }
    ctx.fillStyle = '#ddd';
    ctx.beginPath(); ctx.arc(p.x + p.w - 22, p.y + p.h - 22, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#999';
    ctx.beginPath(); ctx.arc(p.x + p.w - 22, p.y + p.h - 22, 3, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- depósito ----------

function desenharGalpao(ctx, g) {
  ctx.fillStyle = '#b9bfc6';
  ctx.fillRect(g.x, g.y, g.w, g.h);
  // telha de zinco ondulada
  ctx.strokeStyle = 'rgba(70,80,90,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const vertical = g.lado === 'baixo' || g.lado === 'cima';
  if (vertical) for (let x = g.x + 6; x < g.x + g.w; x += 8) { ctx.moveTo(x, g.y); ctx.lineTo(x, g.y + g.h); }
  else for (let y = g.y + 6; y < g.y + g.h; y += 8) { ctx.moveTo(g.x, y); ctx.lineTo(g.x + g.w, y); }
  ctx.stroke();
  ctx.strokeStyle = '#6b737c';
  ctx.lineWidth = 5;
  ctx.strokeRect(g.x + 2.5, g.y + 2.5, g.w - 5, g.h - 5);

  // letreiro pintado no telhado
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  const tam = Math.min(g.w, g.h) * 0.2;
  ctx.save();
  ctx.translate(cx, cy);
  if (!vertical) ctx.rotate(-Math.PI / 2);
  ctx.font = `900 ${Math.round(tam)}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1b1b2f';
  ctx.strokeText('DEPÓSITO', 0, -tam * 0.35);
  ctx.fillStyle = '#ffd23f';
  ctx.fillText('DEPÓSITO', 0, -tam * 0.35);
  ctx.font = `bold ${Math.round(tam * 0.5)}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.lineWidth = 4;
  ctx.strokeText('atacado • preço de fábrica', 0, tam * 0.55);
  ctx.fillStyle = '#fff';
  ctx.fillText('atacado • preço de fábrica', 0, tam * 0.55);
  ctx.restore();
}

function desenharPatio(ctx, d) {
  const p = d.patio;
  ctx.fillStyle = COR.concreto;
  ctx.fillRect(p.x, p.y, p.w, p.h);
  // zona de compra: amarela com borda listrada
  const z = d.zona;
  ctx.fillStyle = 'rgba(255,210,63,0.28)';
  ctx.fillRect(z.x, z.y, z.w, z.h);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffd23f';
  ctx.strokeRect(z.x, z.y, z.w, z.h);
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = '#1b1b2f';
  ctx.strokeRect(z.x, z.y, z.w, z.h);
  ctx.setLineDash([]);
  // cifrão no chão
  ctx.font = `900 ${Math.round(Math.min(z.w, z.h) * 0.55)}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(27,27,47,0.25)';
  ctx.fillText('$', z.x + z.w / 2, z.y + z.h / 2 + 2);
  // caixas empilhadas encostadas no galpão
  const r = rngDe(d.id * 977 + 13);
  const caixas = 3 + Math.floor(r() * 3);
  for (let k = 0; k < caixas; k++) {
    let x, y;
    if (d.lado === 'baixo') { x = p.x + 4 + r() * (p.w - 24); y = p.y + 2; }
    else if (d.lado === 'cima') { x = p.x + 4 + r() * (p.w - 24); y = p.y + p.h - 20; }
    else if (d.lado === 'direita') { x = p.x + 2; y = p.y + 4 + r() * (p.h - 24); }
    else { x = p.x + p.w - 20; y = p.y + 4 + r() * (p.h - 24); }
    ctx.fillStyle = '#b07d48';
    ctx.fillRect(x, y, 18, 18);
    ctx.strokeStyle = '#6e4a24';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, 18, 18);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18, y + 18); ctx.moveTo(x + 18, y); ctx.lineTo(x, y + 18); ctx.stroke();
  }
}

// ---------- feirinha (zona segura) ----------

function desenharFeirinha(ctx, f, M) {
  const q = f.zona;
  const mi = { x: q.x + M.calcada, y: q.y + M.calcada, w: q.w - 2 * M.calcada, h: q.h - 2 * M.calcada };
  ctx.fillStyle = COR.terra;
  ctx.fillRect(mi.x, mi.y, mi.w, mi.h);
  // barracas listradas
  for (const b of f.barracas) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(b.x + 4, b.y + 5, b.w, b.h);
    const c1 = LONAS_FEIRA[b.cor];
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = c1;
    const listra = 10;
    for (let x = b.x; x < b.x + b.w; x += listra * 2) ctx.fillRect(x, b.y, Math.min(listra, b.x + b.w - x), b.h);
    ctx.strokeStyle = ajustarCor(c1, 0.6);
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    // cumeeira
    ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h / 2); ctx.lineTo(b.x + b.w, b.y + b.h / 2); ctx.stroke();
  }
  // tinta verde = zona segura
  ctx.fillStyle = 'rgba(46,196,182,0.14)';
  retArred(ctx, q.x, q.y, q.w, q.h, 15);
  ctx.fill();
  ctx.setLineDash([14, 10]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(46,196,182,0.9)';
  retArred(ctx, q.x + 2, q.y + 2, q.w - 4, q.h - 4, 14);
  ctx.stroke();
  ctx.setLineDash([]);
  // faixa com o nome
  const cx = q.x + q.w / 2;
  const cy = q.y + q.h / 2;
  ctx.fillStyle = '#2ec4b6';
  retArred(ctx, cx - 78, cy - 26, 156, 52, 10);
  ctx.fill();
  ctx.strokeStyle = '#1b1b2f';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = '900 24px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText('FEIRINHA', cx, cy - 6);
  ctx.font = 'bold 12px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = '#1b1b2f';
  ctx.fillText('o rapa não entra aqui', cx, cy + 14);
}

// ---------- praça ----------

function desenharPraca(ctx, p) {
  const z = p.zona;
  ctx.fillStyle = COR.grama;
  ctx.fillRect(z.x, z.y, z.w, z.h);
  // tufos de grama
  const r = rngDe(p.id * 131 + 7);
  ctx.fillStyle = 'rgba(60,110,40,0.35)';
  for (let k = 0; k < 40; k++) {
    ctx.beginPath();
    ctx.arc(z.x + r() * z.w, z.y + r() * z.h, 3 + r() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // calçadão em cruz (pedra portuguesa com ondas)
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  const larg = 44;
  ctx.fillStyle = '#f3efe6';
  ctx.fillRect(z.x, cy - larg / 2, z.w, larg);
  ctx.fillRect(cx - larg / 2, z.y, larg, z.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(z.x, cy - larg / 2, z.w, larg);
  ctx.rect(cx - larg / 2, z.y, larg, z.h);
  ctx.clip();
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = 4;
  for (let o = -1; o <= 1; o += 2) {
    ctx.beginPath();
    for (let x = z.x; x <= z.x + z.w; x += 4) {
      const y = cy + o * 9 + Math.sin(x / 14) * 6;
      if (x === z.x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let y = z.y; y <= z.y + z.h; y += 4) {
      const x = cx + o * 9 + Math.sin(y / 14) * 6;
      if (y === z.y) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  // chafariz
  ctx.fillStyle = '#9a9a9a';
  ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4cc9f0';
  ctx.beginPath(); ctx.arc(cx, cy, 29, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.arc(cx - 8, cy - 8, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9a9a9a';
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
  // bancos
  ctx.fillStyle = '#7a4e2a';
  for (const [bx, by, w, h] of [[cx - 80, cy - 36, 30, 8], [cx + 50, cy + 28, 30, 8], [cx - 36, cy + 52, 8, 30], [cx + 28, cy - 82, 8, 30]]) {
    ctx.fillRect(bx, by, w, h);
  }
  // árvores
  for (const a of p.arvores) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.arc(a.x + 5, a.y + 7, a.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2d6a4f';
    ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#40916c';
    ctx.beginPath(); ctx.arc(a.x - a.r * 0.25, a.y - a.r * 0.25, a.r * 0.65, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#52b788';
    ctx.beginPath(); ctx.arc(a.x - a.r * 0.4, a.y - a.r * 0.4, a.r * 0.3, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- terminal de ônibus ----------

function desenharTerminal(ctx, t) {
  const z = t.zona;
  ctx.fillStyle = COR.terminal;
  ctx.fillRect(z.x, z.y, z.w, z.h);
  ctx.save();
  // desenha sempre "na horizontal"; se o terminal for vertical, gira 90°
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  ctx.translate(cx, cy);
  if (!t.horizontal) ctx.rotate(Math.PI / 2);
  const W = t.horizontal ? z.w : z.h;
  const H = t.horizontal ? z.h : z.w;
  const x0 = -W / 2;
  const y0 = -H / 2;
  // 3 baias com plataformas entre elas
  const baia = H / 3;
  const r = rngDe(t.id * 71 + 3);
  const coresOnibus = ['#e63946', '#2a9d8f', '#3a86ff', '#f77f00'];
  for (let k = 0; k < 3; k++) {
    const by = y0 + k * baia;
    // plataforma (calçada clara)
    ctx.fillStyle = '#d6d2c4';
    ctx.fillRect(x0, by, W, 22);
    // cobertura da plataforma
    ctx.fillStyle = 'rgba(29,111,214,0.55)';
    ctx.fillRect(x0 + 20, by + 2, W - 40, 16);
    // faixa amarela de segurança
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x0, by + 22, W, 3);
    // vagas tracejadas
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    for (let x = x0 + W / 3; x < x0 + W - 5; x += W / 3) { ctx.moveTo(x, by + 28); ctx.lineTo(x, by + baia - 4); }
    ctx.stroke();
    ctx.setLineDash([]);
    // ônibus estacionados (alguns)
    for (let v = 0; v < 3; v++) {
      if (r() < 0.35) continue;
      const ox = x0 + v * (W / 3) + 8;
      const oy = by + 32;
      const ow = W / 3 - 16;
      const oh = Math.min(38, baia - 40);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(ox + 4, oy + 5, ow, oh);
      ctx.fillStyle = '#f1f1f1';
      retArred(ctx, ox, oy, ow, oh, 6);
      ctx.fill();
      ctx.fillStyle = coresOnibus[Math.floor(r() * coresOnibus.length)];
      ctx.fillRect(ox + 4, oy + oh / 2 - 4, ow - 8, 8);
      ctx.fillStyle = '#9fb3c8';
      ctx.fillRect(ox + ow - 10, oy + 4, 6, oh - 8); // para-brisa
      ctx.fillStyle = '#ccc';
      ctx.fillRect(ox + ow * 0.35, oy + 6, 16, 8); // ar-condicionado
    }
  }
  // placa
  ctx.fillStyle = '#1d3557';
  retArred(ctx, -70, y0 + H - 34, 140, 28, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '900 17px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TERMINAL', 0, y0 + H - 20);
  ctx.restore();
}
