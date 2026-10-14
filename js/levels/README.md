# Baner, biomer og arter – utviklerkontrakt

Spillet har tre baner (`levels.js`). Hver bane har tre **biomer** i bånd fra nord til sør
(`bands: [nord, midten, sør]`). Spilleren starter i midtbiomet. Overgangene mellom biomer blandes
myk (100–250 m brede soner), og høyde/farge blandes lineært etter biomvektene.

| Bane | Nord | Midten (start) | Sør |
| --- | --- | --- | --- |
| 1 Nordlig villmark | `ice` | `forest` | `desert` |
| 2 Tropisk villmark | `islands` | `rainforest` | `swamp` |
| 3 Savanne og fjell | `mountains` | `savanna` | `city` |

Verden er 4096 × 4096 m (x og z fra −2048 til 2048). **Nord = negativ z.** Vannflaten ligger på y = 0.
Hav rundt hele verden og generelle innsjøer legges på av `worldgen.js` (innsjøer skaleres med `lakeFactor`).

## Filer per biom

* `biomes/<key>.js` – **ren JavaScript uten Three.js** (testes i Node). Default-eksport = biomdefinisjon.
  Kan importere fra `../../utils/math.js` og `./forest.js` (f.eks. `pickByTable`).
* `biomes/<key>Models.js` – Three.js-geometri: `export const MODELS = { typeNavn: () => BufferGeometry }`.
  Bygg med hjelperne i `../../models/geo.js` (`paint, xf, merge, jitter, shadeVariation, box, cyl, cone, sphere, ico`)
  og gjenbrukbare byggere i `../../models/vegetation.js` (`pine, oak, birch, bush, rock, palm, grass, flowers, jIco`).
  Geometrien **må** komme fra `merge([...])` (ikke-indeksert, med `position`, `normal` og `color`), ha origo midt på
  bunnen (y = 0 på bakken) og være lavpolygon (helst < 1500 trekanter per type). Den tegnes med `InstancedMesh`
  og et `MeshLambertMaterial({ vertexColors: true })`.

## Biomdefinisjon (felt)

```js
export default {
  key: 'rainforest',            // samme som filnavnet
  name: 'Regnskog',             // vises i HUD og meny
  icon: '🌴',
  surface: 'grass',             // fotsteg/partikler: 'grass' | 'sand' | 'snow' | 'mud' | 'stone'
  lakeFactor: 1,                // 0 = ingen generelle innsjøer, 1 = normalt
  height(x, z, c) { return h },          // meter. c = { n, base, detail, w, half }
  color(c, out) { out[0..2] = sRGB 0..1; return out },
  mapColor(h, x, z, out) { out[0..2] = 0..255; return out },   // kartfarge på land
  mapWater: [[r,g,b], [r,g,b]],          // valgfri: kartfarge for grunt/dypt vann
  pick(p, r2, r3) { return type | null }, // vegetasjon på land. p = { h, ny, x, z, w, gen }
  pickWater(p, r2, r3) { ... },           // valgfri: under vann (h < 0.35). p.depth = vanndybde
  decor(p, r1, r2) { return type | null },// pynt (gress o.l.) uten kollisjon. p = { h, x, z, w, gen }
  scale(type, r4) { return s | undefined },// valgfri: egen skalering
  structures(api) { ... },                // valgfri: strukturert plassering (byer). Se under.
  vegInfo: { type: { ... } },             // se under – ALLE typer biomet bruker
  fauna: { predators: [['jaguar', 0.6], ['boar', 0.4]], aquatic: 'crocodile', friendly: [...], caged: [...] },
  camp: { style: 'tent' | 'container', minH: 2.5, maxH: 62, dryRadius: 18, dryH: 1, slope: 0.88 },
  spawn: { minH: 3, maxH: 18, dry: 1.2 }, // bare midtbiomer: krav til startpunktet
  ambient: { wind: 0.04, birds: true | 'many', insects: true, frogs: true, city: true },
  atmosphere: { fog: 0xc4dbe9, water: 0x2a6a86, sky: 0x3b7bc4, fogScale: 1, waterOpacity: 0.82 }, // fogScale < 1 = tettere tåke
};
```

### `height(x, z, c)`
* `c.n` er seedede `SimplexNoise`-instanser: `base, detail, lake, mount, color, extra, temp`.
  Metoder: `noise2D(x, y)` ≈ [−1, 1], `fbm(x, y, oktaver)` ≈ [−1, 1], `ridged(x, y, oktaver)` ≈ [0, 1].
* `c.base` = `n.base.fbm(x*0.0016, z*0.0016, 4)` og `c.detail` = `n.detail.fbm(x*0.011, z*0.011, 3)` er ferdig regnet ut.
* `c.w` = biomets vekt i punktet (0..1). Ikke bruk den til å skalere høyden – blandingen gjøres utenfor.
* Må være glatt (terrengnettet har 4 m oppløsning; bratte kanter bør strekke seg over ≥ 8 m),
  typisk mellom −20 og 140 m, og rask (≤ ~8 støykall, ingen allokering) – den kalles flere hundre tusen ganger.

### `color(c, out)`
`c = { x, z, h, ny, steep, v, v2, w, n }` der `ny` er normalens y (1 = flatt), `steep` 0..1 og `v`, `v2` er
fargestøy 0..1 (lav/høy frekvens). Skriv **sRGB 0..1**. Mørkning under vann gjøres globalt etterpå.

### Vegetasjon
For hver terrengbit (128 × 128 m) trekkes 100 tilfeldige kandidatpunkter. Kjernen velger biom etter vektene og
kaller `pick` (på land) eller `pickWater` (under vann). Returner `null` for å hoppe over – det styrer tettheten
(f.eks. `if (r2 > 0.6) return null`). 170 kandidater per bit går til `decor`.

`pickWater` kalles for kandidater med −6 ≤ h < 0.35 (også rett over vannflaten; da er `p.depth` negativ).
Vannplanter kan ha `decor: true` (dobbeltsidig, vind, ingen skygge) eller `float: true` (ligger i vannflaten).
`structures(api)` kan også brukes til ekstra vegetasjon når 100 kandidater er for lite (f.eks. tett regnskog).

**Typenavn**: nye typer skal ha biomnøkkel som prefiks (`rainforest_kapok`). Eksisterende typer fra bane 1 kan
gjenbrukes (`pine, snowPine, oak, birch, bush, berryBush, rock, rock2, desertRock, iceRock, cactus, deadBush, palm,
iceSpike, grass, flowers, snowDrift, log`) – kopier da `vegInfo`-oppføringen nøyaktig fra `forest.js`/`desert.js`/`ice.js`.

### `vegInfo` per type (alle felt valgfrie)
| Felt | Betydning |
| --- | --- |
| `radius` | Solid kollisjonsradius ved skala 1 (stamme/stein). 0 = kan gås gjennom |
| `cover` | Radius som gir dekning (snik) |
| `foliage: { r, y0, y1 }` | Trekrone – kameraet holdes utenfor |
| `rock: true` | Standard steinskalering (0.6–2.4) og nedsenking |
| `scale: [min, maks, potens]` | Skalering `min + (maks−min)·r^potens` |
| `sink` | Hvor mye modellen senkes ned i bakken (m) |
| `height` | Høyde ved skala 1 (brukes til å stoppe prosjektiler) |
| `decor: true` | Pynt fra `decor()` – dobbeltsidig, vind, ingen kollisjon |
| `float: true` | Plasseres i vannflaten (vannliljer o.l. fra `pickWater`) |
| `static: true` | Ingen vindsvai (bygninger, skilt, biler) |
| `noShadow: true` | Kaster ikke skygge |
| `near: true` | Tegnes bare innen én terrengbit fra spilleren (lav undervegetasjon – sparer ytelse; dekning gjelder likevel) |
| `box: { hw, hd, h }` | Rektangulær kollisjon (halv bredde x, halv dybde z, høyde) for bygninger. Blokkerer sikt (`blocksSight: false` for å slå av). Roter kun i hele 90° |

### `structures(api)` (by)
Kalles én gang per terrengbit før den tilfeldige vegetasjonen. `api = { cx, cz, x0, z0, size, gen, rng, weightAt(x, z),
inClearing(x, z, pad), emit(type, x, z, s = 1, ry = 0, y = null) }`. `emit` plasserer en type (setter bakkehøyde selv)
og hopper over punkter i lysninger eller oppå andre bokser. Oppgis `y`, trekkes typens `sink` fra den. Bruk et rutenett låst til verdenskoordinater slik at
gater fortsetter sømløst over bitgrensene. Tilfeldig vegetasjon unngår automatisk boksene.

### Fauna
`fauna.predators` er vektede rovdyr på land, `aquatic` er vannrovdyret (eller `null`), `friendly` er dyr som kan trenge
mat/vann (oppdrag), `caged` er dyr krypskytterne holder i bur (bør være små/mellomstore).

## Arter (`fauna.js`, `../models/fauna/*.js`)
`export const SPECIES = { key: { name, definite, article, height, radius, habitat, stats, pack, createRig } }` –
se kommentaren øverst i `fauna.js`. Rigger implementerer `{ root: THREE.Object3D, update(dt, speed, state) }` med
tilstandene `'idle' | 'walk' | 'run' | 'eat' | 'attack' | 'happy' | 'swim'` (ukjente tilstander skal tåles). Modellen ser
langs +Z, står på y = 0 (vannarter: midt i kroppen). `QuadrupedRig` i `../models/characters.js` tar også et eget
definisjonsobjekt (samme felt som `ANIMAL_DEFS`) – bruk det og legg til detaljer (striper, man, horn …) på `rig.bodyG`,
`rig.head` og `rig.neck` med `addBox` eller egne meshes.
