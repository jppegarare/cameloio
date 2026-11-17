// =============================================================
// HUD: minimapa e informações de conexão.
// (Dinheiro, carrinho, ranking, alertas e feed entram nas próximas fases.)
// =============================================================

import { CONFIG } from '/shared/config.js';

const CORES_MINI = {
  rua: '#3a3d44',
  predios: '#8d8478',
  deposito: '#ffd23f',
  feirinha: '#2ec4b6',
  praca: '#5a9e44',
  terminal: '#6d9dc5',
};

export class Hud {
  constructor() {
    this.raiz = document.getElementById('hud');
    this.info = document.getElementById('hud-info');
    this.mini = document.getElementById('minimapa');
    this.ctxMini = this.mini.getContext('2d');
    this.fundoMini = null;
    this.textoInfo = '';
    this.fps = 60;
  }

  mostrar() { this.raiz.classList.remove('oculto'); }
  esconder() { this.raiz.classList.add('oculto'); }

  // Pré-desenha o minimapa (ruas, quarteirões, depósitos, feirinhas)
  prepararMinimapa(mapa) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const lado = CONFIG.minimapa.tamanho;
    this.mini.width = Math.round(lado * dpr);
    this.mini.height = Math.round(lado * dpr);
    this.mini.style.width = lado + 'px';
    this.mini.style.height = lado + 'px';
    this.escalaMini = this.mini.width / Math.max(mapa.largura, mapa.altura);
    this.mapa = mapa;

    const fundo = document.createElement('canvas');
    fundo.width = this.mini.width;
    fundo.height = this.mini.height;
    const c = fundo.getContext('2d');
    const s = this.escalaMini;
    c.fillStyle = CORES_MINI.rua;
    c.fillRect(0, 0, fundo.width, fundo.height);
    for (const q of mapa.quarteiroes) {
      c.fillStyle = CORES_MINI[q.tipo] || CORES_MINI.predios;
      c.fillRect(q.x * s, q.y * s, q.w * s, q.h * s);
    }
    // ícone "$" nos depósitos
    c.fillStyle = '#1b1b2f';
    c.font = `900 ${Math.round(14 * dpr)}px "Trebuchet MS", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const d of mapa.depositos) {
      const z = d.zona;
      c.fillText('$', (z.x + z.w / 2) * s, (z.y + z.h / 2) * s);
    }
    this.fundoMini = fundo;
  }

  // Desenha o minimapa com a posição do jogador local
  desenharMinimapa(local, visao) {
    if (!this.fundoMini) return;
    const c = this.ctxMini;
    const s = this.escalaMini;
    c.drawImage(this.fundoMini, 0, 0);
    // retângulo da área visível
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 1;
    c.strokeRect((local.camX - visao.mw) * s, (local.camY - visao.mh) * s, visao.mw * 2 * s, visao.mh * 2 * s);
    // você: setinha na direção que está andando
    const x = local.x * s;
    const y = local.y * s;
    const r = 6 * (this.mini.width / CONFIG.minimapa.tamanho);
    c.save();
    c.translate(x, y);
    c.rotate(local.angulo);
    c.fillStyle = local.cor;
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(r * 1.3, 0);
    c.lineTo(-r, r * 0.9);
    c.lineTo(-r * 0.5, 0);
    c.lineTo(-r, -r * 0.9);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  atualizarInfo(online, ping, dt) {
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    const texto = `${online} camelô${online === 1 ? '' : 's'} na rua · ping ${ping} ms · ${Math.round(this.fps)} fps`;
    if (texto !== this.textoInfo) {
      this.textoInfo = texto;
      this.info.textContent = texto;
    }
  }
}
