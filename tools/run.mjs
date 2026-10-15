// Kjør et nettleserscenario i headless Chromium.
//   node tools/run.mjs <scenario> [args] [--phone]      (scenariene ligger i tools/scenarios/)
// Miljøvariabler: W/H = vindusstørrelse, Q = grafikk (low|medium|high), TOUCH=1 = berøringsskjerm,
//   OUT = utmappe for bilder (standard tools/out), CHROMIUM = sti til en egen Chromium.
// Three.js hentes fra node_modules (ikke CDN), så testene virker uten nett. Kjør `npm install` først.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { serve, ROOT } from './serve.mjs';

const argv = process.argv.slice(2);
// --phone = liggende telefon med berøringsskjerm og lav grafikk
if (argv.includes('--phone')) Object.assign(process.env, { TOUCH: '1', W: process.env.W || '844', H: process.env.H || '390', Q: process.env.Q || 'low' });
const [name, ...args] = argv.filter((a) => !a.startsWith('--'));
if (!name) {
  console.log('Scenarier:', fs.readdirSync(path.join(ROOT, 'tools/scenarios')).filter((f) => f !== 'common.mjs').map((f) => f.replace('.mjs', '')).join(', '));
  process.exit(0);
}
const THREE = fs.readFileSync(path.join(ROOT, 'node_modules/three/build/three.module.js'));
const { server, url } = await serve(0);
process.env.BASE = url;
const OUT = process.env.OUT || path.join(ROOT, 'tools/out');
fs.mkdirSync(OUT, { recursive: true });

// SwiftShader gir WebGL uten skjermkort (tregt: 1–8 bilder/s – vent på spilltid, ikke veggklokke)
const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
if (process.env.CHROMIUM) launch.executablePath = process.env.CHROMIUM;
const browser = await chromium.launch(launch);
const W = +(process.env.W || 1280), H = +(process.env.H || 720), touch = !!process.env.TOUCH;
const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch });
if (process.env.Q) await page.addInitScript((q) => localStorage.setItem('naturens-helt-settings-v1', JSON.stringify({ quality: q })), process.env.Q);
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js', (r) => r.fulfill({ body: THREE, contentType: 'text/javascript' }));

let code = 0;
try {
  const mod = await import(`./scenarios/${name}.mjs`);
  const ok = await mod.default(page, { logs, args, out: OUT, base: url });
  if (ok === false) code = 1;
} catch (e) {
  console.log('SCENARIOFEIL', e);
  code = 1;
}
const errors = logs.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[error]'));
if (errors.length) {
  console.log(`${errors.length} feil i nettleseren:\n${errors.slice(0, 10).join('\n')}`);
  code = 1;
}
await browser.close();
server.close();
process.exit(code);
