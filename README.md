# Camelô.io

Jogo multiplayer de navegador estilo .io com tema de camelô brasileiro: compra no depósito, vende na rua e foge do rapa!

> Em desenvolvimento, por fases. **Fase atual: 1 (base)**: servidor, mapa, movimento, câmera e multiplayer.

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

Dica: para os dois nascerem no mesmo lugar e se verem logo de cara, suba o servidor com um ponto de nascimento fixo (só para testes):

```bash
CAMELO_SPAWN=60,600 npm start
```

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
server/entities/       jogador (e, nas próximas fases, NPCs, rapa, bots...)
shared/config.js       TODOS os números de balanceamento
shared/physics.js      movimento e colisão (servidor + predição do cliente)
public/js/main.js      tela inicial, conexão, loop
public/js/net.js       socket, relógio, interpolação
public/js/render.js    câmera e desenho da cidade (em chunks com cache)
public/js/sprites.js   desenhos dos personagens
public/js/hud.js       minimapa e informações
public/js/input.js     teclado
```

No console do navegador, `window.__camelo` expõe o estado local para depuração.
