// =============================================================
// Geração da cidade: grade de quarteirões separados por ruas.
// Cada quarteirão tem calçada em volta e um "miolo" que pode ser:
//   predios  -> 1, 2 ou 4 prédios (bloqueiam passagem)
//   deposito -> galpão + pátio onde se compra mercadoria
//   feirinha -> zona segura (rapa não entra)
//   praca    -> área verde, concentra clientes
//   terminal -> terminal de ônibus, picos de clientes
// O mapa é gerado uma vez no servidor e enviado ao cliente no 'init'.
// =============================================================

import { CONFIG, LARGURA_MAPA, ALTURA_MAPA } from '../shared/config.js';

// Gerador pseudoaleatório com semente (mulberry32)
export function criarRng(semente) {
  let a = semente >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LADOS = ['baixo', 'cima', 'esquerda', 'direita'];

export function gerarMapa(sementeEntrada) {
  const c = CONFIG.mapa;
  const semente = sementeEntrada || ((Math.random() * 2 ** 31) | 0) || 1;
  const rng = criarRng(semente);
  const inteiro = (n) => Math.floor(rng() * n);
  const passo = c.quarteirao + c.rua;

  // ---- quarteirões ----
  const quarteiroes = [];
  for (let j = 0; j < c.linhas; j++) {
    for (let i = 0; i < c.colunas; i++) {
      quarteiroes.push({
        id: quarteiroes.length,
        i, j,
        x: c.rua + i * passo,
        y: c.rua + j * passo,
        w: c.quarteirao,
        h: c.quarteirao,
        tipo: 'predios',
      });
    }
  }
  const livres = () => quarteiroes.filter((q) => q.tipo === 'predios');
  const dist = (a, b) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j);
  const longeDe = (q, tipo, min) => quarteiroes.every((o) => o.tipo !== tipo || dist(o, q) >= min);

  // ---- depósitos: um por quadrante ----
  const meioI = c.colunas / 2;
  const meioJ = c.linhas / 2;
  const quadrantes = [
    (q) => q.i < meioI && q.j < meioJ,
    (q) => q.i >= meioI && q.j < meioJ,
    (q) => q.i < meioI && q.j >= meioJ,
    (q) => q.i >= meioI && q.j >= meioJ,
  ];
  // embaralha a ordem dos quadrantes (se forem só 3 depósitos, um fica sem)
  for (let k = quadrantes.length - 1; k > 0; k--) {
    const r = inteiro(k + 1);
    [quadrantes[k], quadrantes[r]] = [quadrantes[r], quadrantes[k]];
  }
  for (let d = 0; d < Math.min(c.depositos, 4); d++) {
    const cand = livres().filter(quadrantes[d]);
    const q = cand[inteiro(cand.length)];
    if (q) q.tipo = 'deposito';
  }

  // ---- terminal: na borda da cidade ----
  for (let t = 0; t < c.terminais; t++) {
    const cand = livres().filter((q) => q.i === 0 || q.j === 0 || q.i === c.colunas - 1 || q.j === c.linhas - 1);
    const q = cand[inteiro(cand.length)];
    if (q) q.tipo = 'terminal';
  }

  // ---- feirinhas: longe uma da outra e dos depósitos ----
  for (let f = 0; f < c.feirinhas; f++) {
    let cand = livres().filter((q) => longeDe(q, 'feirinha', 3) && longeDe(q, 'deposito', 2));
    if (!cand.length) cand = livres();
    const q = cand[inteiro(cand.length)];
    if (q) q.tipo = 'feirinha';
  }

  // ---- praças: a primeira perto do centro ----
  for (let p = 0; p < c.pracas; p++) {
    let cand = livres().filter((q) => longeDe(q, 'praca', 2));
    if (p === 0) {
      const centro = cand.filter((q) => Math.abs(q.i + 0.5 - meioI) <= 1 && Math.abs(q.j + 0.5 - meioJ) <= 1);
      if (centro.length) cand = centro;
    }
    if (!cand.length) cand = livres();
    const q = cand[inteiro(cand.length)];
    if (q) q.tipo = 'praca';
  }

  // ---- geometria de cada quarteirão ----
  const predios = [];      // obstáculos (colisão)
  const depositos = [];
  const feirinhas = [];
  const pracas = [];
  const terminais = [];

  for (const q of quarteiroes) {
    const miolo = { x: q.x + c.calcada, y: q.y + c.calcada, w: q.w - 2 * c.calcada, h: q.h - 2 * c.calcada };
    q.miolo = miolo;

    if (q.tipo === 'predios') {
      const r = rng();
      const novos = [];
      if (r < 0.3) {
        novos.push({ ...miolo });
      } else if (r < 0.65) {
        const corte = 0.4 + rng() * 0.2;
        if (rng() < 0.5) {
          const w1 = Math.round(miolo.w * corte);
          novos.push({ x: miolo.x, y: miolo.y, w: w1, h: miolo.h });
          novos.push({ x: miolo.x + w1, y: miolo.y, w: miolo.w - w1, h: miolo.h });
        } else {
          const h1 = Math.round(miolo.h * corte);
          novos.push({ x: miolo.x, y: miolo.y, w: miolo.w, h: h1 });
          novos.push({ x: miolo.x, y: miolo.y + h1, w: miolo.w, h: miolo.h - h1 });
        }
      } else {
        const w1 = Math.round(miolo.w * (0.4 + rng() * 0.2));
        const h1 = Math.round(miolo.h * (0.4 + rng() * 0.2));
        novos.push({ x: miolo.x, y: miolo.y, w: w1, h: h1 });
        novos.push({ x: miolo.x + w1, y: miolo.y, w: miolo.w - w1, h: h1 });
        novos.push({ x: miolo.x, y: miolo.y + h1, w: w1, h: miolo.h - h1 });
        novos.push({ x: miolo.x + w1, y: miolo.y + h1, w: miolo.w - w1, h: miolo.h - h1 });
      }
      for (const p of novos) {
        p.cor = inteiro(8);          // índice da paleta de telhados (cliente)
        p.estilo = inteiro(4);       // tipo de detalhe no telhado
        p.semente = inteiro(1e6);    // detalhes visuais determinísticos
        p.tipo = 'predio';
        predios.push(p);
      }
    } else if (q.tipo === 'deposito') {
      // galpão de um lado, pátio de compra do outro (virado pra rua)
      const lado = LADOS[inteiro(4)];
      const frac = 0.52;
      let galpao, patio;
      if (lado === 'baixo') {
        galpao = { x: miolo.x, y: miolo.y, w: miolo.w, h: Math.round(miolo.h * frac) };
        patio = { x: miolo.x, y: galpao.y + galpao.h, w: miolo.w, h: miolo.h - galpao.h };
      } else if (lado === 'cima') {
        const h = Math.round(miolo.h * frac);
        galpao = { x: miolo.x, y: miolo.y + miolo.h - h, w: miolo.w, h };
        patio = { x: miolo.x, y: miolo.y, w: miolo.w, h: miolo.h - h };
      } else if (lado === 'direita') {
        galpao = { x: miolo.x, y: miolo.y, w: Math.round(miolo.w * frac), h: miolo.h };
        patio = { x: galpao.x + galpao.w, y: miolo.y, w: miolo.w - galpao.w, h: miolo.h };
      } else {
        const w = Math.round(miolo.w * frac);
        galpao = { x: miolo.x + miolo.w - w, y: miolo.y, w, h: miolo.h };
        patio = { x: miolo.x, y: miolo.y, w: miolo.w - w, h: miolo.h };
      }
      galpao.tipo = 'galpao';
      galpao.lado = lado;
      predios.push(galpao);
      const m = 22;
      const zona = { x: patio.x + m, y: patio.y + m, w: patio.w - 2 * m, h: patio.h - 2 * m };
      depositos.push({ id: depositos.length, quarteirao: q.id, galpao, patio, zona, lado });
    } else if (q.tipo === 'feirinha') {
      // zona segura = quarteirão inteiro (calçada inclusa); barracas são só enfeite
      const barracas = [];
      const nx = 4;
      const ny = 4;
      const ew = miolo.w / nx;
      const eh = miolo.h / ny;
      for (let a = 0; a < ny; a++) {
        for (let b = 0; b < nx; b++) {
          if ((a === 1 || a === 2) && (b === 1 || b === 2)) continue; // corredor no meio
          barracas.push({
            x: Math.round(miolo.x + b * ew + 8),
            y: Math.round(miolo.y + a * eh + 8),
            w: Math.round(ew - 16),
            h: Math.round(eh - 16),
            cor: inteiro(6),
          });
        }
      }
      feirinhas.push({ id: feirinhas.length, quarteirao: q.id, zona: { x: q.x, y: q.y, w: q.w, h: q.h }, barracas });
    } else if (q.tipo === 'praca') {
      const arvores = [];
      const n = 7 + inteiro(5);
      for (let k = 0; k < n; k++) {
        // árvores perto das bordas, deixando o centro livre
        let ax, ay;
        do {
          ax = miolo.x + 20 + rng() * (miolo.w - 40);
          ay = miolo.y + 20 + rng() * (miolo.h - 40);
        } while (Math.abs(ax - (miolo.x + miolo.w / 2)) < 70 && Math.abs(ay - (miolo.y + miolo.h / 2)) < 70);
        arvores.push({ x: Math.round(ax), y: Math.round(ay), r: 16 + inteiro(10) });
      }
      pracas.push({ id: pracas.length, quarteirao: q.id, zona: { ...miolo }, arvores });
    } else if (q.tipo === 'terminal') {
      terminais.push({ id: terminais.length, quarteirao: q.id, zona: { ...miolo }, horizontal: rng() < 0.5 });
    }
  }

  return {
    semente,
    largura: LARGURA_MAPA,
    altura: ALTURA_MAPA,
    rua: c.rua,
    calcada: c.calcada,
    passo,
    quarteiroes: quarteiroes.map(({ id, i, j, x, y, w, h, tipo }) => ({ id, i, j, x, y, w, h, tipo })),
    predios,
    depositos,
    feirinhas,
    pracas,
    terminais,
  };
}

// Ponto aleatório no meio de uma rua (bom pra nascer)
export function pontoAleatorioRua(mapa, rng = Math.random) {
  const c = CONFIG.mapa;
  const passo = mapa.passo;
  const nRuasH = c.linhas + 1;
  const nRuasV = c.colunas + 1;
  const folga = 30;
  if (rng() < 0.5) {
    const k = Math.floor(rng() * nRuasH);
    return {
      x: folga + rng() * (mapa.largura - 2 * folga),
      y: k * passo + folga + rng() * (c.rua - 2 * folga),
    };
  }
  const k = Math.floor(rng() * nRuasV);
  return {
    x: k * passo + folga + rng() * (c.rua - 2 * folga),
    y: folga + rng() * (mapa.altura - 2 * folga),
  };
}

// =============================================================
// Grafo das calçadas: os clientes andam de esquina em esquina.
// Cada quarteirão tem 4 nós (cantos da calçada: 0 sup-esq, 1 sup-dir,
// 2 inf-dir, 3 inf-esq), ligados em anel. Nós de quarteirões vizinhos
// se ligam atravessando a rua pela faixa de pedestre.
// =============================================================
export function gerarGrafoCalcadas(mapa) {
  const c = CONFIG.mapa;
  const meio = mapa.calcada / 2;
  const nos = [];
  const idNo = (i, j, k) => (j * c.colunas + i) * 4 + k;
  for (const q of mapa.quarteiroes) {
    const cantos = [
      [q.x + meio, q.y + meio],
      [q.x + q.w - meio, q.y + meio],
      [q.x + q.w - meio, q.y + q.h - meio],
      [q.x + meio, q.y + q.h - meio],
    ];
    cantos.forEach(([x, y], k) => {
      nos[idNo(q.i, q.j, k)] = { id: idNo(q.i, q.j, k), x, y, quarteirao: q.id, viz: [] };
    });
  }
  const ligar = (a, b) => {
    nos[a].viz.push(b);
    nos[b].viz.push(a);
  };
  for (const q of mapa.quarteiroes) {
    for (let k = 0; k < 4; k++) ligar(idNo(q.i, q.j, k), idNo(q.i, q.j, (k + 1) % 4));
    if (q.i + 1 < c.colunas) {
      ligar(idNo(q.i, q.j, 1), idNo(q.i + 1, q.j, 0));
      ligar(idNo(q.i, q.j, 2), idNo(q.i + 1, q.j, 3));
    }
    if (q.j + 1 < c.linhas) {
      ligar(idNo(q.i, q.j, 3), idNo(q.i, q.j + 1, 0));
      ligar(idNo(q.i, q.j, 2), idNo(q.i, q.j + 1, 1));
    }
  }
  return nos;
}
