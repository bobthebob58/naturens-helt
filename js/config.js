// Sentral konfigurasjon. Juster tall her for å balansere spillet.

export const WORLD = {
  size: 4096,          // verdens bredde/dybde i meter (megastor!)
  chunkSize: 128,      // terrengbit
  cell: 4,             // fineste rutenett (m) for terreng og fysikk
  waterLevel: 0,
};

export const QUALITY = {
  low:    { name: 'Lav',     viewRadius: 4, vegRadius: 2, grassRadius: 0, shadows: 0,    pixelRatio: 1, antialias: false },
  medium: { name: 'Middels', viewRadius: 6, vegRadius: 2, grassRadius: 1, shadows: 1024, pixelRatio: 1, antialias: true },
  high:   { name: 'Høy',     viewRadius: 8, vegRadius: 3, grassRadius: 1, shadows: 2048, pixelRatio: 1.5, antialias: true },
};

export const DIFFICULTY = {
  easy: {
    key: 'easy', name: 'Lett',
    desc: 'Fiender ser kort og treffer sjelden. Perfekt for å utforske.',
    damageMult: 0.55, sightRadius: 26, hearMult: 0.7, awarenessRate: 0.55,
    accuracy: 0.32, fireInterval: 2.6, poachers: 8, maxPredators: 3, startCoins: 80,
  },
  medium: {
    key: 'medium', name: 'Medium',
    desc: 'Balansert utfordring. Snik deg innpå – eller ta støyten.',
    damageMult: 1.0, sightRadius: 40, hearMult: 1.0, awarenessRate: 1.0,
    accuracy: 0.48, fireInterval: 1.9, poachers: 12, maxPredators: 4, startCoins: 50,
  },
  hard: {
    key: 'hard', name: 'Vanskelig',
    desc: 'Skarpe øyne, hardt skyts og flere krypskyttere. Kun for ekte helter.',
    damageMult: 1.6, sightRadius: 58, hearMult: 1.35, awarenessRate: 1.6,
    accuracy: 0.6, fireInterval: 1.35, poachers: 16, maxPredators: 6, startCoins: 25,
  },
};

export const WEAPONS = {
  machete: {
    id: 'machete', name: 'Machete', type: 'melee', damage: 34, range: 2.9, cooldown: 0.55,
    price: 0, icon: '🗡️', desc: 'Startvåpen. Snik deg innpå en krypskytter for å få ham til å overgi seg med ett slag.',
  },
  slingshot: {
    id: 'slingshot', name: 'Sprettert', type: 'ranged', damage: 26, speed: 48, gravity: 9.8, cooldown: 0.7,
    price: 150, icon: '🪨', projectile: 'stone', desc: 'Skyter steiner. Stille og grei rekkevidde.',
  },
  bow: {
    id: 'bow', name: 'Pil og bue', type: 'ranged', damage: 52, speed: 75, gravity: 5, cooldown: 1.0,
    price: 450, icon: '🏹', projectile: 'arrow', desc: 'Kraftig og presis på lang avstand.',
  },
  tranq: {
    id: 'tranq', name: 'Bedøvelsesgevær', type: 'ranged', damage: 100, speed: 140, gravity: 1, cooldown: 1.3,
    price: 1100, icon: '💉', projectile: 'dart', desc: 'Stopper en krypskytter med ett treff. Ingen skader – bare søvn.',
  },
};
export const WEAPON_ORDER = ['machete', 'slingshot', 'bow', 'tranq'];

export const VEHICLES = {
  bike: {
    id: 'bike', name: 'Rusten sykkel', kind: 'land', icon: '🚲', price: 0,
    maxSpeed: 10.5, accel: 5, brake: 10, turnRate: 2.4, reverse: 2.5, camDist: 5, camHeight: 1.7,
    seat: { x: 0, y: 0.95, z: -0.15 }, eye: 1.65, pose: 'bike', collideRadius: 0.6, grip: 0.9,
    desc: 'Gammel og knirkete, men den ruller.',
  },
  car: {
    id: 'car', name: 'Terrengbil', kind: 'land', icon: '🚙', price: 600,
    maxSpeed: 27, accel: 11, brake: 22, turnRate: 1.7, reverse: 8, camDist: 8, camHeight: 2.6,
    seat: { x: -0.42, y: 0.75, z: 0.1 }, eye: 1.2, pose: 'sit', collideRadius: 1.4, grip: 1,
    desc: 'Rask på land og tåler tøft terreng.',
  },
  boat: {
    id: 'boat', name: 'Motorbåt', kind: 'water', icon: '🚤', price: 450,
    maxSpeed: 19, accel: 7, brake: 9, turnRate: 1.3, reverse: 5, camDist: 8, camHeight: 2.6,
    seat: { x: 0, y: 0.45, z: -1.0 }, eye: 1.1, pose: 'sit', collideRadius: 1.4, grip: 0.6,
    desc: 'Kryss innsjøer og hav. Hold deg unna haiene!',
  },
  heli: {
    id: 'heli', name: 'Helikopter', kind: 'air', icon: '🚁', price: 2200,
    maxSpeed: 38, accel: 10, climb: 11, turnRate: 1.6, camDist: 14, camHeight: 3.5,
    seat: { x: 0, y: 0.95, z: 0.7 }, eye: 1.15, pose: 'sit', collideRadius: 2.6, grip: 1,
    desc: 'Fly over hele verden. Space: opp, Shift: ned.',
  },
};
export const VEHICLE_ORDER = ['bike', 'car', 'boat', 'heli'];

export const SHOP = [
  { category: 'Våpen', items: [
    { id: 'slingshot', kind: 'weapon' },
    { id: 'bow', kind: 'weapon' },
    { id: 'tranq', kind: 'weapon' },
  ] },
  { category: 'Medisin', items: [
    { id: 'medicine', kind: 'item', name: 'Medisin', icon: '💊', price: 40, desc: '+35 helse. Bruk med H.' },
    { id: 'medkit', kind: 'item', name: 'Førstehjelpsskrin', icon: '🩹', price: 100, desc: 'Full helse. Bruk med H.' },
  ] },
  { category: 'Mat og vann til dyr', items: [
    { id: 'food', kind: 'item', name: 'Dyremat', icon: '🥕', price: 20, desc: 'Til sultne dyr du møter.' },
    { id: 'water', kind: 'item', name: 'Vann til dyr', icon: '💧', price: 15, desc: 'Til tørste dyr du møter.' },
  ] },
  { category: 'Kjøretøy', items: [
    { id: 'car', kind: 'vehicle' },
    { id: 'boat', kind: 'vehicle' },
    { id: 'heli', kind: 'vehicle' },
  ] },
];

export const ITEM_INFO = {
  medicine: { name: 'Medisin', icon: '💊', heal: 35 },
  medkit: { name: 'Førstehjelpsskrin', icon: '🩹', heal: 100 },
  food: { name: 'Dyremat', icon: '🥕' },
  water: { name: 'Vann', icon: '💧' },
};

/** Fiender og dyr. Skade multipliseres med vanskelighetsgrad. */
export const ENEMIES = {
  poacher:   { name: 'Krypskytter', hp: 100, damage: 11, range: 62, speed: 3.2, runSpeed: 5.2, reward: 75 },
  bear:      { name: 'bjørn', hp: 130, damage: 18, speed: 2.2, runSpeed: 8.5, reach: 2.3, cooldown: 1.2, sight: 0.75 },
  polarbear: { name: 'isbjørn', hp: 150, damage: 21, speed: 2.0, runSpeed: 8.2, reach: 2.4, cooldown: 1.3, sight: 0.85 },
  wolf:      { name: 'ulv', hp: 60, damage: 9, speed: 3.0, runSpeed: 10.5, reach: 1.7, cooldown: 0.8, sight: 0.9 },
  scorpion:  { name: 'kjempeskorpion', hp: 55, damage: 8, speed: 1.8, runSpeed: 6.5, reach: 1.7, cooldown: 1.0, sight: 0.5 },
  shark:     { name: 'hai', hp: 110, damage: 24, speed: 3.0, runSpeed: 8.5, reach: 2.4, cooldown: 1.4, sight: 0.9 },
};

export const REWARDS = {
  poacher: 75,
  cage: 90,
  feed: [40, 70],
  water: [35, 60],
  medicine: [120, 170],
  fetch: [70, 130],
};
