// =============================================================
// Funções de economia usadas pelo servidor e pelo cliente.
// Dinheiro trafega e é guardado em CENTAVOS (inteiros), pra não ter
// erro de arredondamento com o desconto da feirinha.
// =============================================================

import { CONFIG } from './config.js';

export const ITENS = CONFIG.itens;
export const N_ITENS = ITENS.length;

export const centavos = (reais) => Math.round(reais * 100);

export function carrinhoVazio() {
  return new Array(N_ITENS).fill(0);
}

export function totalCarrinho(c) {
  let t = 0;
  for (let i = 0; i < c.length; i++) t += c[i];
  return t;
}

// Item pode ser comprado/desejado agora? (camisa só no Jogo do Brasil)
export function itemDisponivel(item, eventoAtivo) {
  return !item.soNoEvento || item.soNoEvento === eventoAtivo;
}

// Resumo visual do carrinho: string de até `slots` dígitos com os
// códigos dos itens, proporcional ao que tem dentro. Ex.: "00113"
// É o que os outros jogadores recebem pra desenhar o seu carrinho.
export function resumoCarga(carrinho, capacidade, slots = 9) {
  const total = totalCarrinho(carrinho);
  if (!total) return '';
  const n = Math.max(1, Math.min(slots, Math.round((slots * total) / Math.max(1, capacidade))));
  const partes = carrinho.map((q, i) => ({ i, exato: (q / total) * n }));
  for (const p of partes) p.base = Math.floor(p.exato);
  let usados = partes.reduce((s, p) => s + p.base, 0);
  // maior resto primeiro (só entre itens que existem no carrinho)
  const ordem = partes.filter((p) => carrinho[p.i] > 0).sort((a, b) => (b.exato - b.base) - (a.exato - a.base));
  for (let k = 0; usados < n && k < ordem.length; k++, usados++) ordem[k].base++;
  let s = '';
  for (const p of partes) s += String(p.i).repeat(p.base);
  return s;
}

// 1234 -> "R$ 12,34" ; 1200 -> "R$ 12"
export function formatarDinheiro(cent) {
  const reais = cent / 100;
  const inteiro = Number.isInteger(reais);
  return 'R$ ' + reais.toLocaleString('pt-BR', {
    minimumFractionDigits: inteiro ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
