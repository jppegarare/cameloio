// =============================================================
// Cliente (NPC). Passeia pelas calçadas (grafo de esquinas) ou dentro
// de praças/terminal. Se tem um desejo e um camelô com aquele item
// chega perto, vai até ele; ficando perto por um tempo, compra.
// =============================================================

import { CONFIG } from '../../shared/config.js';
import { resolverColisao } from '../../shared/physics.js';

const CC = CONFIG.clientes;

// Estados (o número é o código enviado pro cliente)
export const PASSEANDO = 0;
export const INDO = 1;        // indo até um camelô
export const COMPRANDO = 2;   // só na rede: INDO + perto o bastante (timer rodando)
export const SATISFEITO = 3;  // comprou, vai sumindo feliz
export const INDO_EMBORA = 4; // cansou de passear, vai sumindo

const aleatorio = (a, b) => a + Math.random() * (b - a);

export class Cliente {
  /**
   * @param modo 'grafo' (na calçada, começa no nó `no`) ou 'zona' (passeando dentro de `zona`)
   */
  constructor(id, x, y, desejo, opcoes = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.desejo = desejo;          // índice do item ou -1
    this.estado = PASSEANDO;
    this.alvoId = 0;               // id do camelô que ele está indo
    this.timerVenda = 0;
    this.vida = aleatorio(CC.vidaMin, CC.vidaMax);
    this.timerSaindo = 0;
    this.remover = false;

    // navegação
    this.modo = opcoes.modo || 'grafo';
    this.zona = opcoes.zona || null;          // retângulo quando modo = 'zona'
    this.tempoZona = aleatorio(CC.tempoZonaMin, CC.tempoZonaMax);
    this.noDestino = opcoes.no ?? null;       // nó do grafo pra onde está indo
    this.noAnterior = null;
    this.destino = null;                      // ponto livre (modo 'zona' / 'livre')
    this.melhorDist = Infinity;               // detecção de "travou"
    this.tempoSemProgresso = 0;
  }

  // Código de estado + progresso da compra (0..10) que vai na rede
  estadoRede() {
    if (this.estado === INDO && this.timerVenda > 0) return COMPRANDO;
    return this.estado;
  }

  progressoRede() {
    if (this.estado === INDO) return Math.min(10, Math.round((this.timerVenda / CC.tempoVenda) * 10));
    if (this.estado === SATISFEITO || this.estado === INDO_EMBORA) {
      return Math.max(0, Math.round((this.timerSaindo / CC.tempoSaindo) * 10));
    }
    return 0;
  }

  irEmbora(feliz) {
    this.estado = feliz ? SATISFEITO : INDO_EMBORA;
    this.timerSaindo = CC.tempoSaindo;
    this.alvoId = 0;
    this.timerVenda = 0;
  }

  // Volta a passear depois de largar um camelô (anda até a esquina mais próxima)
  voltarAPassear(jogo) {
    this.estado = PASSEANDO;
    this.alvoId = 0;
    this.timerVenda = 0;
    this.modo = 'livre';
    const no = jogo.noMaisProximo(this.x, this.y);
    this.noDestino = no.id;
    this.destino = { x: no.x, y: no.y };
    this.melhorDist = Infinity;
    this.tempoSemProgresso = 0;
  }

  // Anda em direção a (tx, ty). Retorna true se chegou.
  moverPara(tx, ty, vel, dt, grade) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const passo = vel * dt;
    if (d <= passo) {
      this.x = tx;
      this.y = ty;
    } else {
      this.x += (dx / d) * passo;
      this.y += (dy / d) * passo;
    }
    if (grade) resolverColisao(this, CC.raio, grade);
    return d <= passo + 0.5;
  }

  atualizar(dt, jogo) {
    if (this.estado === SATISFEITO || this.estado === INDO_EMBORA) {
      this.timerSaindo -= dt;
      if (this.timerSaindo <= 0) this.remover = true;
      this.passear(dt * 0.6, jogo); // vai saindo devagarinho
      return;
    }

    this.vida -= dt;
    if (this.vida <= 0 && this.estado === PASSEANDO) {
      this.irEmbora(false);
      return;
    }

    if (this.estado === INDO) {
      this.irAteCamelo(dt, jogo);
      return;
    }
    this.passear(dt, jogo);
  }

  irAteCamelo(dt, jogo) {
    const j = jogo.jogadores.get(this.alvoId);
    if (!j || !jogo.podeAtender(j, this.desejo)) {
      this.voltarAPassear(jogo);
      return;
    }
    const d = Math.hypot(j.x - this.x, j.y - this.y);
    if (d > jogo.raioAtracao(j) * CC.desistencia) {
      this.voltarAPassear(jogo);
      return;
    }
    // chega até ficar colado no carrinho, sem entrar no camelô
    const parada = CONFIG.jogador.raio + CC.raio + 4;
    if (d > parada) {
      const f = (d - parada) / d;
      this.moverPara(this.x + (j.x - this.x) * f, this.y + (j.y - this.y) * f, CC.velocidadeIndo, dt, jogo.grade);
    }
    if (d <= CC.raioVenda) {
      this.timerVenda += dt;
      if (this.timerVenda >= CC.tempoVenda) jogo.realizarVenda(this, j);
    } else {
      this.timerVenda = Math.max(0, this.timerVenda - dt * 2);
    }
  }

  passear(dt, jogo) {
    const vel = CC.velocidade;

    if (this.modo === 'zona') {
      this.tempoZona -= dt;
      if (!this.destino) this.destino = pontoNaZona(this.zona);
      if (this.moverPara(this.destino.x, this.destino.y, vel, dt, jogo.grade)) {
        this.destino = this.tempoZona > 0 ? pontoNaZona(this.zona) : null;
        if (this.tempoZona <= 0) {
          // hora de sair pra calçada
          const no = jogo.noMaisProximo(this.x, this.y);
          this.modo = 'livre';
          this.noDestino = no.id;
          this.destino = { x: no.x, y: no.y };
        }
      }
      return;
    }

    if (this.modo === 'livre') {
      const chegou = this.moverPara(this.destino.x, this.destino.y, vel, dt, jogo.grade);
      if (chegou) {
        this.modo = 'grafo';
        this.destino = null;
        return;
      }
      // travou em alguma quina? desiste e vai embora
      const d = Math.hypot(this.destino.x - this.x, this.destino.y - this.y);
      if (d < this.melhorDist - 1) {
        this.melhorDist = d;
        this.tempoSemProgresso = 0;
      } else if ((this.tempoSemProgresso += dt) > 3 && this.estado === PASSEANDO) {
        this.irEmbora(false);
      }
      return;
    }

    // modo 'grafo': de esquina em esquina
    const nos = jogo.grafo;
    if (this.noDestino === null) this.noDestino = jogo.noMaisProximo(this.x, this.y).id;
    const alvo = nos[this.noDestino];
    if (this.moverPara(alvo.x, alvo.y, vel, dt, null)) {
      // escolhe a próxima esquina (evita voltar pra de onde veio)
      let opcoes = alvo.viz.filter((v) => v !== this.noAnterior);
      if (!opcoes.length) opcoes = alvo.viz;
      this.noAnterior = alvo.id;
      this.noDestino = opcoes[Math.floor(Math.random() * opcoes.length)];
    }
  }
}

function pontoNaZona(z) {
  const m = 16;
  return { x: z.x + m + Math.random() * (z.w - 2 * m), y: z.y + m + Math.random() * (z.h - 2 * m) };
}
