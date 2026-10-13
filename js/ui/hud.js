// HUD: helse, pust, mynter, våpen, transport, kompass, snikstatus, oppdrag og varsler.
import { WEAPONS, WEAPON_ORDER, VEHICLES, ITEM_INFO } from '../config.js';
import { BIOME_NAMES } from '../world/worldgen.js';

const $ = (id) => document.getElementById(id);
const DIRS = { 0: 'N', 45: 'NØ', 90: 'Ø', 135: 'SØ', 180: 'S', 225: 'SV', 270: 'V', 315: 'NV' };
const PX_PER_DEG = 2;

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of ['hud', 'health-fill', 'health-ghost', 'health-text', 'breath-row', 'breath-fill', 'breath-text', 'coins-text', 'coins-pop',
      'inventory', 'compass', 'compass-strip', 'biome-label', 'poacher-label', 'stealth', 'stealth-text', 'quest-tracker', 'quest-title', 'quest-dist',
      'weapon-icon', 'weapon-name', 'weapon-dots', 'transport-icon', 'transport-name', 'transport-sub', 'crosshair', 'hitmarker', 'dmg-dirs',
      'prompt', 'prompt-text', 'dialog', 'dialog-name', 'dialog-text', 'notifications', 'underwater', 'hurt']) {
      this.el[id] = $(id);
    }
    this.cache = {};
    this.dirty = true;
    this.hurtAlpha = 0;
    this.dialogT = 0;
    this.biomeT = 0;
    this.buildCompass();
  }

  show(v) {
    this.el.hud.classList.toggle('hidden', !v);
  }

  markDirty() {
    this.dirty = true;
  }

  _set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  buildCompass() {
    const strip = this.el['compass-strip'];
    let html = '';
    for (let d = -360; d < 720; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const label = DIRS[n];
      if (label) html += `<span class="c${n === 0 ? ' n' : ''}">${label}</span>`;
      else html += `<span>${n % 45 === 0 ? '' : '·'}</span>`;
    }
    strip.innerHTML = html;
    this.questMark = document.createElement('div');
    this.questMark.style.cssText = 'position:absolute;top:2px;font-size:14px;color:#f6c544;transform:translateX(-50%);';
    this.questMark.textContent = '◆';
    this.el.compass.appendChild(this.questMark);
  }

  bearing(yaw) {
    return ((-yaw * 180) / Math.PI % 360 + 360) % 360;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const E = this.el;

    // Helse
    const hp = Math.max(0, Math.round(p.health));
    this._set('hp', hp, (v) => {
      E['health-fill'].style.width = `${v}%`;
      E['health-text'].textContent = v;
      E['health-fill'].classList.toggle('low', v < 30);
      clearTimeout(this.ghostTO);
      this.ghostTO = setTimeout(() => { E['health-ghost'].style.width = `${v}%`; }, 30);
    });
    // Pust
    const showBreath = !p.vehicle && (p.swimming || p.headUnder || p.breath < 0.995);
    this._set('br-show', showBreath, (v) => E['breath-row'].classList.toggle('hidden', !v));
    if (showBreath) {
      const b = Math.round(p.breath * 100);
      this._set('br', b, (v) => {
        E['breath-fill'].style.width = `${v}%`;
        E['breath-text'].textContent = v;
      });
    }
    // Mynter
    this._set('coins', p.coins, (v) => { E['coins-text'].textContent = v; });

    if (this.dirty) {
      this.dirty = false;
      const inv = p.inventory;
      E.inventory.innerHTML = [
        ['medicine', 'H'], ['medkit', 'H'], ['food', ''], ['water', ''],
      ].map(([k, key]) => `<span class="inv-item${inv[k] ? '' : ' zero'}" title="${ITEM_INFO[k].name}">${ITEM_INFO[k].icon}<b>${inv[k]}</b>${key ? `<span class="k">${key}</span>` : ''}</span>`).join('');
      const w = WEAPONS[p.weapon];
      E['weapon-icon'].textContent = w.icon;
      E['weapon-name'].textContent = w.name;
      E['weapon-dots'].innerHTML = WEAPON_ORDER.map((id) => `<i class="${id === p.weapon ? 'on' : p.weapons.includes(id) ? 'own' : ''}"></i>`).join('');
      E.crosshair.classList.toggle('crouch', p.crouch);
    }

    // Transport
    let tIcon, tName, tSub;
    if (p.vehicle) {
      const v = p.vehicle;
      tIcon = v.cfg.icon;
      tName = v.cfg.name;
      const kmh = Math.round(p.speed2D * 3.6);
      tSub = `${kmh} km/t` + (v.type === 'heli' ? ` · Høyde ${Math.round(v.pos.y - Math.max(0, g.gen.groundHeight(v.pos.x, v.pos.z)))} m` : '') + ' · E: gå ut';
    } else {
      tIcon = p.swimming ? '🏊' : p.crouch ? '🥷' : p.running ? '🏃' : '🚶';
      tName = p.swimming ? 'Svømmer' : p.crouch ? 'Sniker' : p.running ? 'Løper' : 'Til fots';
      const sv = VEHICLES[p.selectedVehicle];
      tSub = `Valgt: ${sv.icon} ${sv.name} (E: hent, Q: bytt)`;
    }
    this._set('t', tIcon + tName + tSub, () => {
      E['transport-icon'].textContent = tIcon;
      E['transport-name'].textContent = tName;
      E['transport-sub'].textContent = tSub;
    });

    // Kompass
    const bearing = this.bearing(p.yaw);
    const cw = E.compass.clientWidth || 380;
    E['compass-strip'].style.transform = `translateX(${(-(bearing + 360) * PX_PER_DEG + cw / 2 - 15).toFixed(1)}px)`;
    const qt = g.quests.target();
    if (qt) {
      const qb = this.bearing(Math.atan2(-(qt.x - p.pos.x), -(qt.z - p.pos.z)));
      let rel = qb - bearing;
      rel = ((rel + 540) % 360) - 180;
      const x = cw / 2 + rel * PX_PER_DEG;
      this.questMark.style.display = x > 8 && x < cw - 8 ? 'block' : 'none';
      this.questMark.style.left = `${x}px`;
    } else {
      this.questMark.style.display = 'none';
    }

    // Biom
    this.biomeT -= dt;
    if (this.biomeT <= 0) {
      this.biomeT = 0.5;
      const b = g.gen.biomeAt(p.pos.x, p.pos.z);
      const icon = b === 'ice' ? '❄️' : b === 'desert' ? '🏜️' : '🌲';
      this._set('biome', b, () => { E['biome-label'].textContent = `${icon} ${BIOME_NAMES[b]}`; });
    }
    const st = g.stats;
    this._set('poach', `${st.stopped}/${st.totalPoachers}`, () => {
      E['poacher-label'].textContent = `🎯 Krypskyttere stoppet: ${st.stopped} / ${st.totalPoachers}`;
    });

    // Snikstatus
    let level = 0;
    for (const e of g.entities.poachers) {
      if (!e.alive || !e.active) continue;
      if (e.state === 'alert') { level = 2; break; }
      if (e.state === 'suspicious' || e.state === 'search') level = Math.max(level, 1);
    }
    for (const a of g.entities.animals) {
      if (!a.hostile || !a.alive) continue;
      if (a.state === 'chase') level = 2;
      else if (a.state === 'suspicious') level = Math.max(level, 1);
    }
    let sCls = '', sText = 'Synlig';
    if (level === 2) { sCls = 'detected'; sText = 'Oppdaget!'; }
    else if (level === 1) { sCls = 'suspect'; sText = 'Mistenkt …'; }
    else if (p.crouch && p.inCover > 0.3) { sCls = 'hidden-state'; sText = 'Skjult i dekning'; }
    else if (p.crouch) { sCls = 'hidden-state'; sText = 'Sniker'; }
    else if (p.vehicle) sText = 'Synlig (kjøretøy)';
    this._set('stealth', sCls + sText, () => {
      E.stealth.className = `stealth ${sCls}`;
      E['stealth-text'].textContent = sText;
    });

    // Oppdrag
    const q = g.quests.active;
    if (q) {
      const t = g.quests.target();
      const d = Math.round(Math.hypot(t.x - p.pos.x, t.z - p.pos.z));
      this._set('q', q.title + d, () => {
        E['quest-tracker'].classList.remove('hidden');
        E['quest-title'].textContent = `📜 ${q.title}`;
        E['quest-dist'].textContent = `${d} m unna · følg ◆ på kompasset`;
      });
    } else {
      this._set('q', '', () => E['quest-tracker'].classList.add('hidden'));
    }

    // Interaksjon
    const it = g.interactable;
    this._set('prompt', it ? it.label : '', (v) => {
      E.prompt.classList.toggle('hidden', !v);
      E['prompt-text'].textContent = v;
    });

    // Dialog
    if (this.dialogT > 0) {
      this.dialogT -= dt;
      if (this.dialogT <= 0) E.dialog.classList.add('hidden');
    }

    // Skade-/undervannseffekter
    this.hurtAlpha = Math.max(0, this.hurtAlpha - dt * 1.2);
    const low = p.health < 30 ? 0.25 + Math.sin(g.time * 5) * 0.1 : 0;
    E.hurt.style.opacity = Math.min(0.9, this.hurtAlpha + low).toFixed(3);
    this._set('uw', g.env.underwater, (v) => { E.underwater.style.opacity = v ? '1' : '0'; });
    this._set('xh', !p.vehicle, (v) => { E.crosshair.style.display = v ? 'block' : 'none'; });
  }

  notify(text, type = 'info', duration = 3.8) {
    const box = this.el.notifications;
    const n = document.createElement('div');
    n.className = `note ${type}`;
    n.textContent = text;
    box.appendChild(n);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => n.classList.add('fade'), duration * 1000);
    setTimeout(() => n.remove(), duration * 1000 + 600);
  }

  dialog(name, text, dur = 5) {
    this.el['dialog-name'].textContent = name;
    this.el['dialog-text'].textContent = `«${text}»`;
    this.el.dialog.classList.remove('hidden');
    this.dialogT = dur;
  }

  coinPop(amount) {
    const el = this.el['coins-pop'];
    el.textContent = `+${amount}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  hitMarker() {
    const el = this.el.hitmarker;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  damageFlash(amount, from, player) {
    this.hurtAlpha = Math.min(0.9, this.hurtAlpha + 0.15 + amount / 40);
    if (!from) return;
    const dx = from.x - player.pos.x, dz = from.z - player.pos.z;
    const yaw = player.yaw;
    const f = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
    const r = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
    const th = Math.atan2(r, f);
    const R = 120;
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    el.style.transform = `translate(${(Math.sin(th) * R).toFixed(1)}px, ${(-Math.cos(th) * R).toFixed(1)}px) rotate(${th}rad)`;
    this.el['dmg-dirs'].appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; }, 400);
    setTimeout(() => el.remove(), 1400);
  }

  clearTransient() {
    this.el.notifications.innerHTML = '';
    this.el['dmg-dirs'].innerHTML = '';
    this.el.dialog.classList.add('hidden');
    this.hurtAlpha = 0;
    this.cache = {};
    this.dirty = true;
  }
}
