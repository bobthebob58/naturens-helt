// Menyer: hovedmeny med vanskelighetsgrad, pause, butikk, game over og seier.
import { DIFFICULTY, SHOP, WEAPONS, VEHICLES } from '../config.js';
import { formatTime } from '../utils/math.js';
import { LEVELS, BIOMES } from '../levels/levels.js';
import { SPECIES } from '../levels/fauna.js';

const $ = (id) => document.getElementById(id);

const CONTROLS = [
  ['W A S D', 'Gå / styre kjøretøy'],
  ['Shift', 'Løp (helikopter: ned)'],
  ['Space', 'Hopp (helikopter: opp, bil: brems)'],
  ['Mus', 'Se deg rundt'],
  ['Venstreklikk / C', 'Gå på huk – snik (i vann: dykk)'],
  ['Høyreklikk / F', 'Angrip med våpen'],
  ['1–4 / Hjul', 'Bytt våpen'],
  ['E', 'Samhandle · stig på/av · hent kjøretøy'],
  ['Q', 'Velg kjøretøy'],
  ['H', 'Bruk medisin'],
  ['B', 'Butikk'],
  ['M', 'Verdenskart'],
  ['V', 'Bytt mellom 1. og 3. person'],
  ['Esc', 'Pause'],
];

function controlsHTML() {
  return CONTROLS.map(([k, d]) => `<div class="k">${k.split(' / ').map((x) => `<span class="key">${x}</span>`).join(' ')}</div><div class="d">${d}</div>`).join('');
}

export class Menus {
  constructor(game) {
    this.game = game;
    this.selectedDiff = game.settings.difficulty || 'medium';
    this.selectedLevel = LEVELS[game.settings.level] ? +game.settings.level : 1;
    this.shopTab = 0;
    $('controls-grid').innerHTML = controlsHTML();
    $('controls-grid-pause').innerHTML = controlsHTML();
    this.buildLevels();
    this.buildDifficulty();
    this.bindSettings();

    $('btn-new').onclick = () => game.startNewGame(this.selectedDiff);
    $('btn-continue').onclick = () => game.continueGame();
    $('btn-resume').onclick = () => game.resume();
    $('btn-save').onclick = () => game.save(true);
    $('btn-shop').onclick = () => game.openShop();
    $('btn-map').onclick = () => game.openMap();
    $('btn-quit').onclick = () => game.toMenu();
    $('shop-close').onclick = () => game.closeOverlay();
    $('map-close').onclick = () => game.closeOverlay();
    $('btn-retry').onclick = () => game.startNewGame(game.difficulty.key, true);
    $('btn-menu1').onclick = () => game.toMenu();
    $('btn-menu2').onclick = () => game.toMenu();
    $('btn-continue-play').onclick = () => game.resume();
    $('click-to-play').onclick = () => game.resume();
    document.querySelectorAll('.btn, .tab, .diff').forEach((b) => b.addEventListener('click', () => game.audio.ui()));
  }

  buildLevels() {
    const list = $('level-list');
    list.innerHTML = Object.values(LEVELS).map((lv) => `
      <button class="level${lv.id === this.selectedLevel ? ' selected' : ''}" data-id="${lv.id}">
        <div class="l-top">
          <div class="l-icon">${lv.icon}</div>
          <div><div class="l-num">Bane ${lv.id}</div><div class="l-name">${lv.name}</div></div>
        </div>
        <div class="l-desc">${lv.desc}</div>
        <div class="l-biomes">${[lv.bands[1], lv.bands[0], lv.bands[2]].map((k) => `<span>${BIOMES[k].icon} ${BIOMES[k].name}</span>`).join('')}</div>
      </button>`).join('');
    list.querySelectorAll('.level').forEach((el) => {
      el.onclick = () => {
        this.selectedLevel = +el.dataset.id;
        list.querySelectorAll('.level').forEach((x) => x.classList.toggle('selected', x === el));
        this.game.settings.level = this.selectedLevel;
        this.game.persistSettings();
      };
    });
  }

  buildDifficulty() {
    const list = $('difficulty-list');
    const icons = { easy: '🌱', medium: '🌲', hard: '🔥' };
    list.innerHTML = Object.values(DIFFICULTY).map((d) => `
      <button class="diff${d.key === this.selectedDiff ? ' selected' : ''}" data-key="${d.key}">
        <div class="d-icon">${icons[d.key]}</div>
        <div>
          <div class="d-name">${d.name}</div>
          <div class="d-desc">${d.desc}</div>
          <div class="d-stats">
            <span>👁 Synsradius ${d.sightRadius} m</span>
            <span>💥 Fiendeskade ×${d.damageMult}</span>
            <span>🎯 ${d.poachers} krypskyttere</span>
          </div>
        </div>
      </button>`).join('');
    list.querySelectorAll('.diff').forEach((el) => {
      el.onclick = () => {
        this.selectedDiff = el.dataset.key;
        list.querySelectorAll('.diff').forEach((x) => x.classList.toggle('selected', x === el));
        this.game.settings.difficulty = this.selectedDiff;
        this.game.persistSettings();
      };
    });
  }

  bindSettings() {
    const g = this.game;
    const s = g.settings;
    const q = $('opt-quality'), sens = $('opt-sens'), vol = $('opt-vol'), cam = $('opt-cam');
    if (s.quality) q.value = s.quality;
    if (s.sensitivity) sens.value = s.sensitivity;
    if (s.volume !== undefined) vol.value = s.volume;
    if (s.camera) cam.value = s.camera;
    q.onchange = () => { s.quality = q.value; g.applyQuality(); g.persistSettings(); };
    sens.oninput = () => { s.sensitivity = +sens.value; g.input.sensitivity = s.sensitivity; g.persistSettings(); };
    vol.oninput = () => { s.volume = +vol.value; g.audio.setVolume(s.volume); g.persistSettings(); };
    cam.onchange = () => { s.camera = cam.value; g.persistSettings(); };
  }

  showOnly(id) {
    for (const s of ['menu', 'loading', 'pause', 'shop', 'mapscreen', 'gameover', 'victory', 'click-to-play']) {
      $(s).classList.toggle('hidden', s !== id);
    }
  }

  /** save: det lagrede spillet (eller null). Knappen viser hvilken bane den fortsetter. */
  setContinueVisible(save) {
    const btn = $('btn-continue');
    btn.classList.toggle('hidden', !save);
    if (save) {
      const lv = LEVELS[save.level || 1] || LEVELS[1];
      btn.textContent = `⟲ Fortsett: ${lv.icon} ${lv.name}`;
    }
  }

  setLoading(frac, title, tip) {
    $('loading-bar').style.width = `${Math.round(frac * 100)}%`;
    if (title) $('loading-title').textContent = title;
    if (tip) $('loading-tip').textContent = tip;
  }

  statsHTML() {
    const g = this.game;
    const s = g.stats;
    return [
      ['Bane', `${g.gen?.level?.icon || ''} ${g.gen?.level?.name || ''}`],
      ['Tid', formatTime(g.time)],
      ['Krypskyttere stoppet', `${s.stopped} / ${s.totalPoachers}`],
      ['Mynter tjent', s.coinsEarned],
      ['Skatter funnet', s.chests],
      ['Oppdrag fullført', s.quests],
      ['Dyr befridd', s.animalsFreed],
    ].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
  }

  showPause() {
    $('pause-stats').innerHTML = this.statsHTML();
    this.showOnly('pause');
  }

  showGameOver(cause) {
    const texts = {
      poacher: 'Du ble skutt av en krypskytter.',
      bear: 'Du ble angrepet av en bjørn.',
      polarbear: 'Du ble angrepet av en isbjørn.',
      wolf: 'Ulveflokken tok deg.',
      scorpion: 'En kjempeskorpion stakk deg.',
      shark: 'Du ble tatt av en hai.',
      drown: 'Du druknet – du var under vann for lenge.',
      fall: 'Du falt for langt.',
    };
    const sp = SPECIES[cause];
    $('gameover-cause').textContent = texts[cause] || (sp ? `Du ble angrepet av ${sp.article || 'en'} ${sp.name}.` : 'Helsen din gikk tom.');
    $('gameover-stats').innerHTML = this.statsHTML();
    this.showOnly('gameover');
  }

  showVictory() {
    $('victory-stats').innerHTML = this.statsHTML();
    this.showOnly('victory');
  }

  // ---------- Butikk ----------
  showShop() {
    this.renderShop();
    this.showOnly('shop');
  }

  renderShop() {
    const g = this.game;
    const p = g.player;
    $('shop-coins').textContent = p.coins;
    $('shop-tabs').innerHTML = SHOP.map((c, i) => `<button class="tab${i === this.shopTab ? ' on' : ''}" data-i="${i}">${c.category}</button>`).join('');
    $('shop-tabs').querySelectorAll('.tab').forEach((t) => {
      t.onclick = () => {
        this.shopTab = +t.dataset.i;
        g.audio.ui();
        this.renderShop();
      };
    });
    const cat = SHOP[this.shopTab];
    $('shop-items').innerHTML = cat.items.map((it) => {
      const info = this.itemInfo(it);
      const owned = info.owned;
      const afford = p.coins >= info.price;
      return `<div class="card">
        <div class="c-top"><div class="c-icon">${info.icon}</div><div><div class="c-name">${info.name}</div><div class="c-price">${info.price} mynter</div></div></div>
        <div class="c-desc">${info.desc}</div>
        ${info.stats ? `<div class="c-stats">${info.stats.map((s) => `<span>${s}</span>`).join('')}</div>` : ''}
        ${owned ? `<div class="c-owned">✓ Du eier denne${info.equip ? '' : ''}</div>` : ''}
        ${owned ? (info.equip ? `<button class="btn small" data-equip="${it.id}" data-kind="${it.kind}">${info.equip}</button>` : '')
          : `<button class="btn ${afford ? 'primary' : ''} small" data-buy="${it.id}" data-kind="${it.kind}" ${afford ? '' : 'disabled'}>${afford ? 'Kjøp' : 'Ikke nok mynter'}</button>`}
      </div>`;
    }).join('');
    $('shop-items').querySelectorAll('[data-buy]').forEach((b) => {
      b.onclick = () => {
        g.buy(b.dataset.kind, b.dataset.buy);
        this.renderShop();
      };
    });
    $('shop-items').querySelectorAll('[data-equip]').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.kind === 'weapon') p.setWeapon(b.dataset.equip);
        else p.selectedVehicle = b.dataset.equip;
        g.hud.markDirty();
        g.audio.ui();
        this.renderShop();
      };
    });
  }

  itemInfo(it) {
    const p = this.game.player;
    if (it.kind === 'weapon') {
      const w = WEAPONS[it.id];
      const owned = p.weapons.includes(it.id);
      return {
        name: w.name, icon: w.icon, price: w.price, desc: w.desc, owned,
        stats: [`Skade ${w.damage}`, `Ladetid ${w.cooldown}s`, w.type === 'ranged' ? 'Avstandsvåpen' : 'Nærkamp'],
        equip: owned ? (p.weapon === it.id ? null : 'Utrust') : null,
      };
    }
    if (it.kind === 'vehicle') {
      const v = VEHICLES[it.id];
      const owned = p.ownedVehicles.includes(it.id);
      const kind = { land: 'Land', water: 'Vann', air: 'Luft' }[v.kind];
      return {
        name: v.name, icon: v.icon, price: v.price, desc: v.desc, owned,
        stats: [`Toppfart ${Math.round(v.maxSpeed * 3.6)} km/t`, kind],
        equip: owned ? (p.selectedVehicle === it.id ? null : 'Velg') : null,
      };
    }
    return { name: it.name, icon: it.icon, price: it.price, desc: `${it.desc} Du har: ${p.inventory[it.id]}`, owned: false };
  }
}
