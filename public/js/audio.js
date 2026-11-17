// =============================================================
// Sons gerados na hora com Web Audio API (nenhum arquivo de áudio).
// O AudioContext só pode nascer depois de um clique/toque do jogador.
// =============================================================

export class Som {
  constructor() {
    this.ctx = null;
    this.mestre = null;
    this.mudo = lerMudo();
  }

  // Chamar num gesto do usuário (clique em "Bora vender!")
  iniciar() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.mestre = this.ctx.createGain();
    this.mestre.gain.value = this.mudo ? 0 : 0.5;
    this.mestre.connect(this.ctx.destination);
  }

  alternarMudo() {
    this.mudo = !this.mudo;
    if (this.mestre) this.mestre.gain.value = this.mudo ? 0 : 0.5;
    try { localStorage.setItem('camelo.mudo', this.mudo ? '1' : '0'); } catch { /* ok */ }
    return this.mudo;
  }

  get pronto() {
    return this.ctx && !this.mudo && this.ctx.state === 'running';
  }

  // Tom simples com envelope (ataque rápido, decaimento exponencial)
  tom(freq, inicio, dur, tipo = 'sine', volume = 0.3, freqFim = null) {
    const c = this.ctx;
    const t = c.currentTime + inicio;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t);
    if (freqFim) osc.frequency.exponentialRampToValueAtTime(freqFim, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.mestre);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Ruído curto (o "cha" do cha-ching)
  ruido(inicio, dur, volume = 0.2, filtroFreq = 3000) {
    const c = this.ctx;
    const t = c.currentTime + inicio;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filtro = c.createBiquadFilter();
    filtro.type = 'highpass';
    filtro.frequency.value = filtroFreq;
    const g = c.createGain();
    g.gain.value = volume;
    src.connect(filtro).connect(g).connect(this.mestre);
    src.start(t);
  }

  // ---------- efeitos do jogo ----------

  chaChing() {
    if (!this.pronto) return;
    this.ruido(0, 0.08, 0.25, 2500);
    this.tom(1568, 0.07, 0.5, 'triangle', 0.25);
    this.tom(2093, 0.1, 0.6, 'sine', 0.2);
    this.tom(3136, 0.1, 0.3, 'sine', 0.08);
  }

  compra() {
    if (!this.pronto) return;
    this.tom(520, 0, 0.12, 'square', 0.08, 300);
    this.tom(780, 0.05, 0.1, 'sine', 0.15);
  }

  erro() {
    if (!this.pronto) return;
    this.tom(180, 0, 0.18, 'square', 0.1, 120);
  }

  pix() {
    if (!this.pronto) return;
    [660, 880, 1320].forEach((f, k) => this.tom(f, k * 0.08, 0.2, 'sine', 0.2));
  }

  buzina() {
    if (!this.pronto) return;
    this.tom(330, 0, 0.25, 'sawtooth', 0.07);
    this.tom(392, 0, 0.25, 'sawtooth', 0.05);
    this.tom(330, 0.3, 0.35, 'sawtooth', 0.07);
    this.tom(392, 0.3, 0.35, 'sawtooth', 0.05);
  }
}

function lerMudo() {
  try {
    return localStorage.getItem('camelo.mudo') === '1';
  } catch {
    return false;
  }
}
