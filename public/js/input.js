// =============================================================
// Entrada do jogador: teclado (WASD / setas).
// Controles touch (joystick virtual) entram na fase 6.
// =============================================================

const TECLAS_CIMA = ['KeyW', 'ArrowUp'];
const TECLAS_BAIXO = ['KeyS', 'ArrowDown'];
const TECLAS_ESQ = ['KeyA', 'ArrowLeft'];
const TECLAS_DIR = ['KeyD', 'ArrowRight'];
const TECLAS_JOGO = new Set([...TECLAS_CIMA, ...TECLAS_BAIXO, ...TECLAS_ESQ, ...TECLAS_DIR, 'Space']);

export class Entrada {
  constructor() {
    this.apertadas = new Set();
    this.ativo = false;

    window.addEventListener('keydown', (e) => {
      if (!this.ativo) return;
      if (TECLAS_JOGO.has(e.code)) e.preventDefault();
      this.apertadas.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.apertadas.delete(e.code);
    });
    // se a janela perde o foco, solta tudo (senão o camelô sai andando sozinho)
    window.addEventListener('blur', () => this.apertadas.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.apertadas.clear();
    });
  }

  algum(lista) {
    for (const t of lista) if (this.apertadas.has(t)) return true;
    return false;
  }

  // Direção desejada. Valores crus (-1, 0, 1); a normalização da diagonal
  // é feita na física compartilhada, igual no cliente e no servidor.
  direcao() {
    let dx = 0;
    let dy = 0;
    if (this.algum(TECLAS_ESQ)) dx -= 1;
    if (this.algum(TECLAS_DIR)) dx += 1;
    if (this.algum(TECLAS_CIMA)) dy -= 1;
    if (this.algum(TECLAS_BAIXO)) dy += 1;
    return { dx, dy };
  }
}
