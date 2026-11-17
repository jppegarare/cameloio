// =============================================================
// Camelô.io — servidor HTTP (Express) + WebSocket (Socket.io)
// =============================================================

import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { CONFIG } from '../shared/config.js';
import { Jogo } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');
const PORTA = Number(process.env.PORT) || CONFIG.servidor.portaPadrao;

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(raiz, 'public')));
app.use('/shared', express.static(path.join(raiz, 'shared')));
app.get('/saude', (_req, res) => res.json({ ok: true }));

const servidor = http.createServer(app);
const io = new Server(servidor, {
  serveClient: true,          // serve /socket.io/socket.io.esm.min.js
  pingInterval: 10000,
  pingTimeout: 8000,
  maxHttpBufferSize: 1e4,     // mensagens do cliente são minúsculas
});

const jogo = new Jogo(io);
jogo.iniciar();

io.on('connection', (socket) => {
  let jogador = null;

  socket.on('entrar', (dados) => {
    if (jogador) return; // já está jogando
    jogador = jogo.entrar(socket, dados || {});
  });

  socket.on('i', (input) => {
    if (jogador) jogo.input(jogador, input);
  });

  socket.on('visao', (v) => {
    if (jogador && v) jogador.definirVisao(Number(v.mw), Number(v.mh));
  });

  // usado pelo cliente pra medir o ping
  socket.on('ping-jogo', (cb) => {
    if (typeof cb === 'function') cb();
  });

  socket.on('disconnect', () => {
    if (jogador) jogo.sair(jogador);
    jogador = null;
  });
});

servidor.listen(PORTA, () => {
  console.log(`\n  Camelô.io rodando!`);
  console.log(`  Local:   http://localhost:${PORTA}`);
  for (const ip of ipsLocais()) console.log(`  Na rede: http://${ip}:${PORTA}   (celular no mesmo Wi-Fi)`);
  console.log('');
});

function ipsLocais() {
  const ips = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
    }
  }
  return ips;
}

// desligamento limpo (Ctrl+C / plataforma de hospedagem)
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => {
    jogo.parar();
    io.close();
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
