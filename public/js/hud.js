// =============================================================
// HUD: dinheiro, carrinho, ranking, avisos, menu do depósito,
// minimapa e informações de conexão.
// =============================================================

import { CONFIG } from '/shared/config.js';
import { ITENS, totalCarrinho, formatarDinheiro, itemDisponivel, centavos } from '/shared/economia.js';
import { iconeURL } from './sprites.js';

const CORES_MINI = {
  rua: '#3a3d44',
  predios: '#8d8478',
  deposito: '#ffd23f',
  feirinha: '#2ec4b6',
  praca: '#5a9e44',
  terminal: '#6d9dc5',
};

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.raiz = $('hud');
    this.info = $('hud-info');
    this.mini = $('minimapa');
    this.ctxMini = this.mini.getContext('2d');
    this.elDinheiro = $('hud-dinheiro');
    this.elCarrinhoTexto = $('hud-carrinho-texto');
    this.elCarrinhoBarra = $('hud-carrinho-barra');
    this.elCarrinhoItens = $('hud-carrinho-itens');
    this.elRanking = $('hud-ranking-lista');
    this.elAvisos = $('hud-avisos');
    this.elMenu = $('menu-deposito');
    this.elMenuItens = $('menu-itens');
    this.elMenuResumo = $('menu-resumo');
    this.fundoMini = null;
    this.textoInfo = '';
    this.fps = 60;
    this.cache = {};             // evita mexer no DOM se nada mudou
    this.aoComprar = null;       // callback(i, q)
    this.menuAberto = false;
    this.montarMenu();
  }

  mostrar() { this.raiz.classList.remove('oculto'); }
  esconder() { this.raiz.classList.add('oculto'); }

  // ---------------- dinheiro e carrinho ----------------

  atualizarEconomia(eu) {
    const chave = eu.dinheiro + '|' + eu.carrinho.join(',') + '|' + eu.capacidade;
    if (chave === this.cache.economia) return;
    const dinheiroAntes = this.cache.dinheiro;
    this.cache.economia = chave;
    this.cache.dinheiro = eu.dinheiro;

    this.elDinheiro.textContent = formatarDinheiro(eu.dinheiro);
    if (dinheiroAntes !== undefined && eu.dinheiro > dinheiroAntes) pulsar(this.elDinheiro, 'pulsa-ganho');

    const total = totalCarrinho(eu.carrinho);
    this.elCarrinhoTexto.textContent = `${total}/${eu.capacidade}`;
    this.elCarrinhoBarra.style.width = `${Math.min(100, (total / eu.capacidade) * 100)}%`;
    this.elCarrinhoBarra.classList.toggle('cheio', total >= eu.capacidade);

    // chips com ícone + quantidade de cada item
    this.elCarrinhoItens.replaceChildren(
      ...eu.carrinho.flatMap((q, i) => {
        if (!q) return [];
        const chip = document.createElement('span');
        chip.className = 'chip-item';
        chip.title = ITENS[i].nome;
        const img = document.createElement('img');
        img.src = iconeURL(i, 48);
        img.alt = '';
        chip.append(img, document.createTextNode(q));
        return [chip];
      }),
    );
    this.atualizarMenu(eu);
  }

  // ---------------- ranking ----------------

  atualizarRanking(rank, meuId, minhaPosicao, meuDinheiro, infos) {
    // o seu próprio valor vem do snapshot (mais fresco que o ranking, que é 1x/s)
    const linhas = rank.top.map(([id, din], k) => ({ pos: k + 1, id, din: id === meuId ? meuDinheiro : din }));
    if (minhaPosicao > rank.top.length) linhas.push({ pos: minhaPosicao, id: meuId, din: meuDinheiro, separado: true });
    this.elRanking.replaceChildren(
      ...linhas.map((l) => {
        const li = document.createElement('li');
        if (l.id === meuId) li.className = 'eu';
        if (l.separado) li.classList.add('separado');
        const info = infos.get(l.id);
        const pos = document.createElement('span');
        pos.className = 'pos';
        pos.textContent = l.pos + 'º';
        const nome = document.createElement('span');
        nome.className = 'nome';
        nome.textContent = info?.nome ?? '???';
        if (info?.cor) nome.style.setProperty('--cor', info.cor);
        const din = document.createElement('span');
        din.className = 'din';
        din.textContent = formatarDinheiro(l.din);
        li.append(pos, nome, din);
        return li;
      }),
    );
  }

  // ---------------- avisos (toasts no topo) ----------------

  aviso(texto, tipo = 'info', duracao = 3500) {
    const el = document.createElement('div');
    el.className = `aviso aviso-${tipo}`;
    el.textContent = texto;
    this.elAvisos.append(el);
    while (this.elAvisos.children.length > 3) this.elAvisos.firstChild.remove();
    setTimeout(() => {
      el.classList.add('saindo');
      setTimeout(() => el.remove(), 400);
    }, duracao);
  }

  // ---------------- menu do depósito ----------------

  montarMenu() {
    this.linhasMenu = ITENS.map((item, i) => {
      const li = document.createElement('li');
      li.className = 'linha-item';
      li.innerHTML = `
        <span class="tecla">${i + 1}</span>
        <img alt="">
        <span class="desc"><b></b><small></small></span>
        <span class="tenho"></span>
        <button type="button" data-q="1">+1</button>
        <button type="button" data-q="5">+5</button>
        <button type="button" data-q="999" class="encher">Encher</button>`;
      li.querySelector('img').src = iconeURL(i, 64);
      li.querySelector('b').textContent = item.nome;
      li.querySelector('small').textContent = `paga ${formatarDinheiro(centavos(item.custo))} · vende ${formatarDinheiro(centavos(item.venda))}`;
      for (const b of li.querySelectorAll('button')) {
        b.addEventListener('click', () => this.aoComprar?.(i, Number(b.dataset.q)));
      }
      this.elMenuItens.append(li);
      return li;
    });
  }

  abrirMenu(abrir, eu, evento) {
    if (abrir !== this.menuAberto) {
      this.menuAberto = abrir;
      this.elMenu.classList.toggle('oculto', !abrir);
      this.cache.menu = null;
    }
    this.evento = evento;
    if (abrir) this.atualizarMenu(eu);
  }

  atualizarMenu(eu) {
    if (!this.menuAberto) return;
    const chave = eu.dinheiro + '|' + eu.carrinho.join(',') + '|' + eu.capacidade + '|' + this.evento;
    if (chave === this.cache.menu) return;
    this.cache.menu = chave;
    const livre = eu.capacidade - totalCarrinho(eu.carrinho);
    ITENS.forEach((item, i) => {
      const li = this.linhasMenu[i];
      const disponivel = itemDisponivel(item, this.evento);
      li.classList.toggle('oculto', !disponivel);
      const podeUm = livre > 0 && eu.dinheiro >= centavos(item.custo);
      li.classList.toggle('sem-grana', !podeUm);
      li.querySelector('.tenho').textContent = eu.carrinho[i] ? `tem ${eu.carrinho[i]}` : '';
      for (const b of li.querySelectorAll('button')) b.disabled = !podeUm;
    });
    this.elMenuResumo.textContent = livre > 0
      ? `Cabe mais ${livre} no carrinho · ${formatarDinheiro(eu.dinheiro)} no bolso`
      : 'Carrinho lotado! Bora vender!';
  }

  // ---------------- minimapa ----------------

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

function pulsar(el, classe) {
  el.classList.remove(classe);
  void el.offsetWidth; // reinicia a animação CSS
  el.classList.add(classe);
}
