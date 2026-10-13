// Minikart (roterer med spilleren) og stort verdenskart.
import { VEHICLES } from '../config.js';

const LOCAL_PX = 160;     // piksler i lokalt kart
const LOCAL_MPP = 4;      // meter per piksel (lik terrengrutenettet)
const VIEW_R = 150;       // meter synlig i radius på minikartet

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export class Minimap {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.big = document.getElementById('bigmap');
    this.bctx = this.big.getContext('2d');
    this.local = document.createElement('canvas');
    this.local.width = this.local.height = LOCAL_PX;
    this.back = document.createElement('canvas');
    this.back.width = this.back.height = LOCAL_PX;
    this.localCenter = null;
    this.job = null;
    this.worldMap = null;
    this.color = [0, 0, 0];
  }

  /** Lag oversiktskart over hele verden (asynkront med fremdrift). */
  async buildWorldMap(gen, onProgress) {
    const N = 512;
    const half = gen.half;
    const mpp = (half * 2) / N;
    const H = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = -half + (j + 0.5) * mpp;
      for (let i = 0; i < N; i++) H[j * N + i] = gen.height(-half + (i + 0.5) * mpp, z);
      if (j % 24 === 0) {
        onProgress?.(j / N);
        await nextFrame();
      }
    }
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    const col = this.color;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const h = H[j * N + i];
        const hl = H[j * N + Math.max(0, i - 1)], hu = H[Math.max(0, j - 1) * N + i];
        const shade = Math.max(0.6, Math.min(1.3, 1 + ((hl - h) + (hu - h)) * 0.05));
        gen.mapColor(-half + (i + 0.5) * mpp, -half + (j + 0.5) * mpp, h, shade, col);
        const k = (j * N + i) * 4;
        img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.worldMap = c;
    onProgress?.(1);
  }

  reset() {
    this.localCenter = null;
    this.job = null;
  }

  /** Bygg lokalt detaljkart gradvis over flere bilder. */
  _stepLocal(px, pz) {
    const gen = this.game.gen;
    if (!this.job) {
      const cx = Math.round(px / LOCAL_MPP), cz = Math.round(pz / LOCAL_MPP);
      const ctx = this.back.getContext('2d');
      this.job = { cx, cz, row: 0, ctx, img: ctx.createImageData(LOCAL_PX, LOCAL_PX), prev: new Float32Array(LOCAL_PX) };
    }
    const job = this.job;
    const col = this.color;
    const rows = this.localCenter ? 8 : LOCAL_PX;
    const x0 = job.cx - LOCAL_PX / 2, z0 = job.cz - LOCAL_PX / 2;
    for (let r = 0; r < rows && job.row < LOCAL_PX; r++, job.row++) {
      const gz = z0 + job.row;
      let left = gen.gridHeight(x0 - 1, gz);
      for (let i = 0; i < LOCAL_PX; i++) {
        const gx = x0 + i;
        const h = gen.gridHeight(gx, gz);
        const up = job.row === 0 ? gen.gridHeight(gx, gz - 1) : job.prev[i];
        const shade = Math.max(0.6, Math.min(1.35, 1 + ((left - h) + (up - h)) * 0.07));
        gen.mapColor(gx * LOCAL_MPP, gz * LOCAL_MPP, h, shade, col);
        const k = (job.row * LOCAL_PX + i) * 4;
        job.img.data[k] = col[0]; job.img.data[k + 1] = col[1]; job.img.data[k + 2] = col[2]; job.img.data[k + 3] = 255;
        job.prev[i] = h;
        left = h;
      }
    }
    if (job.row >= LOCAL_PX) {
      job.ctx.putImageData(job.img, 0, 0);
      const t = this.local;
      this.local = this.back;
      this.back = t;
      this.localCenter = { x: job.cx * LOCAL_MPP, z: job.cz * LOCAL_MPP };
      this.job = null;
    }
  }

  update() {
    const p = this.game.player;
    const pos = p.vehicle ? p.vehicle.pos : p.pos;
    if (!this.localCenter || this.job || Math.hypot(pos.x - this.localCenter.x, pos.z - this.localCenter.z) > 110) {
      this._stepLocal(pos.x, pos.z);
    }
    this.draw(pos, p.yaw);
  }

  draw(pos, yaw) {
    const ctx = this.ctx;
    const S = this.canvas.width;
    const scale = S / 2 / VIEW_R; // px per meter
    ctx.save();
    ctx.fillStyle = '#1d4a5e';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(yaw);
    if (this.localCenter) {
      const lc = this.localCenter;
      const w = LOCAL_PX * LOCAL_MPP * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.local, (lc.x - pos.x) * scale - w / 2, (lc.z - pos.z) * scale - w / 2, w, w);
    }
    // Markører
    const g = this.game;
    const dot = (x, z, color, r = 4, ring = false) => {
      const dx = (x - pos.x) * scale, dz = (z - pos.z) * scale;
      const d = Math.hypot(dx, dz);
      const maxR = S / 2 - 8;
      let px = dx, pz = dz;
      if (d > maxR) {
        if (!ring) return;
        px = (dx / d) * maxR;
        pz = (dz / d) * maxR;
      }
      ctx.beginPath();
      ctx.arc(px, pz, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
    };
    for (const m of g.entities.mapMarkers()) {
      if (m.type === 'enemyAlert') dot(m.x, m.z, '#ff3b3b', 5);
      else if (m.type === 'enemy') dot(m.x, m.z, '#ff8a8a', 4);
      else if (m.type === 'animal') dot(m.x, m.z, '#ff9a3c', 4);
      else if (m.type === 'quest') dot(m.x, m.z, '#ffd34a', 5, true);
      else if (m.type === 'cage') dot(m.x, m.z, '#c58cff', 4, true);
    }
    for (const camp of g.entities.camps) {
      if (camp.discovered && camp.obj && g.entities.poachers.some((pc) => pc.camp === camp && pc.alive)) dot(camp.x, camp.z, '#e5484d', 6, true);
    }
    for (const type of g.player.ownedVehicles) {
      const v = g.vehicles[type];
      if (v && v.group.visible && v !== g.player.vehicle) dot(v.pos.x, v.pos.z, '#66b8ff', 4, true);
    }
    const qt = g.quests.target();
    if (qt) dot(qt.x, qt.z, '#ffd34a', 6, true);
    ctx.restore();
    // Spillerpil (peker alltid opp)
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#2fae6a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    // Nord-markør på kanten
    const nx = Math.sin(yaw) * (S / 2 - 10);
    const nz = -Math.cos(yaw) * (S / 2 - 10);
    const el = this.canvas.parentElement.querySelector('.minimap-n');
    if (el) {
      el.style.left = `${S / 2 + nx}px`;
      el.style.top = `${S / 2 + nz - 7}px`;
    }
  }

  /** Tegn verdenskartet med markører. */
  drawBigMap() {
    const g = this.game;
    const ctx = this.bctx;
    const S = this.big.width;
    const half = g.gen.half;
    const toPx = (x) => ((x + half) / (half * 2)) * S;
    ctx.clearRect(0, 0, S, S);
    if (this.worldMap) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.worldMap, 0, 0, S, S);
    }
    // Rutenett
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo((i / 8) * S, 0); ctx.lineTo((i / 8) * S, S);
      ctx.moveTo(0, (i / 8) * S); ctx.lineTo(S, (i / 8) * S);
      ctx.stroke();
    }
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('N', S / 2, 18);
    const mpp = S / (half * 2);
    // Leirer
    for (const camp of g.entities.camps) {
      const alive = g.entities.poachers.filter((pc) => pc.camp === camp && pc.alive).length;
      if (camp.discovered) {
        const x = toPx(camp.x), y = toPx(camp.z);
        ctx.fillStyle = alive ? '#e5484d' : '#5fd38d';
        ctx.beginPath();
        ctx.moveTo(x, y - 9); ctx.lineTo(x + 8, y + 6); ctx.lineTo(x - 8, y + 6); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(alive ? `${alive}` : '✓', x, y + 20);
      } else if (alive) {
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(239,91,91,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(toPx(camp.rumorX), toPx(camp.rumorZ), 120 * mpp, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(239,91,91,0.12)';
        ctx.fill();
        ctx.fillStyle = '#ffd0d0';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText('?', toPx(camp.rumorX), toPx(camp.rumorZ) + 5);
      }
    }
    // Kjøretøy
    for (const type of g.player.ownedVehicles) {
      const v = g.vehicles[type];
      if (!v || !v.group.visible) continue;
      ctx.fillStyle = '#66b8ff';
      ctx.beginPath();
      ctx.arc(toPx(v.pos.x), toPx(v.pos.z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(VEHICLES[type].icon, toPx(v.pos.x), toPx(v.pos.z) - 8);
    }
    // Oppdrag
    for (const m of g.entities.mapMarkers()) {
      if (m.type !== 'quest') continue;
      ctx.fillStyle = '#ffd34a';
      ctx.beginPath();
      ctx.arc(toPx(m.x), toPx(m.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const qt = g.quests.target();
    if (qt) {
      ctx.fillStyle = '#ffd34a';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText('◆', toPx(qt.x), toPx(qt.z) + 5);
    }
    // Spiller
    const p = g.player;
    const pp = p.vehicle ? p.vehicle.pos : p.pos;
    ctx.save();
    ctx.translate(toPx(pp.x), toPx(pp.z));
    ctx.rotate(-p.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#2fae6a';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
    // Målestokk
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(12, S - 34, 140, 24);
    ctx.fillStyle = '#fff';
    ctx.fillRect(20, S - 20, 500 * mpp, 3);
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('500 m', 20 + 500 * mpp + 6, S - 15);
  }
}

