// Berøringskontroller på liggende telefon: styrespak, se rundt, knapper, pause og stående format.
//   TOUCH=1 W=844 H=390 Q=low node tools/run.mjs touch
import { sleep } from './common.mjs';

export default async function (page, { out, base }) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const tapEl = async (sel) => {
    const r = await (await page.$(sel)).boundingBox();
    await touch('touchStart', [[r.x + r.width / 2, r.y + r.height / 2, 9]]);
    await page.waitForTimeout(120);
    await touch('touchEnd', []);
    await page.waitForTimeout(150);
  };
  const st = () => page.evaluate(() => { const g = window.__game, p = g.player; return { x: p.pos.x, z: p.pos.z, yaw: p.yaw, crouch: p.crouch, state: g.state }; });
  let ok = true;
  const check = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FEIL'} ${msg}`); if (!cond) ok = false; };

  await page.goto(base + '/?touch');
  await page.waitForTimeout(600);
  check(await page.evaluate(() => window.__game.isTouch), 'berøringsmodus oppdaget');
  await page.tap('#btn-new');
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 300000 });
  await page.evaluate(() => document.getElementById('dialog').classList.add('hidden'));
  const W = page.viewportSize().width, H = page.viewportSize().height;
  const s0 = await st();
  await touch('touchStart', [[W * 0.18, H * 0.72, 1]]);
  await touch('touchMove', [[W * 0.18, H * 0.72 - 35, 1]]);
  await sleep(page, 1500);
  const s1 = await st();
  check(Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1.5, `styrespaken flytter spilleren (${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(1)} m)`);
  await touch('touchStart', [[W * 0.18, H * 0.72 - 35, 1], [W * 0.7, H * 0.5, 2]]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[W * 0.18, H * 0.72 - 35, 1], [W * 0.7 - i * 25, H * 0.5, 2]]);
  await page.screenshot({ path: `${out}/touch_play.png` });
  await touch('touchEnd', []);
  await sleep(page, 300);
  const s2 = await st();
  check(Math.abs(s2.yaw - s1.yaw) > 0.2, 'dra med høyre tommel snur kameraet');
  check(!s2.crouch, 'dra/trykk utenfor knapper gir ikke huk (ingen etterlignede museklikk)');
  await tapEl('#t-crouch');
  check((await st()).crouch, 'huk-knappen virker');
  await tapEl('#t-crouch');
  await tapEl('#t-map');
  check((await st()).state === 'map', 'kartknappen åpner kartet');
  await page.tap('#map-close');
  await page.waitForTimeout(400);
  check((await st()).state === 'playing', 'lukk kartet → tilbake i spillet');
  await tapEl('#t-pause');
  check((await st()).state === 'paused', 'pauseknappen pauser');
  await page.tap('#btn-resume');
  await page.waitForTimeout(400);
  check((await st()).state === 'playing', 'fortsett fra pausemenyen');
  await page.setViewportSize({ width: H, height: W });
  await page.waitForTimeout(400);
  check(await page.evaluate(() => getComputedStyle(document.getElementById('rotate-hint')).display !== 'none'), 'stående telefon viser «snu telefonen»');
  return ok;
}
