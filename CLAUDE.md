# Naturens Helt – arbeidsregler for Claude

3D-spill i nettleseren (Three.js 0.170 fra CDN, ES-moduler, **ingen byggesteg**). Publiseres med GitHub Pages fra `main`.
All tekst i spillet, kodekommentarer, commit-meldinger og PR-beskrivelser skrives på **norsk**.

## Kart over koden
- `README.md` – spillet, kontroller, baner og mappestruktur.
- `js/levels/README.md` – **kontrakten for baner, biomer, vegetasjon og dyrearter**. Les den før du lager/endrer et biom eller en art.
- `js/main.js` (spill-løkke, tilstander), `js/config.js` (balansering), `js/world/` (terreng, vegetasjon, leirer),
  `js/entities/` (spiller, dyr, krypskyttere, kjøretøy), `js/ui/` (HUD, menyer, `touch.js` for mobil), `js/core/` (input, lyd, lagring).
- Les store filer i biter (`grep -n`, `sed -n 'a,bp'`) i stedet for hele filen.

## Kommandoer (kjør `npm install` først i en ny økt)
| Kommando | Hva | Tid |
| --- | --- | --- |
| `npm test` | ESLint + Node-kontroller (verden, modeller, trekantbudsjett, arter, leirer) | ~3 s |
| `npm run smoke` | Starter alle baner i headless Chromium og besøker alle biomer/arter (`… smoke 2` = bare bane 2) | 1–4 min |
| `npm run touch` | Berøringskontroller på liggende telefon | ~1 min |
| `node tools/run.mjs gallery crocodile:swim@side …` | Galleri over dyrerigger (`tools/out/gallery.png`) | ~30 s |
| `node tools/run.mjs docs 2` | Dokumentasjonsbilder for bane 2/3 (`Q=high W=1280 H=720`) | 5–10 min |
| `node tools/levelmap.mjs 3 12345` | Verdenskart for en bane som PNG (uten nettleser) | ~5 s |
| `npm start` | Spillet på http://localhost:8000 | – |

Nettleseren i sandkassen bruker SwiftShader og er treg (1–8 bilder/s): vent på spilltid (`sleep()` i `tools/scenarios/common.mjs`),
ikke veggklokke. `?nolock` hopper over PointerLock, `?touch` tvinger berøringsmodus, `window.__game` gir tilgang til spillet.
Bilder havner i `tools/out/` (ignoreres av git). GitHub Actions (`.github/workflows/check.yml`) kjører `npm test`, `smoke` og `touch` på hver PR.

## Ferdig betyr
1. `npm test` er grønn (ingen feil, se på advarslene).
2. Endringer i spillogikk eller grafikk: kjør `npm run smoke` (eller det relevante scenariet) og se på minst ett skjermbilde.
3. Synlige endringer: oppdater `README.md` (og `js/levels/README.md` ved nye regler for biomer/arter).
4. Små, tematiske commits. Én funksjon per gren/PR.

## Kostnadsregler (spar kreditter)
- **Ingen multi-agent-arbeidsflyter (Workflow) eller underagenter** med mindre brukeren ber om det i meldingen, eller oppgaven er
  stor (ny bane/biomsett, stor gjennomgang før fletting). Gjør vanlige oppgaver selv.
- Bruk billige kontroller først: `npm test` (sekunder) før nettleseren. Maks noen få nettleserkjøringer per oppgave,
  med lite vindu og `Q=low` – unntatt når det skal tas dokumentasjonsbilder.
- Ikke ta nye dokumentasjonsbilder uten at det synlige er endret. Ikke les bilder inn i samtalen uten grunn.
- Ikke les hele store filer; søk og les utsnitt. Ikke gjenta undersøkelser – stol på denne filen og README-ene.
- Spør før store omskrivinger eller endringer utenfor oppgaven. Hold økten til én oppgave; start en ny økt for neste funksjon.

## Konvensjoner
- 2 mellomrom, enkle anførselstegn, semikolon. Kommentarer forklarer *hvorfor*, på norsk.
- Ingen nye avhengigheter i selve spillet (bare Three.js fra CDN, låst til 0.170.0). `package.json` er kun for utviklerverktøy.
- 3D-modeller bygges med hjelperne i `js/models/geo.js` og `merge()` (ikke-indeksert, vertex-farger). Hold vegetasjon under
  ~1500 trekanter per modell; `npm run check` varsler når en terrengbit passerer 20 000 trekanter.
- Biommoduler (`js/levels/biomes/<key>.js`) er ren JavaScript uten Three.js, så de kan testes i Node.
- Lagring: `js/core/save.js` (versjonert). Gamle lagringer uten `level` lastes som bane 1 – ikke bryt dette.
