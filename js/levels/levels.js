// Baner (verdener) og biomregister. Hver bane har tre biomer i bånd: nord, midten og sør.
// Spilleren starter alltid i midtbiomet. Rene data – ingen Three.js.
import forest from './biomes/forest.js';
import desert from './biomes/desert.js';
import ice from './biomes/ice.js';
import rainforest from './biomes/rainforest.js';
import islands from './biomes/islands.js';
import swamp from './biomes/swamp.js';
import savanna from './biomes/savanna.js';
import mountains from './biomes/mountains.js';
import city from './biomes/city.js';

export const BIOMES = { forest, desert, ice, rainforest, islands, swamp, savanna, mountains, city };

export const LEVELS = {
  1: {
    id: 1,
    name: 'Nordlig villmark',
    icon: '🌲',
    desc: 'Skog, ørken og isverden. Den klassiske villmarken.',
    bands: ['ice', 'forest', 'desert'],
    intro: 'Krypskyttere herjer i skogen, ørkenen og isverdenen',
    ranger: 'Skogvokter',
  },
  2: {
    id: 2,
    name: 'Tropisk villmark',
    icon: '🌴',
    desc: 'Tett regnskog, sumpland med krokodiller og en skjærgård av tropiske øyer.',
    bands: ['islands', 'rainforest', 'swamp'],
    intro: 'Krypskyttere jakter i regnskogen, sumpen og på de tropiske øyene',
    ranger: 'Regnskogvokter',
  },
  3: {
    id: 3,
    name: 'Savanne og fjell',
    icon: '🦁',
    desc: 'Afrikansk savanne, høye fjell og en by der smuglerne gjemmer seg.',
    bands: ['mountains', 'savanna', 'city'],
    intro: 'Krypskyttere herjer på savannen, i fjellene og smugler dyr gjennom byen',
    ranger: 'Parkvokter',
  },
};

/** Samlet info om alle vegetasjons-/gjenstandstyper på tvers av biomer. */
export const VEG_INFO = {};
for (const b of Object.values(BIOMES)) Object.assign(VEG_INFO, b.vegInfo || {});

export function getLevel(id) {
  return LEVELS[id] || LEVELS[1];
}
