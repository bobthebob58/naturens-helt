// Berøringskontroller for mobil og nettbrett: styrespak (venstre tommel), dra for å se deg rundt (høyre tommel)
// og knapper for handlingene. Knappene «trykker» de samme tastene som tastaturet (Input.press/release),
// så resten av spillet trenger ikke vite om spilleren bruker tastatur eller berøring.

const STICK_R = 60; // radius for styrespaken i piksler
const LOOK_GAIN = 1.6; // dra-følsomhet sammenlignet med musen

// [id, tast eller handling, ikon, klasse]
const ACTIONS = [
  ['t-attack', 'KeyF', '⚔️', 'big'],
  ['t-jump', 'Space', '⤒', ''],
  ['t-crouch', 'KeyC', '🥷', ''],
  ['t-use', 'KeyE', '✋', ''],
  ['t-run', 'ShiftLeft', '🏃', ''],
  ['t-weapon', 'weapon', '🔁', 'small'],
];
const SYSTEM = [
  ['t-pause', 'Escape', '⏸'],
  ['t-map', 'KeyM', '🗺️'],
  ['t-shop', 'KeyB', '🛒'],
  ['t-med', 'KeyH', '💊'],
  ['t-veh', 'KeyQ', '🚲'],
  ['t-cam', 'KeyV', '🎥'],
];

/** Er dette en berøringsenhet (telefon/nettbrett)? ?touch i adressen tvinger berøringsmodus. */
export function isTouchDevice(params) {
  if (params.has('touch')) return true;
  if (params.has('notouch')) return false;
  return window.matchMedia?.('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.touches = new Map(); // identifier -> { kind: 'stick'|'look'|'button', ... }
    this.visible = null;
    document.body.classList.add('touch');

    const root = document.createElement('div');
    root.id = 'touch-ui';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="t-stick" id="t-stick"><div class="t-knob" id="t-knob"></div></div>
      <div class="t-stick-ghost"></div>
      <div class="t-system">${SYSTEM.map(([id, code, icon]) => `<button class="t-btn small" id="${id}" data-code="${code}">${icon}</button>`).join('')}</div>
      ${ACTIONS.map(([id, code, icon, cls]) => `<button class="t-btn ${cls}" id="${id}" data-code="${code}">${icon}</button>`).join('')}`;
    document.body.appendChild(root);
    this.root = root;
    this.stick = root.querySelector('#t-stick');
    this.knob = root.querySelector('#t-knob');
    this.btn = {};
    for (const b of root.querySelectorAll('.t-btn')) this.btn[b.id] = b;

    const opts = { passive: false };
    root.addEventListener('touchstart', (e) => this.onStart(e), opts);
    root.addEventListener('touchmove', (e) => this.onMove(e), opts);
    root.addEventListener('touchend', (e) => this.onEnd(e), opts);
    root.addEventListener('touchcancel', (e) => this.onEnd(e), opts);
    // Lyd kan bare startes av en berøring – start/gjenoppta den ved første trykk hvor som helst
    window.addEventListener('touchstart', () => game.audio.init(), { passive: true });

    // Interaksjonsteksten viser hånden i stedet for E-tasten
    const key = document.querySelector('#prompt .key');
    if (key) key.textContent = '✋';
  }

  onStart(e) {
    e.preventDefault(); // hindrer etterlignede musehendelser (som ville gitt «klikk» = huk) og zoom
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const b = el && el.closest('.t-btn');
      if (b) {
        this.press(b);
        this.touches.set(t.identifier, { kind: 'button', b });
      } else if (t.clientX < window.innerWidth * 0.45 && ![...this.touches.values()].some((s) => s.kind === 'stick')) {
        this.touches.set(t.identifier, { kind: 'stick', x0: t.clientX, y0: t.clientY });
        this.stick.style.left = `${t.clientX}px`;
        this.stick.style.top = `${t.clientY}px`;
        this.stick.classList.add('on');
        this.setStick(0, 0);
      } else {
        this.touches.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
      }
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = this.touches.get(t.identifier);
      if (!s) continue;
      if (s.kind === 'stick') {
        this.setStick(t.clientX - s.x0, t.clientY - s.y0);
      } else if (s.kind === 'look') {
        this.input.mouseDX += (t.clientX - s.x) * LOOK_GAIN;
        this.input.mouseDY += (t.clientY - s.y) * LOOK_GAIN;
        s.x = t.clientX;
        s.y = t.clientY;
      }
    }
  }

  onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = this.touches.get(t.identifier);
      if (!s) continue;
      this.touches.delete(t.identifier);
      if (s.kind === 'button') this.release(s.b);
      else if (s.kind === 'stick') {
        this.setStick(0, 0);
        this.stick.classList.remove('on');
      }
    }
  }

  setStick(dx, dy) {
    const d = Math.hypot(dx, dy);
    const k = d > STICK_R ? STICK_R / d : 1;
    dx *= k;
    dy *= k;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const a = this.input.axis;
    a.x = dx / STICK_R;
    a.y = -dy / STICK_R;
    // Små utslag ignoreres; helt ut til kanten = løp
    if (Math.hypot(a.x, a.y) < 0.12) a.x = a.y = 0;
    this.input.axisRun = d >= STICK_R * 0.95;
  }

  press(b) {
    b.classList.add('active');
    const code = b.dataset.code;
    if (code === 'weapon') this.input.wheel += 1;
    else this.input.press(code);
  }

  release(b) {
    b.classList.remove('active');
    const code = b.dataset.code;
    if (code !== 'weapon') this.input.release(code);
  }

  /** Slipp alt (når spillet pauses, åpner butikken osv.). */
  releaseAll() {
    for (const s of this.touches.values()) if (s.kind === 'button') this.release(s.b);
    this.touches.clear();
    this.setStick(0, 0);
    this.stick.classList.remove('on');
  }

  /** Kalles hver ramme: vis kontrollene bare mens man spiller, og tilpass knappene til situasjonen. */
  update() {
    const g = this.game;
    const show = g.state === 'playing';
    if (show !== this.visible) {
      this.visible = show;
      this.root.classList.toggle('hidden', !show);
      document.body.classList.toggle('playing', show);
      if (!show) this.releaseAll();
    }
    if (!show || !g.player) return;
    const p = g.player;
    const veh = p.vehicle?.type || '';
    const jump = veh === 'heli' ? '⬆️' : veh && veh !== 'boat' ? '🛑' : p.swimming ? '⬆️' : '⤒';
    const run = veh === 'heli' ? '⬇️' : '🏃';
    if (jump !== this._jump) { this._jump = jump; this.btn['t-jump'].textContent = jump; }
    if (run !== this._run) { this._run = run; this.btn['t-run'].textContent = run; }
    this.btn['t-crouch'].classList.toggle('on', !!p.crouch);
    this.btn['t-use'].classList.toggle('ready', !!g.interactable);
  }
}
