// Artsregister: alle dyr i spillet med navn, størrelse, statistikk og rigg.
//
// Felt per art:
//   name       ubestemt form, liten forbokstav ('bjørn')        – brukes i «Du ble angrepet av en bjørn»
//   definite   bestemt form ('bjørnen')                          – brukes i «Bjørnen angriper deg!»
//   article    'en' | 'ei' | 'et'
//   height     omtrentlig høyde i meter (plassering av ikoner over hodet)
//   radius     treffradius / kollisjonsradius i meter
//   length     valgfri lengde fra snute til bakende/halespiss i meter (skalering av dyr i bur)
//   habitat    'land' (standard) | 'water' (kun dypt vann, som hai) | 'amphibious' (land og vann, som krokodille)
//   swimSink   amfibiske arter: hvor dypt føttene (y = 0) ligger under vannflaten når dyret svømmer
//   swimDepth  amfibiske arter: vanndybden der dyret begynner å svømme
//   stats      kun for rovdyr: { hp, damage, speed, runSpeed, reach, cooldown, sight }
//   pack       valgfri [min, maks] flokkstørrelse for rovdyr
//   createRig  () => rigg med { root: THREE.Object3D, update(dt, speed, state) }
//              state: 'idle' | 'walk' | 'run' | 'eat' | 'attack' | 'happy' | 'swim'
import { ENEMIES } from '../config.js';
import { createAnimalRig } from '../models/characters.js';
import { SPECIES as QUADRUPEDS } from '../models/fauna/quadrupeds.js';
import { SPECIES as SPECIAL } from '../models/fauna/special.js';

const base = (key, name, definite, article, height, radius, extra = {}) => ({
  name, definite, article, height, radius, habitat: 'land',
  stats: ENEMIES[key] || null,
  createRig: () => createAnimalRig(key),
  ...extra,
});

const BASE = {
  bear: base('bear', 'bjørn', 'bjørnen', 'en', 1.9, 0.95),
  polarbear: base('polarbear', 'isbjørn', 'isbjørnen', 'en', 2.0, 1.0),
  wolf: base('wolf', 'ulv', 'ulven', 'en', 1.3, 0.6, { pack: [1, 2] }),
  scorpion: base('scorpion', 'kjempeskorpion', 'kjempeskorpionen', 'en', 1.3, 0.7),
  shark: base('shark', 'hai', 'haien', 'en', 1.2, 1.0, { habitat: 'water' }),
  deer: base('deer', 'hjort', 'hjorten', 'en', 2.2, 0.6),
  reindeer: base('reindeer', 'reinsdyr', 'reinsdyret', 'et', 2.1, 0.6),
  fox: base('fox', 'rev', 'reven', 'en', 0.9, 0.4),
  fennec: base('fennec', 'ørkenrev', 'ørkenreven', 'en', 0.8, 0.35),
  camel: base('camel', 'kamel', 'kamelen', 'en', 3.0, 0.9),
  penguin: base('penguin', 'pingvin', 'pingvinen', 'en', 1.4, 0.4),
  rabbit: base('rabbit', 'hare', 'haren', 'en', 0.8, 0.3),
};

export const SPECIES = { ...BASE, ...QUADRUPEDS, ...SPECIAL };

const FALLBACK = BASE.fox;

export function species(key) {
  return SPECIES[key] || FALLBACK;
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
