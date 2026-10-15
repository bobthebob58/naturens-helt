// Biom: By (bane 3, sør). Havnebyen der smuglerne gjemmer fangede dyr i skipscontainere.
// Flatt terreng (4–8 m) med et rutenett av asfaltgater låst til verdenskoordinatene: kvartaler på 64 m, vanlige gater
// er 11 m brede med midtstripe, og hver fjerde gate er en aveny med palmer i midtrabatten. Kvartalene fylles fra
// structures() med småhus, villaer, leilighetsblokker, høyblokker, kontortårn i glass, butikker med markiser,
// lagerhaller, parkeringsplasser, parker og plasser. Fortau, kantstein, oppmerking og fotgjengerfelt er egne,
// flate modeller (terrengnettet er for grovt til skarpe linjer), mens fargen tegner asfalt, fortau og
// gress/betong i kvartalene etter nøyaktig samme rutenett. Ren datamodul – ingen Three.js. Se README i js/levels/.
import { lerp, smoothstep } from '../../utils/math.js';
import { pickByTable } from './forest.js';

// ---------- Rutenett ----------
const B = 64;          // avstand mellom gatesentrene (m) – to kvartaler per terrengbit
const ROAD = 5.5;      // halv asfaltbredde i vanlige gater
const AVE = 9.5;       // halv asfaltbredde i avenyene (hver 4. gate), inkludert 4 m midtrabatt
const WALK = 3;        // fortausbredde
const SIDE = B - 2 * (ROAD + WALK); // lengden av en kvartalsside mellom to vanlige gater (47 m)
const Q = Math.PI / 2;
const MIN_W = 0.85;    // minste biomvekt for strukturer
const DRY = 1.2;       // minste bakkehøyde for bygninger

const isAve = (i) => (i & 3) === 0;
const halfAt = (i) => (isAve(i) ? AVE : ROAD);

// Soner
const ROADZ = 0, WALKZ = 1, LOTZ = 2;

// Kvartalstyper
const PARK = 0, PLAZA = 1, HOUSES = 2, FLATS = 3, SHOPS = 4, TOWERS = 5, INDUSTRY = 6, PARKING = 7, EMPTY = 8;

// Bydeler (lavfrekvent støy): blandet boligby, sentrum med høyhus og industri-/havneområde
const MIXED = [[HOUSES, 0.44], [FLATS, 0.2], [SHOPS, 0.13], [PARK, 0.13], [PLAZA, 0.03], [PARKING, 0.03], [EMPTY, 0.04]];
const DOWNTOWN = [[TOWERS, 0.3], [FLATS, 0.24], [SHOPS, 0.24], [PLAZA, 0.09], [PARK, 0.08], [PARKING, 0.05]];
const INDUSTRIAL = [[INDUSTRY, 0.58], [PARKING, 0.12], [EMPTY, 0.13], [SHOPS, 0.08], [PARK, 0.05], [FLATS, 0.04]];

// Tilfeldig vegetasjon i parkene (trærne settes ellers ut fra structures())
const PARK_VEG = [['bush', 0.55], ['city_tree', 0.25], ['city_jacaranda', 0.12], ['palm', 0.08]];

// ---------- Oppslag i rutenettet ----------

/** Resultat fra locate() (gjenbrukes – ingen allokering i de varme funksjonene). */
const L = { bx: 0, bz: 0, px: 0, pz: 0, dx: 0, dz: 0, zone: LOTZ };

/** Finn kvartal, posisjon i kvartalet og sone (gate, fortau eller tomt) for et punkt. */
function locate(x, z) {
  const bx = Math.floor(x / B), bz = Math.floor(z / B);
  const fx = x - bx * B, fz = z - bz * B;
  const dx = fx < B / 2 ? fx : B - fx;   // avstand til nærmeste gatesenter langs x
  const dz = fz < B / 2 ? fz : B - fz;
  const hx = halfAt(fx < B / 2 ? bx : bx + 1);
  const hz = halfAt(fz < B / 2 ? bz : bz + 1);
  L.bx = bx; L.bz = bz;
  L.px = fx - B / 2; L.pz = fz - B / 2;
  L.dx = dx; L.dz = dz;
  L.zone = dx < hx || dz < hz ? ROADZ : dx < hx + WALK || dz < hz + WALK ? WALKZ : LOTZ;
  return L;
}

let kindN = null, kindKey = NaN, kindVal = 0;

/** Kvartalstype – deterministisk fra frøets støy, så farge, vegetasjon og bygninger alltid er enige. */
function blockKind(n, bx, bz) {
  const key = bx * 4096 + bz;
  if (n === kindN && key === kindKey) return kindVal;
  const d = n.color.noise2D(bx * 0.115 + 5.31, bz * 0.115 - 2.17);
  let r = n.extra.noise2D(bx * 0.773 + 0.31, bz * 0.773 + 0.57) * 37.31;
  r -= Math.floor(r);
  kindN = n; kindKey = key;
  kindVal = pickByTable(r, d > 0.3 ? DOWNTOWN : d < -0.36 ? INDUSTRIAL : MIXED);
  return kindVal;
}

/** Ligger punktet (relativt til kvartalsmidten) på en parksti eller midtplassen? */
const onParkPath = (px, pz) => Math.abs(px) < 2.2 || Math.abs(pz) < 2.2 || px * px + pz * pz < 49;

// ---------- Strukturer ----------

const VEG = {
  // Bygninger: rektangulær kollisjon som blokkerer sikt. Forsiden vender mot +Z.
  city_house: { box: { hw: 4.6, hd: 4.2, h: 8.7 }, static: true },
  city_house2: { box: { hw: 4.6, hd: 4.2, h: 8.7 }, static: true },
  city_villa: { box: { hw: 5.0, hd: 4.2, h: 6.8 }, static: true },
  city_apartment: { box: { hw: 11, hd: 5.5, h: 13 }, static: true },
  city_block: { box: { hw: 8, hd: 7, h: 26 }, static: true },
  city_tower: { box: { hw: 8.5, hd: 8.5, h: 31 }, static: true },
  city_shop: { box: { hw: 6, hd: 4.5, h: 8 }, static: true },
  city_shop2: { box: { hw: 6, hd: 4.5, h: 8 }, static: true },
  city_warehouse: { box: { hw: 14, hd: 8, h: 9.2 }, static: true },
  // Parkerte kjøretøy (lave bokser)
  city_car: { box: { hw: 0.9, hd: 2.15, h: 1.5 }, static: true },
  city_car2: { box: { hw: 0.85, hd: 1.95, h: 1.5 }, static: true },
  city_van: { box: { hw: 1.0, hd: 2.5, h: 2.4 }, static: true },
  // Gatemøbler
  city_lamp: { radius: 0.15, cover: 0, height: 7.2, static: true },
  city_bench: { radius: 0, cover: 0.7, height: 0.9, static: true, near: true },
  city_bin: { radius: 0.3, cover: 0.4, height: 1.0, static: true, near: true },
  city_fountain: { radius: 3.4, cover: 0, height: 1.0, static: true },
  city_crates: { radius: 0.9, cover: 1.4, height: 1.9, static: true },
  // Bytrær
  city_tree: { radius: 0.3, cover: 1.4, foliage: { r: 2.4, y0: 2.6, y1: 6.8 }, height: 7, scale: [0.85, 1.2] },
  city_jacaranda: { radius: 0.3, cover: 1.4, foliage: { r: 3.0, y0: 3.0, y1: 6.4 }, height: 6.5, scale: [0.85, 1.2] },
  // Flate gatedetaljer (fortau med kantstein, midtrabatt, oppmerking)
  city_walk: { radius: 0, cover: 0, height: 0.15, static: true, noShadow: true },
  city_corner: { radius: 0, cover: 0, height: 0.15, static: true, noShadow: true },
  city_median: { radius: 0, cover: 0, height: 0.2, static: true, noShadow: true },
  city_dash: { radius: 0, cover: 0, height: 0.06, static: true, noShadow: true, near: true },
  city_zebra: { radius: 0, cover: 0, height: 0.06, static: true, noShadow: true, near: true },
  // Gjenbrukte typer (kopiert nøyaktig fra forest.js / desert.js)
  palm: { radius: 0.3, cover: 0, foliage: { r: 2.3, y0: 6.0, y1: 8.8 } },
  bush: { radius: 0, cover: 1.5, scale: [0.8, 1.4] },
  deadBush: { radius: 0, cover: 0.9, scale: [0.8, 1.4] },
  grass: { radius: 0, cover: 0, decor: true },
  flowers: { radius: 0, cover: 0, decor: true },
};

const CARS = ['city_car', 'city_car', 'city_car2', 'city_car2', 'city_van'];

/** Plasser en liten gjenstand hvis punktet ligger i byen og på tørt land. */
// Flate gatebiter (stive plater på opptil 7,8 m) – må ligge på flat grunn, ellers står de på skrå mot kystskråningen
const FLAT = new Set(['city_walk', 'city_corner', 'city_median', 'city_dash', 'city_zebra']);

function put(api, type, x, z, s = 1, ry = 0) {
  const h = api.gen.groundHeight(x, z);
  if (api.weightAt(x, z) < MIN_W || h < 0.9) return null;
  if (FLAT.has(type)) {
    for (const [dx, dz] of [[3.6, 0], [-3.6, 0], [0, 3.6], [0, -3.6]]) {
      if (Math.abs(api.gen.groundHeight(x + dx, z + dz) - h) > 0.12) return null;
    }
  }
  return api.emit(type, x, z, s, ry);
}

/** Plasser en bygning (eller et kjøretøy): hele grunnflaten må være by, tørr, rimelig flat og utenfor leirene. */
function building(api, type, x, z, ry, s = 1) {
  const b = VEG[type].box;
  const rot = Math.round(ry / Q) & 1;
  const hw = (rot ? b.hd : b.hw) * s, hd = (rot ? b.hw : b.hd) * s;
  if (api.inClearing(x, z, Math.hypot(hw, hd) + 2)) return null;
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < 5; k++) {
    const px = k === 4 ? x : x + (k & 1 ? hw : -hw), pz = k === 4 ? z : z + (k & 2 ? hd : -hd);
    if (api.weightAt(px, pz) < MIN_W) return null;
    const h = api.gen.groundHeight(px, pz);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  if (lo < DRY || hi - lo > 1.4) return null;
  return api.emit(type, x, z, s, ry);
}

const car = (api, x, z, ry, r) => building(api, CARS[Math.floor(r * CARS.length) % CARS.length], x, z, ry);

/** Fortau, kantstein, gatelys, parkerte biler, midtstriper, midtrabatter og fotgjengerfelt rundt et kvartal. */
function streets(api, bx, bz, hW, hE, hN, hS, lot, urban) {
  const X = bx * B, Z = bz * B;
  const rng = api.rng;
  const W = lot.x1 - lot.x0, D = lot.z1 - lot.z0;
  // Fortausstykkene er laget for 47 m lange sider (seks stykker); mot en aveny er siden 43 m, og da skaleres de
  // ned litt. Kantsteinen holdes i gatekanten, så det skalerte stykket blir bare litt smalere innover mot tomta.
  const sx = W / SIDE, sz = D / SIDE;
  for (let k = 0; k < 6; k++) {
    const x = lot.x0 + ((k + 0.5) * W) / 6, z = lot.z0 + ((k + 0.5) * D) / 6;
    put(api, 'city_walk', x, Z + hN + (WALK / 2) * sx, sx, Math.PI); // nordsiden
    put(api, 'city_walk', x, Z + B - hS - (WALK / 2) * sx, sx, 0); // sørsiden
    put(api, 'city_walk', X + hW + (WALK / 2) * sz, z, sz, -Q); // vestsiden
    put(api, 'city_walk', X + B - hE - (WALK / 2) * sz, z, sz, Q); // østsiden
  }
  put(api, 'city_corner', X + hW + WALK / 2, Z + hN + WALK / 2, 1, Math.PI);
  put(api, 'city_corner', X + B - hE - WALK / 2, Z + hN + WALK / 2, 1, Q);
  put(api, 'city_corner', X + B - hE - WALK / 2, Z + B - hS - WALK / 2, 1, 0);
  put(api, 'city_corner', X + hW + WALK / 2, Z + B - hS - WALK / 2, 1, -Q);

  // Gatelys på sør- og østsiden (hver gate får én rekke lys, armen henger ut over kjørebanen)
  for (const f of [1 / 6, 0.5, 5 / 6]) {
    if (urban || rng() < 0.5) put(api, 'city_lamp', lot.x0 + W * f, Z + B - hS - 0.45, 1, 0);
    if (urban || rng() < 0.5) put(api, 'city_lamp', X + B - hE - 0.45, lot.z0 + D * f, 1, Q);
  }

  // Parkerte biler langs fortauskanten (høyrekjøring)
  const pCar = urban ? 0.2 : 0.08;
  for (let k = 0; k < 6; k++) {
    const x = lot.x0 + ((k + 0.5) * W) / 6, z = lot.z0 + ((k + 0.5) * D) / 6;
    const r = [rng(), rng(), rng(), rng(), rng()];
    if (r[0] < pCar) car(api, x, Z + hN - 1.15, Q, r[4]);
    if (r[1] < pCar) car(api, x, Z + B - hS + 1.15, -Q, r[4]);
    if (r[2] < pCar) car(api, X + hW - 1.15, z, Math.PI, r[4]);
    if (r[3] < pCar) car(api, X + B - hE + 1.15, z, 0, r[4]);
  }

  if (!urban) return;
  // Gata i nord og gata i vest «eies» av dette kvartalet: midtstriper eller midtrabatt med palmer
  for (let k = 0; k < 6; k++) {
    const x = lot.x0 + ((k + 0.5) * W) / 6, z = lot.z0 + ((k + 0.5) * D) / 6;
    if (isAve(bz)) put(api, 'city_median', x, Z, W / SIDE, 0);
    else put(api, 'city_dash', x, Z, 1, 0);
    if (isAve(bx)) put(api, 'city_median', X, z, D / SIDE, Q);
    else put(api, 'city_dash', X, z, 1, Q);
  }
  for (const f of [1 / 6, 0.5, 5 / 6]) {
    if (isAve(bz)) put(api, 'palm', lot.x0 + W * f, Z, 0.95 + rng() * 0.25, rng() * 6.28);
    if (isAve(bx)) put(api, 'palm', X, lot.z0 + D * f, 0.95 + rng() * 0.25, rng() * 6.28);
  }
  // Fotgjengerfelt i krysset i nordvest (bare over vanlige gater)
  if (!isAve(bz)) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(api, 'city_zebra', X + sx * (hW + WALK / 2), Z + sz * 2.75, 1, Q);
  }
  if (!isAve(bx)) {
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) put(api, 'city_zebra', X + sx * 2.75, Z + sz * (hN + WALK / 2), 1, 0);
  }
}

/** Et bytre (lind eller jakaranda) som grønn lomme i hager, gårder og på små plasser. */
function pocket(api, x, z, r) {
  put(api, r < 0.5 ? 'city_tree' : 'city_jacaranda', x, z, 0.9 + r * 0.3, r * 40);
}

// ----- Kvartalstyper -----

function houses(api, lot, sparse) {
  const rng = api.rng;
  const { x0, x1, z0, z1 } = lot;
  const W = x1 - x0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const skip = sparse ? 0.45 : 0.1;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
      const type = r3 < 0.32 ? 'city_house' : r3 < 0.62 ? 'city_house2' : 'city_villa';
      const s = 0.94 + r4 * 0.1;
      const hd = VEG[type].box.hd * s;
      const x = x0 + (W * (i + 0.5)) / 3 + (r2 - 0.5) * 1.4;
      const z = side < 0 ? z0 + 2.2 + hd : z1 - 2.2 - hd;
      if (r1 < skip) {
        if (r2 < 0.6) pocket(api, x, z, r4);
        continue;
      }
      const it = building(api, type, x, z, side < 0 ? Math.PI : 0, s);
      // Bil i innkjørselen mellom husene
      if (it && i < 2 && r4 < 0.35) car(api, x0 + (W * (i + 1)) / 3, z + side * 0.6, side < 0 ? Math.PI : 0, r2);
    }
  }
  // Hus mot øst- og vestgata midt i kvartalet
  for (const side of [-1, 1]) {
    const r1 = rng(), r2 = rng();
    if (r1 > (sparse ? 0.3 : 0.6)) continue;
    const type = r2 < 0.5 ? 'city_house2' : 'city_house';
    const hd = VEG[type].box.hd;
    building(api, type, side < 0 ? x0 + 2.2 + hd : x1 - 2.2 - hd, cz + (r2 - 0.5) * 3, side < 0 ? -Q : Q);
  }
  // Hagetrær i bakgårdene
  for (let k = 0; k < 4; k++) {
    const r1 = rng(), r2 = rng(), r3 = rng();
    if (r1 < 0.65) pocket(api, cx + (r2 - 0.5) * W * 0.42, cz + (r3 - 0.5) * 7, r3);
  }
}

function flats(api, lot, sparse) {
  const rng = api.rng;
  const { x0, x1, z0, z1 } = lot;
  const W = x1 - x0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const side of [-1, 1]) {
    const r1 = rng(), r2 = rng(), r3 = rng();
    if (sparse && r3 < 0.4) continue;
    const type = !sparse && r1 < 0.35 ? 'city_block' : 'city_apartment';
    const b = VEG[type].box;
    const s = type === 'city_apartment' ? 0.92 + r3 * 0.16 : 1;
    const x = cx + (r2 - 0.5) * (W - 2 * b.hw * s - 4);
    building(api, type, x, side < 0 ? z0 + 2 + b.hd * s : z1 - 2 - b.hd * s, side < 0 ? Math.PI : 0, s);
  }
  // Gården: trær, benker og søppelkasse
  for (let k = 0; k < 4; k++) {
    const r1 = rng(), r2 = rng(), r3 = rng();
    if (r1 < 0.75) pocket(api, cx + (k < 2 ? -1 : 1) * W * (0.2 + r2 * 0.18), cz + (r3 - 0.5) * 5, r3);
  }
  const r = rng();
  put(api, 'city_bench', cx - 2.5, cz + 1.2, 1, Math.PI);
  put(api, 'city_bench', cx + 2.5, cz - 1.2, 1, 0);
  if (r < 0.6) put(api, 'city_bin', cx + 4.6, cz + 1.2);
}

function towers(api, lot, sparse) {
  const rng = api.rng;
  const { x0, x1, z0, z1 } = lot;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const open = Math.floor(rng() * 4);
  for (let q = 0; q < 4; q++) {
    const sx = q === 1 || q === 2 ? 1 : -1, sz = q >= 2 ? 1 : -1;
    const qx = cx + (sx * W) / 4, qz = cz + (sz * D) / 4;
    const r1 = rng(), r2 = rng();
    if (q === open || (sparse && r1 < 0.5)) {
      // Liten plass med tre, benk og lykt
      pocket(api, qx, qz, r2);
      put(api, 'city_bench', qx + 3.2, qz, 1, -Q);
      put(api, 'city_bench', qx - 3.2, qz, 1, Q);
      if (r1 < 0.5) put(api, 'city_bin', qx, qz + 3);
      continue;
    }
    const type = !sparse && r1 < 0.5 ? 'city_tower' : 'city_block';
    building(api, type, qx, qz, sz < 0 ? Math.PI : 0);
  }
}

function shops(api, lot, sparse) {
  const rng = api.rng;
  const { x0, x1, z0, z1 } = lot;
  const W = x1 - x0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const r1 = rng(), r2 = rng(), r3 = rng();
      if (sparse && r1 < 0.4) continue;
      const x = x0 + (W * (i + 0.5)) / 3;
      const z = side < 0 ? z0 + 0.6 + 4.5 : z1 - 0.6 - 4.5;
      const it = building(api, r2 < 0.5 ? 'city_shop' : 'city_shop2', x, z, side < 0 ? Math.PI : 0);
      // Benk eller søppelkasse på fortauet foran butikken
      if (it && r3 < 0.3) put(api, 'city_bench', x + 3.4, side < 0 ? z0 - 0.75 : z1 + 0.75, 1, side < 0 ? Math.PI : 0);
      else if (it && r3 < 0.5) put(api, 'city_bin', x + 6.8, side < 0 ? z0 - 0.6 : z1 + 0.6);
    }
  }
  // Bakgården: kundeparkering eller en leilighetsblokk
  if (rng() < 0.55) {
    for (const row of [-1, 1]) {
      for (let x = x0 + 3; x < x1 - 2.5; x += 2.9) {
        const r = rng();
        if (r < (sparse ? 0.3 : 0.55)) car(api, x, cz + row * 4.6, row < 0 ? Math.PI : 0, r * 1.8);
      }
    }
    put(api, 'city_lamp', cx, cz, 1, 0);
  } else if (!sparse) {
    building(api, 'city_apartment', cx, cz, rng() < 0.5 ? 0 : Math.PI, 0.94);
  }
}

function industry(api, lot, sparse) {
  const rng = api.rng;
  const { x0, x1, z0, z1 } = lot;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (rng() < 0.6) {
    // To haller med portene mot gården i midten
    for (const side of [-1, 1]) {
      const r1 = rng(), r2 = rng();
      if (sparse && r1 < 0.5) continue;
      building(api, 'city_warehouse', cx + (r2 - 0.5) * (W - 31), side < 0 ? z0 + 1.5 + 8 : z1 - 1.5 - 8, side < 0 ? 0 : Math.PI);
    }
    const yard = D / 2 - 17.5;
    for (let k = 0; k < 3; k++) {
      const r1 = rng(), r2 = rng(), r3 = rng();
      const x = cx + (k - 1) * W * 0.3 + (r2 - 0.5) * 4;
      if (r1 < 0.5) car(api, x, cz + (r3 - 0.5) * 2, r3 < 0.5 ? 0 : Math.PI, 0.95);
      else if (r1 < 0.85) put(api, 'city_crates', x, cz + (r3 < 0.5 ? -1 : 1) * Math.max(0, yard - 1.3), 0.9 + r3 * 0.3, r2 * 6.28);
    }
  } else {
    // Én hall langs vestsiden og en åpen lastegård mot øst
    building(api, 'city_warehouse', x0 + 1.5 + 8, cz + (rng() - 0.5) * (D - 30), Q);
    for (let k = 0; k < 5; k++) {
      const r1 = rng(), r2 = rng(), r3 = rng();
      const x = x0 + 22 + r2 * (W - 26), z = z0 + 4 + r3 * (D - 8);
      if (r1 < 0.35) car(api, x, z, Q, 0.95);
      else if (r1 < 0.8) put(api, 'city_crates', x, z, 0.9 + r3 * 0.3, r2 * 6.28);
    }
  }
}

function parking(api, lot) {
  const rng = api.rng;
  const { x0, x1, z0, z1 } = lot;
  const W = x1 - x0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const [zz, ry] of [[z0 + 4.8, Math.PI], [z0 + 9.4, 0], [z1 - 9.4, Math.PI], [z1 - 4.8, 0]]) {
    for (let x = x0 + 2.6; x < x1 - 2; x += 2.9) {
      const r = rng();
      if (r < 0.55) car(api, x, zz, ry, r * 1.8);
    }
  }
  put(api, 'city_lamp', cx - W / 4, cz, 1, 0);
  put(api, 'city_lamp', cx + W / 4, cz, 1, Math.PI);
}

function park(api, lot) {
  const rng = api.rng;
  const { x0, x1, z0, z1 } = lot;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (rng() < 0.6) put(api, 'city_fountain', cx, cz);
  else put(api, 'city_jacaranda', cx, cz, 1.25);
  // Benker og lykter langs stiene
  for (const s of [-1, 1]) {
    put(api, 'city_bench', cx + 3.2, cz + s * 12, 1, -Q);
    put(api, 'city_bench', cx + s * 12, cz - 3.2, 1, 0);
    put(api, 'city_lamp', cx - 3, cz + s * 15, 1, Q);
    put(api, 'city_lamp', cx + s * 15, cz + 3, 1, Math.PI);
  }
  put(api, 'city_bin', cx + 3.2, cz + 10.2);
  // Trær i de fire gressfeltene
  for (let k = 0; k < 16; k++) {
    const r1 = rng(), r2 = rng(), r3 = rng();
    const px = (r1 - 0.5) * (W - 5), pz = (r2 - 0.5) * (D - 5);
    if (Math.abs(px) < 5 || Math.abs(pz) < 5) continue;
    put(api, r3 < 0.62 ? 'city_tree' : r3 < 0.9 ? 'city_jacaranda' : 'palm', cx + px, cz + pz, 0.85 + r3 * 0.35, r1 * 40);
  }
}

function plaza(api, lot) {
  const rng = api.rng;
  const { x0, x1, z0, z1 } = lot;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  put(api, 'city_fountain', cx, cz, 1.15);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    put(api, k & 1 ? 'city_jacaranda' : 'city_tree', cx + Math.cos(a) * 14, cz + Math.sin(a) * 14, 0.95 + rng() * 0.2, k);
  }
  put(api, 'city_bench', cx + 7.5, cz, 1, -Q);
  put(api, 'city_bench', cx - 7.5, cz, 1, Q);
  put(api, 'city_bench', cx, cz + 7.5, 1, Math.PI);
  put(api, 'city_bench', cx, cz - 7.5, 1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(api, 'city_lamp', cx + sx * 9, cz + sz * 9, 1, sx > 0 ? Q : -Q);
  put(api, 'city_bin', cx + 8.6, cz + 1.6);
}

function emptyLot(api, lot) {
  const rng = api.rng;
  const { x0, x1, z0, z1 } = lot;
  for (let k = 0; k < 3; k++) {
    const r1 = rng(), r2 = rng(), r3 = rng();
    const x = x0 + 5 + r2 * (x1 - x0 - 10), z = z0 + 5 + r3 * (z1 - z0 - 10);
    if (r1 < 0.3) put(api, 'city_crates', x, z, 0.9 + r3 * 0.3, r2 * 6.28);
    else if (r1 < 0.4) car(api, x, z, r3 < 0.5 ? 0 : Q, 0.95);
  }
}

/** Ett kvartal: gatene rundt (fortau, lys, biler, oppmerking) og innholdet på tomta. */
function buildBlock(api, bx, bz) {
  const X = bx * B, Z = bz * B;
  const wc = api.weightAt(X + B / 2, Z + B / 2);
  if (wc < MIN_W) return;
  const hW = halfAt(bx), hE = halfAt(bx + 1), hN = halfAt(bz), hS = halfAt(bz + 1);
  const lot = { x0: X + hW + WALK, x1: X + B - hE - WALK, z0: Z + hN + WALK, z1: Z + B - hS - WALK };
  const urban = wc >= 0.93;
  streets(api, bx, bz, hW, hE, hN, hS, lot, urban);
  const sparse = wc < 0.97;
  switch (blockKind(api.gen.noise, bx, bz)) {
    case PARK: park(api, lot); break;
    case PLAZA: plaza(api, lot); break;
    case HOUSES: houses(api, lot, sparse); break;
    case FLATS: flats(api, lot, sparse); break;
    case SHOPS: shops(api, lot, sparse); break;
    case TOWERS: towers(api, lot, sparse); break;
    case INDUSTRY: industry(api, lot, sparse); break;
    case PARKING: parking(api, lot); break;
    default: emptyLot(api, lot);
  }
}

// ---------- Farger ----------

/** Farge på tomta etter kvartalstype (sRGB 0..1). */
function lotColor(kind, s, x, z, v, v2, out) {
  let r, g, b;
  switch (kind) {
    case PARK:
      if (onParkPath(s.px, s.pz)) { r = lerp(0.74, 0.68, v); g = r - 0.06; b = r - 0.18; break; }
      r = lerp(0.3, 0.38, v); g = lerp(0.49, 0.57, v); b = lerp(0.2, 0.24, v);
      break;
    case PLAZA:
    case TOWERS: {
      const k = (Math.floor(x / 4) + Math.floor(z / 4)) & 1;
      r = (k ? 0.76 : 0.7) + v * 0.03; g = r - 0.025; b = r - 0.07;
      break;
    }
    case HOUSES:
      r = lerp(0.36, 0.45, v); g = lerp(0.52, 0.58, v); b = lerp(0.23, 0.28, v);
      if (v2 > 0.84) { const k = smoothstep(0.84, 0.94, v2) * 0.6; r = lerp(r, 0.52, k); g = lerp(g, 0.42, k); b = lerp(b, 0.29, k); }
      break;
    case FLATS:
      r = lerp(0.42, 0.48, v); g = lerp(0.53, 0.57, v); b = lerp(0.32, 0.36, v);
      break;
    case SHOPS:
      r = lerp(0.56, 0.62, v); g = r - 0.02; b = r - 0.05;
      break;
    case INDUSTRY:
      r = lerp(0.5, 0.56, v); g = r - 0.01; b = r - 0.04;
      if (v2 > 0.7) { const k = smoothstep(0.7, 0.85, v2) * 0.7; r = lerp(r, 0.36, k); g = lerp(g, 0.35, k); b = lerp(b, 0.34, k); }
      break;
    case PARKING:
      r = lerp(0.33, 0.37, v); g = r; b = r + 0.015;
      break;
    default: // ubebygd tomt: tørr jord og ugress
      r = lerp(0.63, 0.55, v); g = lerp(0.53, 0.5, v); b = lerp(0.36, 0.3, v);
  }
  out[0] = r; out[1] = g; out[2] = b;
  return out;
}

const _lc = [0, 0, 0];

// Kartfarger per kvartalstype (sRGB 0..255): grå gater, lysere kvartaler, grønne parker
const MAP_COLORS = [
  [116, 160, 86], [208, 202, 190], [176, 186, 154], [186, 184, 174], [198, 190, 178],
  [206, 204, 198], [168, 164, 154], [146, 146, 150], [194, 178, 136],
];
// mapColor() får ikke støyen fra kjernen; height() kalles alltid først for samme verden og husker den her.
let mapNoise = null;

export default {
  key: 'city',
  name: 'By',
  icon: '🏙️',
  surface: 'stone',
  lakeFactor: 0,

  height(x, z, c) {
    // Rolige bølger mellom ca. 4 og 8 m (to billige støykall i tillegg til de ferdig utregnede)
    mapNoise = c.n;
    const swell = c.n.mount.noise2D(x * 0.0023 - 41.7, z * 0.0023 + 18.3);
    return 6 + c.base * 2.4 + swell * 0.8 + c.detail * 0.08;
  },

  color(c, out) {
    const { x, z, h, v, v2, w } = c;
    const s = locate(x, z);
    let r, g, b;
    if (s.zone === ROADZ) {
      // Asfalt (midtrabatten dekkes av egen modell, så den tegnes som asfalt også på avstand)
      r = lerp(0.25, 0.3, v); g = r + 0.004; b = r + 0.02;
    } else if (s.zone === WALKZ) {
      r = lerp(0.6, 0.65, v); g = r - 0.012; b = r - 0.045;
    } else {
      lotColor(blockKind(c.n, s.bx, s.bz), s, x, z, v, v2, _lc);
      r = _lc[0]; g = _lc[1]; b = _lc[2];
      // Utkanten: tørt gress og jord på tomtene
      const dry = smoothstep(0.97, 0.82, w) * 0.65;
      r = lerp(r, 0.72, dry); g = lerp(g, 0.63, dry); b = lerp(b, 0.4, dry);
    }
    // Utenfor bebyggelsen blir gatene til jordveier og fortauene til tørt gress, som så glir over i savannen
    if (s.zone !== LOTZ) {
      const rural = smoothstep(0.93, 0.62, w);
      const road = s.zone === ROADZ;
      r = lerp(r, road ? 0.6 : 0.72, rural); g = lerp(g, road ? 0.49 : 0.63, rural); b = lerp(b, road ? 0.35 : 0.4, rural);
    }
    // Sandstrand og strandkant mot havet
    const beach = 1 - smoothstep(0.9, 2.3, h);
    r = lerp(r, 0.78, beach); g = lerp(g, 0.72, beach); b = lerp(b, 0.56, beach);
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapColor(h, x, z, out) {
    const s = locate(x, z);
    let r = 186, g = 182, b = 172;
    if (h < 2) { r = 206; g = 194; b = 152; }
    else if (s.zone === ROADZ) { r = 92; g = 93; b = 99; }
    else if (s.zone === WALKZ) { r = 150; g = 148; b = 142; }
    else if (mapNoise) {
      const c = MAP_COLORS[blockKind(mapNoise, s.bx, s.bz)];
      r = c[0]; g = c[1]; b = c[2];
      if (c === MAP_COLORS[PARK] && onParkPath(s.px, s.pz)) { r = 198; g = 188; b = 160; }
    }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  // Havnevann: blågrått og litt grumsete
  mapWater: [[86, 128, 146], [40, 82, 112]],

  /** Tilfeldig vegetasjon: busker i hager og parker, spredt kratt i utkanten. Ingenting i gatene. */
  pick(p, r2, r3) {
    const { h, x, z } = p;
    if (h < 1) return null;
    const s = locate(x, z);
    if (s.zone !== LOTZ) return null;
    if (p.w < MIN_W) {
      if (r2 > 0.1) return null;
      return r3 < 0.55 ? 'bush' : r3 < 0.8 ? 'deadBush' : 'city_jacaranda';
    }
    switch (blockKind(p.gen.noise, s.bx, s.bz)) {
      case PARK:
        // Hold stiene, benkene og midtplassen fri
        if (Math.abs(s.px) < 4.5 || Math.abs(s.pz) < 4.5 || s.px * s.px + s.pz * s.pz < 100 || r2 > 0.5) return null;
        return pickByTable(r3, PARK_VEG);
      case HOUSES:
        return r2 < 0.16 ? 'bush' : null;
      case FLATS:
        return r2 < 0.08 ? 'bush' : null;
      case EMPTY:
        if (r2 > 0.22) return null;
        return r3 < 0.45 ? 'bush' : 'deadBush';
      default:
        return null;
    }
  },

  structures(api) {
    const b0x = Math.round(api.x0 / B), b0z = Math.round(api.z0 / B), nb = Math.round(api.size / B);
    for (let j = 0; j < nb; j++) for (let i = 0; i < nb; i++) buildBlock(api, b0x + i, b0z + j);
  },

  /** Pynt: gress og blomster i parker, hager og gårder. */
  decor(p, r1, r2) {
    const { h, x, z } = p;
    if (h < 1) return null;
    const s = locate(x, z);
    if (s.zone !== LOTZ) return null;
    if (p.w < MIN_W) return r2 < 0.5 ? 'grass' : null;
    switch (blockKind(p.gen.noise, s.bx, s.bz)) {
      case PARK:
        if (onParkPath(s.px, s.pz)) return null;
        return r2 < 0.16 ? 'flowers' : 'grass';
      case HOUSES:
        return r2 < 0.08 ? 'flowers' : r2 < 0.5 ? 'grass' : null;
      case FLATS:
        return r2 < 0.35 ? 'grass' : null;
      case EMPTY:
        return r2 < 0.6 ? 'grass' : null;
      default:
        return null;
    }
  },

  vegInfo: VEG,

  fauna: {
    predators: [['dog', 1]],
    aquatic: null,
    friendly: ['cat', 'parrot'],
    caged: ['parrot', 'turtle', 'cat'],
  },
  camp: { style: 'container', minH: 0.8, slope: 0.9, dryRadius: 10 },
  ambient: { city: true, wind: 0.03 },
  atmosphere: { fog: 0xc9c7c0, water: 0x3c5f6e, sky: 0x5b86c0, fogScale: 0.9 },
};
