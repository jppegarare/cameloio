// =============================================================
// Física compartilhada: o MESMO código roda no servidor (autoritativo)
// e no cliente (predição do próprio movimento). Como as contas são
// idênticas, a predição bate com o servidor e quase nunca corrige.
// =============================================================

import { CONFIG } from './config.js';

// ---------- Grade de colisão (hash espacial simples) ----------

// Cria uma grade onde cada célula guarda os retângulos (prédios) que a tocam.
export function criarGradeColisao(retangulos, largura, altura, tamanhoCelula = CONFIG.mapa.celulaColisao) {
  const colunas = Math.ceil(largura / tamanhoCelula);
  const linhas = Math.ceil(altura / tamanhoCelula);
  const celulas = Array.from({ length: colunas * linhas }, () => []);
  for (const r of retangulos) {
    const c0 = Math.max(0, Math.floor(r.x / tamanhoCelula));
    const c1 = Math.min(colunas - 1, Math.floor((r.x + r.w) / tamanhoCelula));
    const l0 = Math.max(0, Math.floor(r.y / tamanhoCelula));
    const l1 = Math.min(linhas - 1, Math.floor((r.y + r.h) / tamanhoCelula));
    for (let l = l0; l <= l1; l++) {
      for (let c = c0; c <= c1; c++) celulas[l * colunas + c].push(r);
    }
  }
  return { celulas, colunas, linhas, tamanhoCelula, largura, altura };
}

// Chama fn(ret) para cada retângulo perto do círculo (x, y, raio).
export function paraCadaRetPerto(grade, x, y, raio, fn) {
  const t = grade.tamanhoCelula;
  const c0 = Math.max(0, Math.floor((x - raio) / t));
  const c1 = Math.min(grade.colunas - 1, Math.floor((x + raio) / t));
  const l0 = Math.max(0, Math.floor((y - raio) / t));
  const l1 = Math.min(grade.linhas - 1, Math.floor((y + raio) / t));
  for (let l = l0; l <= l1; l++) {
    for (let c = c0; c <= c1; c++) {
      const lista = grade.celulas[l * grade.colunas + c];
      for (let i = 0; i < lista.length; i++) fn(lista[i]);
    }
  }
}

// Empurra o círculo pra fora de qualquer prédio e pra dentro do mapa.
// Altera ent.x / ent.y diretamente.
export function resolverColisao(ent, raio, grade) {
  for (let iter = 0; iter < 2; iter++) {
    paraCadaRetPerto(grade, ent.x, ent.y, raio, (r) => {
      // ponto do retângulo mais próximo do centro do círculo
      const px = ent.x < r.x ? r.x : ent.x > r.x + r.w ? r.x + r.w : ent.x;
      const py = ent.y < r.y ? r.y : ent.y > r.y + r.h ? r.y + r.h : ent.y;
      const dx = ent.x - px;
      const dy = ent.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 >= raio * raio) return;
      if (d2 > 1e-9) {
        // centro fora do retângulo: empurra na direção da normal
        const d = Math.sqrt(d2);
        const empurra = raio - d;
        ent.x += (dx / d) * empurra;
        ent.y += (dy / d) * empurra;
      } else {
        // centro DENTRO do retângulo: sai pelo lado mais próximo
        const esq = ent.x - r.x;
        const dir = r.x + r.w - ent.x;
        const cim = ent.y - r.y;
        const bai = r.y + r.h - ent.y;
        const m = Math.min(esq, dir, cim, bai);
        if (m === esq) ent.x = r.x - raio;
        else if (m === dir) ent.x = r.x + r.w + raio;
        else if (m === cim) ent.y = r.y - raio;
        else ent.y = r.y + r.h + raio;
      }
    });
  }
  // limites do mapa
  if (ent.x < raio) ent.x = raio;
  if (ent.y < raio) ent.y = raio;
  if (ent.x > grade.largura - raio) ent.x = grade.largura - raio;
  if (ent.y > grade.altura - raio) ent.y = grade.altura - raio;
}

// ---------- Movimento do camelô ----------

// Garante que a direção tem comprimento no máximo 1 (anti-trapaça e
// normaliza diagonal do teclado).
export function normalizarDirecao(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { dx: 0, dy: 0 };
  const len = Math.hypot(dx, dy);
  if (len > 1) return { dx: dx / len, dy: dy / len };
  return { dx, dy };
}

// Velocidade atual do camelô, dependendo do estado dele.
// (Nas próximas fases entram: carrinho cheio, tênis, atordoado...)
export function velocidadeJogador(_estado) {
  return CONFIG.jogador.velocidade;
}

// Um passo fixo de movimento (dt = 1 / tickRate). Altera estado.x/y/angulo.
export function passoMovimento(estado, dx, dy, dt, grade) {
  const dir = normalizarDirecao(dx, dy);
  if (dir.dx === 0 && dir.dy === 0) return;
  const v = velocidadeJogador(estado);
  estado.x += dir.dx * v * dt;
  estado.y += dir.dy * v * dt;
  estado.angulo = Math.atan2(dir.dy, dir.dx);
  resolverColisao(estado, CONFIG.jogador.raio, grade);
}

// Verdadeiro se o ponto está dentro do retângulo
export function dentroRet(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
