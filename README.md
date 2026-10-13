# 🌿 Naturens Helt

Et 3D-spill i nettleseren (HTML, CSS og JavaScript med [Three.js](https://threejs.org) via CDN).
Utforsk en megastor verden med skog, ørken og isverden, hjelp dyr og mennesker – og stopp alle krypskytterne. Ingen blod: krypskyttere overgir seg og blir arrestert, og dyr blir bare skremt bort.

## Slik starter du spillet

Spillet bruker JavaScript-moduler, så det må serveres fra en webserver (ikke åpnes direkte som fil):

```bash
python3 -m http.server 8000
# eller
npx serve .
```

Åpne så <http://localhost:8000>. Spillet kan også publiseres gratis med GitHub Pages (Settings → Pages → «Deploy from a branch»).

## Kontroller

| Tast | Handling |
| --- | --- |
| W A S D | Gå / styre kjøretøy |
| Shift | Løp (helikopter: ned) |
| Space | Hopp (helikopter: opp, bil: brems) |
| Mus | Se deg rundt (PointerLock) |
| Venstreklikk / C | Gå på huk – snik (i vann: dykk) |
| Høyreklikk / F | Angrip |
| 1–4 / musehjul | Bytt våpen |
| E | Samhandle · stig på/av · hent valgt kjøretøy |
| Q | Velg kjøretøy |
| H | Bruk medisin |
| B | Butikk |
| M | Verdenskart |
| V | Bytt mellom 1. og 3. person |
| Esc | Pause |

## Innhold

- **Verden:** 4 × 4 km prosedyrisk generert terreng med isverden (nord), skog (midten), ørken (sør), innsjøer og hav rundt. Terrenget strømmes inn i biter med detaljnivå etter avstand.
- **Skatter:** Skattekister er gjemt ved trær og steiner, på fjelltopper og på bunnen av innsjøer.
- **Snik:** Gå på huk for å senke kameraet, bevege deg saktere og bli mye vanskeligere å oppdage – særlig i busker. Snikangrep med macheten får en krypskytter til å overgi seg med én gang.
- **Fiender:** Krypskyttere og rovdyr (bjørn, isbjørn, ulv, kjempeskorpion og hai) vet ikke hvor du er. De har synsradius, synsfelt og hørsel, og angriper først når de oppdager deg.
- **Helse og pust:** 100 helse. Du kan bli skutt, angrepet av dyr eller drukne hvis du er for lenge i vannet uten båt.
- **Økonomi:** Tjen mynter på skatter, side-oppdrag (mistede sekker, sultne/tørste dyr, skadde klatrere, dyr i bur) og arrestasjoner. Kjøp våpen, medisin, dyremat/vann og kjøretøy i butikken (B).
- **Kjøretøy:** Rusten sykkel (start), terrengbil, motorbåt og helikopter.
- **Vanskelighetsgrad:** Lett, Medium og Vanskelig påvirker fiendenes skade, synsradius og antall krypskyttere.
- **Seier:** Stopp alle krypskytterne. Verdenskartet (M) viser områder der det er rapportert krypskytteraktivitet.
- **Lagring:** Spillet lagres automatisk i nettleseren og kan fortsettes fra hovedmenyen.

## Kodestruktur

```
index.html          HUD og menyer
css/style.css       Stil
js/main.js          Spill-løkke og tilstander
js/config.js        Balansering: vanskelighetsgrad, våpen, kjøretøy, butikk
js/world/           Terrenggenerering, biter (chunks), vegetasjon, himmel/vann, leirer
js/models/          Prosedyriske 3D-modeller (trær, figurer, kjøretøy, gjenstander)
js/entities/        Spiller, kjøretøy, krypskyttere, dyr, mennesker, AI
js/systems/         Kamp, partikler, oppdrag
js/ui/              HUD, minikart/verdenskart, menyer og butikk
js/core/            Input, lyd (Web Audio) og lagring
```
