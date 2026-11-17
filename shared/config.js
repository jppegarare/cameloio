// =============================================================
// Camelô.io — TODOS os números de balanceamento ficam aqui.
// Este arquivo é importado tanto pelo servidor (Node) quanto pelo
// cliente (navegador), então use só JavaScript puro, sem imports.
// Mudou aqui, mudou no jogo inteiro.
// =============================================================

export const CONFIG = {
  // ---------------------------------------------------------
  // Servidor e rede
  // ---------------------------------------------------------
  servidor: {
    portaPadrao: 3000,        // usada se process.env.PORT não existir
    tickRate: 30,             // simulações por segundo no servidor
    snapshotRate: 20,         // snapshots por segundo enviados aos clientes
    maxJogadores: 60,         // limite de conexões jogando ao mesmo tempo
  },

  rede: {
    atrasoInterpolacao: 100,  // ms: os outros jogadores são desenhados "no passado" pra ficarem suaves
    extrapolacaoMax: 120,     // ms: quanto o cliente pode "chutar" além do último snapshot
    bufferSnapshots: 30,      // quantos snapshots o cliente guarda
    margemCulling: 250,       // px de mundo além da câmera que ainda são enviados
    visaoMaxMeiaLargura: 850, // limite (meia largura) da visão que o servidor aceita do cliente
    visaoMaxMeiaAltura: 850,  // limite (meia altura)
    inputsToleranciaTaxa: 1.3,// servidor aceita até tickRate * isso de inputs por segundo
    inputsBalde: 10,          // rajada máxima de inputs acumulados (lag/jitter)
    erroSnapDistancia: 200,   // se a predição errar mais que isso, teleporta em vez de suavizar
    erroSuavizacao: 0.82,     // fator por frame que o erro visual da predição decai (0..1)
  },

  // ---------------------------------------------------------
  // Mapa (a cidade). Tamanho = colunas * (quarteirao + rua) + rua
  // Com os valores abaixo: 6 * 480 + 120 = 3000 px
  // ---------------------------------------------------------
  mapa: {
    colunas: 6,
    linhas: 6,
    rua: 120,                 // largura das ruas
    quarteirao: 360,          // tamanho de cada quarteirão (inclui a calçada)
    calcada: 26,              // largura da calçada em volta do quarteirão
    semente: 0,               // 0 = aleatória a cada vez que o servidor sobe
    depositos: 4,             // 3 ou 4
    feirinhas: 2,             // 1 ou 2
    pracas: 4,
    terminais: 1,
    celulaColisao: 240,       // tamanho da célula da grade de colisão
  },

  // ---------------------------------------------------------
  // Camelô (jogador)
  // ---------------------------------------------------------
  jogador: {
    raio: 18,                 // raio de colisão
    velocidade: 260,          // px por segundo, carrinho vazio, sem upgrades
    nomeMax: 16,              // caracteres no nome
    // As 6 cores de lona da tela inicial (azul fica reservada pra banca fechada)
    cores: ['#e63946', '#f77f00', '#fcbf49', '#2a9d8f', '#8338ec', '#ff5d8f'],
    nomesAleatorios: [
      'Camelô Anônimo', 'Vendedor Misterioso', 'Mão Leve', 'Rei do Troco',
      'Barão do Pano', 'Lorde do Chip', 'Sem Nota Fiscal', 'Freguês VIP',
    ],
  },

  // ---------------------------------------------------------
  // Câmera e interface
  // ---------------------------------------------------------
  camera: {
    ladoMenorUnidades: 780,   // o lado menor da tela mostra no máximo isso de mundo
    ladoMaiorUnidades: 1400,  // o lado maior da tela mostra no máximo isso de mundo
    tamanhoChunk: 512,        // pedaços do chão pré-desenhados (cache)
    maxChunksCache: 24,
    dprMax: 2,                // limite de devicePixelRatio (desempenho no celular)
  },

  minimapa: {
    tamanho: 170,             // px na tela (lado do quadrado)
  },
};

// Tamanho total do mapa, calculado a partir dos valores acima
export const LARGURA_MAPA = CONFIG.mapa.colunas * (CONFIG.mapa.quarteirao + CONFIG.mapa.rua) + CONFIG.mapa.rua;
export const ALTURA_MAPA = CONFIG.mapa.linhas * (CONFIG.mapa.quarteirao + CONFIG.mapa.rua) + CONFIG.mapa.rua;
