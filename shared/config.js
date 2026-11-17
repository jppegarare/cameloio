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
  // Economia
  // ---------------------------------------------------------
  economia: {
    dinheiroInicial: 20,      // R$ ao entrar
    capacidadeInicial: 10,    // itens no carrinho
    descontoFeirinha: 0.2,    // na feirinha os clientes pagam 20% menos
    compraMaxPorPedido: 50,   // itens por clique de compra (limite de segurança)
    toleranciaDeposito: 12,   // px fora da zona amarela que ainda contam como "no depósito"
    // Falido (sem grana pro item mais barato e carrinho vazio)? A tia manda um PIX.
    auxilioValor: 5,
    auxilioEspera: 6,         // segundos falido até o PIX chegar
  },

  // Mercadorias. A ORDEM importa: o índice é o código usado na rede.
  // procura = peso no sorteio do desejo dos clientes
  // soNoEvento = só aparece (no depósito e nos desejos) durante esse evento
  itens: [
    { id: 'agua', nome: 'Água gelada', custo: 1, venda: 3, procura: 1.4 },
    { id: 'chip', nome: 'Chip de celular', custo: 2, venda: 5, procura: 1.2 },
    { id: 'pano', nome: 'Pano de prato', custo: 3, venda: 7, procura: 1.0 },
    { id: 'capinha', nome: 'Capinha de celular', custo: 5, venda: 12, procura: 1.0 },
    { id: 'carregador', nome: 'Carregador', custo: 6, venda: 15, procura: 0.9 },
    { id: 'fone', nome: 'Fone de ouvido', custo: 8, venda: 20, procura: 0.8 },
    { id: 'guardachuva', nome: 'Guarda-chuva', custo: 10, venda: 18, procura: 0.5 },
    { id: 'camisa', nome: 'Camisa amarela', custo: 15, venda: 35, procura: 1.2, soNoEvento: 'jogoDoBrasil' },
  ],

  // ---------------------------------------------------------
  // Clientes (NPCs)
  // ---------------------------------------------------------
  clientes: {
    minimo: 50,               // quantidade alvo = minimo + porCamelo * camelôs (até o máximo)
    porCamelo: 6,
    maximo: 160,
    nascimentosPorSegundo: 4, // repovoamento suave
    chanceDesejo: 0.6,        // chance de nascer querendo algum item
    raio: 12,
    velocidade: 55,           // passeando pela calçada
    velocidadeIndo: 95,       // indo até um camelô
    raioAtracao: 230,         // camelô com o item a menos disso atrai o cliente
    desistencia: 1.4,         // larga o camelô se ele ficar além de raioAtracao * isso
    raioVenda: 46,            // distância (centro a centro) pra venda rolar
    tempoVenda: 1.0,          // segundos perto pra venda acontecer
    vidaMin: 70,              // segundos até ir embora sozinho
    vidaMax: 130,
    tempoZonaMin: 8,          // tempo passeando dentro da praça/terminal antes de sair pra calçada
    tempoZonaMax: 25,
    tempoSaindo: 1.2,         // segundos sumindo (fade) ao ir embora
    pesoNascerCalcada: 0.4,   // onde nascem (pesos)
    pesoNascerPraca: 0.45,
    pesoNascerTerminal: 0.15,
    intervaloIA: 0.1,         // segundos entre buscas de camelô
    // Pico do terminal: chega um ônibus cheio de cliente
    picoIntervaloMin: 45,
    picoIntervaloMax: 80,
    picoQuantidade: 10,
    picoChanceDesejo: 0.85,
  },

  ranking: {
    tamanho: 10,              // top N
    intervalo: 1000,          // ms entre atualizações
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
