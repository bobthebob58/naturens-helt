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
