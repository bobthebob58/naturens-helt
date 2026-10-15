// Galleri over dyrerigger: «art:tilstand@visning», vannflate for svømming. Antall trekanter og mål skrives ut.
//   W=1400 H=800 node tools/run.mjs gallery crocodile:walk turtle:swim@side parrot:happy@front
// Tilstander: idle walk run eat attack happy swim. Visninger: 34 (standard) side front back top low. COLS=3 kolonner.
export default async function (page, { args, out }) {
  const list = args.length ? args : ['crocodile', 'turtle', 'parrot'];
  const opts = { cols: +(process.env.COLS || 3), steps: +(process.env.STEPS || 40) };
  await page.goto(process.env.BASE + '/?nolock');
  await page.waitForTimeout(500);
  const res = await page.evaluate(async ({ list, opts }) => {
    const THREE = await import('three');
    const { species } = await import('/js/levels/fauna.js');
    const W = window.innerWidth, H = window.innerHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.setScissorTest(true);
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a6a44, 1.4));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(30, 60, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, far: 300 });
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0x8aa66a }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const errors = [];
    const cells = [];
    const cols = Math.min(opts.cols, list.length), rows = Math.ceil(list.length / cols);
    const cw = Math.floor(W / cols), ch = Math.floor(H / rows);
    list.forEach((entry, i) => {
      const [k0, view = '34'] = entry.split('@');
      const [key, st = 'idle'] = k0.split(':');
      try {
        const sp = species(key);
        const rig = sp.createRig();
        const x = (i - list.length / 2) * 14;
        rig.root.position.set(x, 0, 0);
        scene.add(rig.root);
        const spd = st === 'run' ? 7 : st === 'walk' ? 1.6 : st === 'swim' ? 2 : 0;
        const water = st === 'swim';
        if (water) {
          rig.root.position.y = -(sp.swimSink ?? 0.3);
          const w = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshLambertMaterial({ color: 0x2f6f8f, transparent: true, opacity: 0.82 }));
          w.rotation.x = -Math.PI / 2;
          w.position.set(x, 0.02, 0);
          scene.add(w);
        }
        for (let k = 0; k < opts.steps; k++) {
          if (st === 'attack' && k === opts.steps - 6) rig.update(0, 0, 'attack');
          rig.update(0.05, spd, st === 'attack' ? 'run' : st);
        }
        rig.root.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(rig.root);
        let tris = 0;
        rig.root.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
        cells.push({ key: entry, st, sp, rig, b, i, view, tris });
      } catch (e) { errors.push(key + ': ' + e.message + '\n' + e.stack); }
    });
    const labels = [];
    for (const c of cells) {
      const col = c.i % cols, row = Math.floor(c.i / cols);
      const vx = col * cw, vy = H - (row + 1) * ch;
      const cam = new THREE.PerspectiveCamera(35, cw / ch, 0.05, 500);
      const center = c.b.getCenter(new THREE.Vector3());
      const size = c.b.getSize(new THREE.Vector3());
      const r = Math.max(size.x, size.y, size.z) * 0.55 + 0.1;
      const ang = c.view === 'side' ? Math.PI / 2 : c.view === 'front' ? 0.15 : c.view === 'back' ? Math.PI * 0.8 : 0.85;
      const elev = c.view === 'top' ? 1.2 : c.view === 'low' ? 0.08 : 0.3;
      const dist = r / Math.tan((35 / 2) * Math.PI / 180) * (cw < ch ? ch / cw : 1) * 0.95;
      cam.position.set(center.x + Math.sin(ang) * Math.cos(elev) * dist, center.y + Math.sin(elev) * dist, center.z + Math.cos(ang) * Math.cos(elev) * dist);
      cam.lookAt(center);
      renderer.setViewport(vx, vy, cw, ch);
      renderer.setScissor(vx, vy, cw, ch);
      scene.background = new THREE.Color(row % 2 === col % 2 ? 0xbcd6ea : 0xc8deee);
      renderer.render(scene, cam);
      labels.push(`<div style="position:absolute;left:${vx + 6}px;top:${row * ch + 4}px;font:bold 14px sans-serif;color:#123;background:rgba(255,255,255,.6);padding:1px 5px">${c.key} – ${c.sp.name} (${c.tris} tri)</div>`);
    }
    document.body.insertAdjacentHTML('beforeend', labels.join(''));
    return { errors, info: cells.map((c) => `${c.key}: h=${c.sp.height} bbox y=[${c.b.min.y.toFixed(2)},${c.b.max.y.toFixed(2)}] x=[${c.b.min.x.toFixed(2)},${c.b.max.x.toFixed(2)}] z=[${c.b.min.z.toFixed(2)},${c.b.max.z.toFixed(2)}] r=${c.sp.radius} tris=${c.tris}`) };
  }, { list, opts });
  console.log(JSON.stringify(res, null, 1));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/gallery.png` });
  return res.errors.length === 0;
}
