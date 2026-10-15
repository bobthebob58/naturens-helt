// Dokumentasjonsbilder (som i docs/screenshots) for bane 2 eller 3:
//   Q=high W=1280 H=720 node tools/run.mjs docs 2        (bilder i tools/out – kopier de gode til docs/screenshots)
// MENU=1 tar også nytt bilde av hovedmenyen. ONLY=15,18 tar bare de nevnte bildene på bane 3.
// Frøet er tilfeldig, så se gjennom bildene og kjør på nytt hvis et motiv ble dårlig.
import { sleep } from './common.mjs';

export default async function (page, { args, out }) {
  const OUT = out;
  const level = +(args[0] || process.env.LEVEL || 2);
  const ev = (fn, a) => page.evaluate(fn, a);
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 86 }); console.log('shot', name); };
  await page.goto(process.env.BASE + '/?nolock');
  await page.waitForTimeout(1200);
  await page.click(`.level[data-id="${level}"]`);
  await page.waitForTimeout(300);
  if (process.env.MENU) await shot('01-meny');
  await page.click('#btn-new');
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 300000 });
  await page.waitForTimeout(2500);
  await ev(async () => {
    const g = window.__game, gen = g.gen;
    const { Animal } = await import('/js/entities/animal.js');
    window.__clean = () => { document.getElementById('dialog').classList.add('hidden'); document.getElementById('notifications').innerHTML = ''; };
    window.__tp = (x, z, yaw, pitch, crouch = false) => {
      const p = g.player;
      p.pos.set(x, gen.groundHeight(x, z), z); p.vel.set(0, 0, 0);
      p.yaw = yaw; p.pitch = pitch; p.crouch = crouch; p.noMouseT = 0; p.heading = yaw + Math.PI; p.rig.root.rotation.y = p.heading;
      g.chunks.lastCx = null; g.chunks.update(x, z, g.time, 0);
      while (g.chunks.jobs.length) g.chunks._runJob(g.chunks.jobs.shift());
      g.minimap.reset();
      g.env.snapAtmosphere(gen.biomeDef(x, z));
    };
    window.__face = (px, pz, tx, tz) => Math.atan2(-(tx - px), -(tz - pz));
    window.__clear = () => { for (const a of g.entities.animals) a.despawn(); };
    // Finn et flatt, tørt sted i et bånd. water: krever vann `water` m foran (strand/bredd), returnerer yaw mot vannet.
    window.__spot = (band, { minH = 1, maxH = 40, slope = 0.9, water = 0, depth = 1.5, peaks = 0, zc = null, near = null } = {}) => {
      const w = [0, 0, 0];
      const z0 = zc ?? (band === 0 ? -1150 : band === 2 ? 1150 : gen.spawn.z);
      const x0 = near ? near.x : gen.spawn.x;
      for (let r = 0; r < 1700; r += 15) for (let a = 0; a < 32; a++) {
        const x = x0 + Math.cos(a / 32 * 6.283) * r, z = (near ? near.z : z0) + Math.sin(a / 32 * 6.283) * r;
        gen.biomeWeights(x, z, w);
        if (w[band] < 0.97) continue;
        const h = gen.groundHeight(x, z);
        if (h < minH || h > maxH || gen.slopeAt(x, z) < slope || g.features.blockedAt(x, z, 3)) continue;
        if (peaks) {
          // Åpen utsikt nær, høye topper langt borte
          for (let k = 0; k < 16; k++) {
            const yaw = k / 16 * 6.283, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
            let nearH = -1e9, farH = -1e9;
            for (let d = 8; d <= 50; d += 6) nearH = Math.max(nearH, gen.groundHeight(x + fx * d, z + fz * d));
            for (let d = 180; d <= 600; d += 30) farH = Math.max(farH, gen.groundHeight(x + fx * d, z + fz * d));
            if (nearH < h + 2 && farH > h + peaks) return { x, z, yaw };
          }
          continue;
        }
        if (!water) return { x, z, yaw: 0.4 };
        for (let k = 0; k < 16; k++) {
          const yaw = k / 16 * 6.283, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
          if (gen.groundHeight(x + fx * 6, z + fz * 6) > 0.3 && gen.waterDepth(x + fx * water, z + fz * water) > depth && gen.waterDepth(x + fx * (water + 12), z + fz * (water + 12)) > depth) return { x, z, yaw };
        }
      }
      return null;
    };
    // Sett et dyr d m foran og s m til høyre for spilleren, vendt mot spilleren (eller vinkel `turn`)
    window.__put = (type, d, s, opts = {}, turn = null) => {
      const p = g.player, y = p.yaw;
      const fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
      const x = p.pos.x + fx * d + rx * s, z = p.pos.z + fz * d + rz * s;
      const a = new Animal(g, type, x, z, opts.hostile ? { hostile: true } : { need: opts.need || null });
      a.heading = turn ?? Math.atan2(p.pos.x - x, p.pos.z - z);
      a.waitT = 60;
      if (opts.state) { a.state = opts.state; a.awareness = opts.state === 'suspicious' ? 0.6 : 0; }
      g.entities.animals.push(a);
      return a;
    };
    window.__calm = () => { for (const p of g.entities.poachers) { p.state = 'patrol'; p.awareness = 0; } };
  });

  if (level === 2) {
    // Regnskog: tapir, papegøye og en jaguar i bakgrunnen
    await ev(() => {
      window.__clear();
      const s = window.__spot(1, { minH: 3, maxH: 30, slope: 0.93 });
      window.__tp(s.x, s.z, s.yaw, -0.1);
      window.__put('tapir', 7, -3.8, { need: 'food' }, s.yaw + 2.0);
      window.__put('parrot', 4.5, 2.4, { need: 'water' });
      window.__put('capybara', 10, 4.5, {}, s.yaw - 2.2);
      window.__put('jaguar', 20, 2.5, { hostile: true, state: 'wander' }, s.yaw + 1.7);
    });
    await sleep(page, 900);
    await ev(() => window.__clean());
    await shot('12-regnskog');

    // Tropiske øyer: havskilpadde på stranda, papegøye i palmene
    await ev(() => {
      window.__clear();
      const s = window.__spot(0, { minH: 0.6, maxH: 4, slope: 0.9, water: 16 });
      window.__tp(s.x, s.z, s.yaw + 0.25, -0.12);
      window.__put('turtle', 5.5, -3.2, { need: 'water' }, s.yaw + 2.2);
      window.__put('turtle', 8, 3.8, {}, s.yaw + 0.5);
      window.__put('parrot', 4, 2.2, {});
    });
    await sleep(page, 900);
    await ev(() => window.__clean());
    await shot('13-tropiske-oyer');

    // Sump: krokodille i vannet, kapybara på bredden
    await ev(() => {
      window.__clear();
      const s = (window.__spot(2, { minH: 0.4, maxH: 3, slope: 0.85, water: 12, depth: 0.9 }) || window.__spot(2, { minH: 0.3, maxH: 4, slope: 0.8, water: 10, depth: 0.75 }));
      window.__tp(s.x, s.z, s.yaw, -0.1, true);
      window.__put('crocodile', 8, 3.2, { hostile: true, state: 'wander' }, s.yaw + 2.4);
      const c = window.__put('crocodile', 15, -2.5, { hostile: true, state: 'suspicious' });
      c.awareness = 0.5;
      window.__put('capybara', 5, -3.8, { need: 'food' });
    });
    await sleep(page, 1200);
    await ev(() => window.__clean());
    await shot('14-sump-krokodille');
  } else {
    const only = process.env.ONLY || '';
    const want = (n) => !only || only.split(',').includes(n);
    if (want('15')) {
    // Savanne: elefanter, sjiraff og sebraer – og en løve som har fått ferten
    await ev(() => {
      window.__clear();
      const s = window.__spot(1, { minH: 3, maxH: 30, slope: 0.95 });
      window.__tp(s.x, s.z, s.yaw, -0.06);
      window.__put('elephant', 22, -7, {}, s.yaw + 1.9);
      window.__put('elephant', 27, -11, {}, s.yaw + 2.1);
      window.__put('giraffe', 30, 9, {}, s.yaw + 1.2);
      window.__put('zebra', 15, 7, { need: 'water' });
      window.__put('zebra', 18, 10, {}, s.yaw + 1.4);
      window.__put('rhino', 14, -5, {}, s.yaw + 2.6);
      window.__put('lion', 30, 2, { hostile: true, state: 'wander' }, s.yaw + 1.5);
    });
    await sleep(page, 900);
    await ev(() => window.__clean());
    await shot('15-savanne');
    }
    if (want('16')) {

    // Fjellandskap: steinbukk og snøleopard
    await ev(() => {
      window.__clear();
      const s = window.__spot(0, { minH: 10, maxH: 50, slope: 0.9, peaks: 60 }) || window.__spot(0, { minH: 8, maxH: 80, slope: 0.85, peaks: 30 });
      window.__tp(s.x, s.z, s.yaw, -0.04);
      window.__put('ibex', 6, -3.5, { need: 'food' }, s.yaw + 2.2);
      window.__put('ibex', 10, 3.5, {}, s.yaw + 1);
      window.__put('snowleopard', 18, 1.5, { hostile: true, state: 'wander' }, s.yaw - 1.6);
    });
    await sleep(page, 900);
    await ev(() => window.__clean());
    await shot('16-fjellandskap');
    }
    if (want('17')) {

    // By: snik mot en containerleir mellom husene, vakthund på post
    await ev(() => {
      const g = window.__game, f = g.features;
      window.__clear();
      const camp = g.entities.camps.find((c) => c.style === 'container') || g.entities.camps[0];
      let best = null;
      for (let r = 20; r <= 34 && !best; r += 2) for (let k = 0; k < 24; k++) {
        const a = k / 24 * 6.283, x = camp.x + Math.cos(a) * r, z = camp.z + Math.sin(a) * r;
        if (f.blockedAt(x, z, 2.5) || f.segmentBlocked(x, 1.4, z, camp.x, 1.4, camp.z)) continue;
        best = { x, z }; break;
      }
      window.__tp(best.x, best.z, window.__face(best.x, best.z, camp.x, camp.z) - 0.12, -0.1, true);
      const ps = g.entities.poachers.filter((p) => p.camp === camp);
      if (ps[0]) { ps[0].state = 'suspicious'; ps[0].awareness = 0.5; ps[0].lastSeen.set(best.x, 0, best.z); }
      for (const p of ps.slice(1)) { p.state = 'patrol'; p.awareness = 0; }
      window.__put('cat', 4, 2.5, { need: 'food' });
    });
    await sleep(page, 1200);
    await ev(() => window.__clean());
    await shot('17-by-containerleir');
    }

    // Helikopter over byen
    await ev(() => {
      const g = window.__game, p = g.player;
      window.__calm();
      window.__clear();
      p.coins = 5000; g.buy('vehicle', 'heli');
      // Midt i byen, sett fra nord mot sør (innover i byen)
      const s = window.__spot(2, { minH: 1, maxH: 30, slope: 0.8, zc: 1250 }) || { x: 0, z: 1250 };
      const x = s.x, z = s.z - 160;
      const yaw = window.__face(x, z, s.x, s.z + 200);
      window.__tp(x, z, yaw, -0.38);
      const v = p.getVehicle('heli'); v.placeAt(x, z, yaw + Math.PI); v.pos.y = g.gen.groundHeight(x, z) + 70; v.rotorSpin = 1; v.landed = false; p.enterVehicle(v);
      g.chunks.lastCx = null; g.chunks.update(x, z, g.time, 0); while (g.chunks.jobs.length) g.chunks._runJob(g.chunks.jobs.shift());
    });
    await page.keyboard.down('KeyW'); await sleep(page, 1200); await page.keyboard.up('KeyW');
    await ev(() => window.__clean());
    await shot('18-by-helikopter');
  }
}
