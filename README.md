# Camelô.io

Jogo multiplayer de navegador estilo .io com tema de camelô brasileiro: compra no depósito, vende na rua e foge do rapa!

> Em desenvolvimento, por fases. **Fase atual: 2 (economia)**: depósitos, mercadorias, clientes, vendas, dinheiro e ranking.

## Como jogar

- **Andar:** WASD ou setas.
- **Comprar:** pare na área amarela de um **depósito** (`$` no minimapa). Abre o menu: clique em **+1 / +5 / Encher** ou use as teclas **1–8** (com **Shift** compra 5).
- **Vender:** clientes com um **balão** querem aquele item. Chegue perto (com o item no carrinho) que eles vêm até você; fique perto ~1 s e a venda sai sozinha.
- Na **feirinha** (zona verde) os clientes pagam 20% menos.
- De tempos em tempos chega **ônibus no terminal** com um monte de freguês.
- Quebrou (sem dinheiro e carrinho vazio)? Em alguns segundos a tia manda um PIX.
- O **ranking** (top 10 por dinheiro) fica no canto superior direito.

## Como rodar

Requer **Node.js 20+**.

```bash
npm install
npm start
```

Abra <http://localhost:3000>. A porta pode ser trocada com a variável `PORT`:

```bash
PORT=8080 npm start
```

Para desenvolvimento (reinicia o servidor ao salvar arquivos):

```bash
npm run dev
```

### Testar o multiplayer

Abra duas abas (ou dois navegadores) em `http://localhost:3000`, entre com nomes diferentes e ande com **WASD** ou **setas**. Cada aba vê o outro camelô se mexendo.

Variáveis só para testes:

- `CAMELO_SPAWN=x,y` faz todo mundo nascer no mesmo ponto, por exemplo `CAMELO_SPAWN=60,600 npm start`.
- `CAMELO_SEMENTE=12345` fixa o mapa. Com essa semente há um depósito em `300,860`, então dá pra nascer direto nele com `CAMELO_SEMENTE=12345 CAMELO_SPAWN=300,860 npm start`.

### Testar no celular (mesma rede Wi-Fi)

Ao subir, o servidor mostra o endereço na rede local, por exemplo:

```
  Local:   http://localhost:3000
  Na rede: http://192.168.0.15:3000   (celular no mesmo Wi-Fi)
```

Abra o endereço "Na rede" no navegador do celular. Se não abrir, libere a porta no firewall do computador. (Os controles touch chegam na fase 6.)

## Arquitetura

- **Servidor autoritativo** (`server/`): Express serve os arquivos e Socket.io cuida da rede. O cliente manda só inputs; o servidor simula a 30 Hz e envia snapshots a 20 Hz, cada um só com as entidades perto da câmera daquele jogador (culling).
- **Cliente** (`public/`): Canvas e ES modules puros, sem bundler. Os outros jogadores são **interpolados** (desenhados ~100 ms no passado); o próprio movimento é **predito** com a mesma física do servidor (`shared/physics.js`) e reconciliado a cada snapshot.
- **Balanceamento** em `shared/config.js`, importado pelo servidor e pelo cliente.

```
server/index.js        Express + Socket.io
server/game.js         loop, estado do mundo, snapshots
server/map.js          geração da cidade (quarteirões, depósitos, feirinha, praças, terminal)
server/entities/       player.js (camelô), client.js (cliente NPC)
shared/config.js       TODOS os números de balanceamento (preços, clientes, ranking...)
shared/physics.js      movimento e colisão (servidor + predição do cliente)
shared/economia.js     dinheiro (em centavos), carrinho, formatação
public/js/main.js      tela inicial, conexão, loop
public/js/net.js       socket, relógio, interpolação
public/js/render.js    câmera e desenho da cidade (em chunks com cache)
public/js/sprites.js   desenhos dos personagens
public/js/hud.js       dinheiro, carrinho, ranking, avisos, menu do depósito, minimapa
public/js/audio.js     sons gerados com Web Audio (cha-ching, compra, PIX, buzina)
public/js/input.js     teclado
```

No console do navegador, `window.__camelo` expõe o estado local para depuração.
