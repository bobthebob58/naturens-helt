// Tastatur, mus og PointerLock.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // trykket denne rammen
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.mouseButtons = new Set();
    this.clicks = new Set(); // museknapper trykket denne rammen
    this.locked = false;
    this.axis = { x: 0, y: 0 }; // analog bevegelse fra berøringsstyrespaken (x mot høyre, y fremover)
    this.axisRun = false; // styrespaken er presset helt ut
    this.handlers = { keydown: [], lockchange: [] };
    this.sensitivity = 1;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) {
        if (this.locked) e.preventDefault();
      }
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      for (const h of this.handlers.keydown) h(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Ignorer urimelige hopp (kjent nettleserfeil ved PointerLock)
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouseButtons.add(e.button);
      this.clicks.add(e.button);
    });
    document.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    document.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    document.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys.clear();
        this.mouseButtons.clear();
      }
      for (const h of this.handlers.lockchange) h(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      for (const h of this.handlers.lockchange) h(false);
    });
  }

  on(type, fn) {
    this.handlers[type].push(fn);
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock?.());
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) { /* ignorer */ }
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  /** Trykk/slipp en tast fra berøringsknappene (samme virkning som tastaturet). */
  press(code) {
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
    const e = { code, preventDefault() {} };
    for (const h of this.handlers.keydown) h(e);
  }

  release(code) {
    this.keys.delete(code);
  }

  /** Bevegelse fremover (-1..1) og sideveis mot høyre (-1..1) fra tastatur og styrespak. */
  moveY() {
    const v = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0) + this.axis.y;
    return Math.max(-1, Math.min(1, v));
  }

  moveX() {
    const v = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.axis.x;
    return Math.max(-1, Math.min(1, v));
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  clicked(button) {
    return this.clicks.has(button);
  }

  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = this.mouseDY = 0;
    return [dx * this.sensitivity, dy * this.sensitivity];
  }

  endFrame() {
    this.pressed.clear();
    this.clicks.clear();
    this.wheel = 0;
  }
}
