// Naturens Helt – hovedmodul. Setter opp renderer, verden, systemer og spill-løkken.
import * as THREE from 'three';
import { QUALITY, DIFFICULTY, WEAPONS, WEAPON_ORDER, VEHICLES, ITEM_INFO, REWARDS, SHOP } from './config.js';
import { WorldGen } from './world/worldgen.js';
import { FeatureStore } from './world/features.js';
import { ChunkManager } from './world/chunks.js';
import { Environment } from './world/environment.js';
import { Player } from './entities/player.js';
import { EntityManager } from './entities/entityManager.js';
import { Combat } from './systems/combat.js';
import { Particles } from './systems/particles.js';
import { QuestManager } from './systems/quests.js';
import { Input } from './core/input.js';
import { AudioSystem } from './core/audio.js';
import { saveGame, loadSave, loadSettings, saveSettings } from './core/save.js';
import { HUD } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { Menus } from './ui/menus.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const TIPS = [
  'Tips: Gå på huk (venstreklikk) og gjem deg i busker – da er du nesten usynlig.',
  'Tips: Sniker du deg innpå en krypskytter med macheten, overgir han seg med én gang.',
  'Tips: Skattekister glimter svakt. Let ved trær, steiner, fjelltopper – og på bunnen av innsjøer!',
  'Tips: Uten båt kan du drukne hvis du svømmer for lenge. Følg med på pustemåleren.',
  'Tips: Verdenskartet (M) viser områder der krypskyttere er rapportert.',
  'Tips: Haier angriper bare svømmere – i båten er du trygg.',
  'Tips: Kjøp dyremat og vann i butikken (B) for å hjelpe sultne og tørste dyr.',
  'Tips: Løping lager lyd. Rovdyr og krypskyttere kan høre deg!',
];

function blankStats() {
  return { stopped: 0, totalPoachers: 0, coinsEarned: 0, chests: 0, quests: 0, animalsFreed: 0, animalsScared: 0, damageTaken: 0 };
}

class Game {
  constructor() {
    this.settings = { quality: 'medium', sensitivity: 1, volume: 0.7, camera: 'third', ...loadSettings() };
    this.params = new URLSearchParams(location.search);
    this.noLock = this.params.has('nolock');
    const q = QUALITY[this.settings.quality] || QUALITY.medium;

    this.renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.camera.position.set(0, 60, 0);
    this.scene.add(this.camera);

    this.input = new Input(this.renderer.domElement);
    this.input.sensitivity = this.settings.sensitivity;
    this.audio = new AudioSystem();
    this.audio.setVolume(this.settings.volume);
    this.particles = new Particles(this.scene);
    this.env = new Environment(this.scene, q);
    this.quality = q;
    this.entities = new EntityManager(this);
    this.combat = new Combat(this);
    this.quests = new QuestManager(this);
    this.hud = new HUD(this);
    this.minimap = new Minimap(this);
    this.menus = new Menus(this);
    this.chunks = null;
    this.gen = null;
    this.features = null;
    this.player = null;
    this.vehicles = {};
    this.extraColliders = [];
    this.stats = blankStats();
    this.stoppedIds = new Set();
    this.state = 'menu';
    this.time = 0;
    this.camShake = 0;
    this.interactable = null;
    this.nearestChest = { chest: null, dist: 1e9 };
    this.notifyT = {};
    this.autosaveT = 60;
    this.clock = new THREE.Clock();
    this.fps = 60;
    this.prof = { update: 0, render: 0 };

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    this.input.on('keydown', (e) => this.onKey(e));
    this.input.on('lockchange', (locked) => this.onLockChange(locked));
    this.menus.setContinueVisible(!!loadSave());
    this.menus.showOnly('menu');
    window.__game = this;
    this.renderer.setAnimationLoop(() => this.loop());
  }

  get difficulty() {
    return this._difficulty || DIFFICULTY.medium;
  }

  persistSettings() {
    saveSettings(this.settings);
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.particles.setScale((h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))));
  }

  applyQuality() {
    const q = QUALITY[this.settings.quality] || QUALITY.medium;
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.env.setQuality(q);
    if (this.chunks) this.chunks.setQuality(q);
    this.onResize();
  }

  // ------------------------------------------------------------------
  // Start / lasting
  async startNewGame(diffKey, sameWorld = false, levelId = null) {
    this.audio.init();
    const seed = sameWorld && this.gen ? this.gen.seed : Math.floor(Math.random() * 1e9);
    const level = levelId ?? (sameWorld && this.gen ? this.gen.level.id : this.menus.selectedLevel);
    await this.loadWorld(seed, diffKey, null, level);
  }

  async continueGame() {
    const save = loadSave();
    if (!save) return;
    this.audio.init();
    await this.loadWorld(save.seed, save.difficulty, save, save.level || 1);
  }

  async loadWorld(seed, diffKey, save, levelId = 1) {
    this.state = 'loading';
    this.input.unlock();
    this.hud.show(false);
    this.hud.clearTransient();
    this.menus.showOnly('loading');
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    this.menus.setLoading(0.02, 'Genererer verden …', tip);
    await nextFrame();
    this._difficulty = DIFFICULTY[diffKey] || DIFFICULTY.medium;

    // Rydd opp forrige spill
    this.audio.stopEngine();
    this.entities.reset();
    this.quests.reset();
    this.combat.reset();
    this.particles.clear();
    for (const v of Object.values(this.vehicles)) v.remove();
    this.vehicles = {};
    if (this.chunks) this.chunks.dispose();

    if (!this.gen || this.gen.seed !== seed || this.gen.level.id !== levelId) {
      this.gen = new WorldGen(seed, levelId);
      const names = this.gen.bands.map((b) => b.name.toLowerCase());
      await this.minimap.buildWorldMap(this.gen, (f) => this.menus.setLoading(0.05 + f * 0.5, `Former ${names[1]}, ${names[0]} og ${names[2]} …`));
    }
    this.features = new FeatureStore(this.gen);
    if (!this.chunks) this.chunks = new ChunkManager(this.scene, this.gen, this.features, this.quality);
    this.chunks.gen = this.gen;
    this.chunks.features = this.features;
    this.chunks.setQuality(this.quality);
    this.chunks.collected = new Set(save?.collectedChests || []);
    this.extraColliders = [];
    this.stats = { ...blankStats(), ...(save?.stats || {}) };
    this.stoppedIds = new Set(save?.stoppedPoachers || []);
    this.time = save?.time || 0;
    this.victoryT = 0;
    this.victoryShown = false;

    this.menus.setLoading(0.58, 'Setter opp krypskytterleirer …');
    await nextFrame();
    this.entities.setupCamps(save);
    if (!this.player) this.player = new Player(this);
    this.player.reset(save);
    this.player.cameraMode = this.settings.camera === 'first' ? 'first' : 'third';
    if (!save) this.entities.spawnIntroNPC();

    // Bygg terreng rundt spilleren
    this.menus.setLoading(0.62, 'Planter trær og gjemmer skatter …');
    this.chunks.lastCx = null;
    this.chunks.update(this.player.pos.x, this.player.pos.z, 0, 0);
    const total = this.chunks.jobs.length || 1;
    while (this.chunks.jobs.length) {
      const start = performance.now();
      while (this.chunks.jobs.length && performance.now() - start < 30) this.chunks._runJob(this.chunks.jobs.shift());
      this.menus.setLoading(0.62 + (1 - this.chunks.jobs.length / total) * 0.36);
      await nextFrame();
    }
    this.minimap.reset();
    this.menus.setLoading(1, 'Klar!');
    this.player.updateCamera(0, this.camera);
    this.env.snapAtmosphere(this.gen.biomeDef(this.player.pos.x, this.player.pos.z));
    this.env.update(0, 0, this.camera, this.player.pos, 10, this.gen.biomeDef(this.player.pos.x, this.player.pos.z));
    this.renderer.compile(this.scene, this.camera);
    await nextFrame();

    this.state = 'ready';
    this.hud.show(true);
    this.hud.markDirty();
    this.menus.showOnly('click-to-play');
    if (!save) {
      const lv = this.gen.level;
      this.hud.dialog(`${lv.ranger || 'Skogvokter'} Siri`,
        `${lv.intro} – ${this.stats.totalPoachers} av dem! Finn leirene (se kartet med M) og stopp dem alle. Gå på huk for å snike deg innpå.`, 12);
    } else {
      this.hud.notify('Lagret spill lastet inn.', 'good');
    }
    if (this.noLock) this.resume();
  }

  // ------------------------------------------------------------------
  // Tilstander og PointerLock
  resume() {
    if (!this.player) return;
    this.audio.init();
    if (this.noLock) {
      this.input.locked = true;
      this.setPlaying();
      return;
    }
    this.pendingResume = true;
    this.input.lock();
  }

  setPlaying() {
    this.pendingResume = false;
    this.state = 'playing';
    this.menus.showOnly(null);
    this.hud.show(true);
    this.clock.getDelta();
  }

  onLockChange(locked) {
    if (locked) {
      if (this.pendingResume || this.state === 'ready' || this.state === 'paused') this.setPlaying();
    } else if (this.state === 'playing') {
      this.pause();
    } else if (this.pendingResume) {
      // Låsing feilet (f.eks. for tidlig etter Esc) – be om nytt klikk
      this.pendingResume = false;
      if (this.state === 'shop' || this.state === 'map' || this.state === 'paused' || this.state === 'victory') {
        this.state = 'ready';
        this.menus.showOnly('click-to-play');
      }
    }
  }

  pause() {
    this.state = 'paused';
    this.menus.showPause();
    this.audio.stopEngine();
    if (this.player?.vehicle) this.restartEngineOnResume = true;
  }

  openShop() {
    if (!['playing', 'paused', 'ready'].includes(this.state)) return;
    this.state = 'shop';
    this.input.unlock();
    this.menus.showShop();
  }

  openMap() {
    if (!['playing', 'paused', 'ready'].includes(this.state)) return;
    this.state = 'map';
    this.input.unlock();
    this.minimap.drawBigMap();
    this.menus.showOnly('mapscreen');
  }

  closeOverlay() {
    this.save(false);
    this.resume();
    if (!this.noLock) {
      // Hvis låsen ikke kommer raskt, vis "klikk for å spille"
      setTimeout(() => {
        if (this.state === 'shop' || this.state === 'map') {
          this.state = 'ready';
          this.menus.showOnly('click-to-play');
        }
      }, 400);
    }
  }

  toMenu() {
    if (this.player && !this.player.dead && this.state !== 'victory') this.save(false);
    this.state = 'menu';
    this.input.unlock();
    this.audio.stopEngine();
    this.hud.show(false);
    this.menus.setContinueVisible(!!loadSave());
    this.menus.showOnly('menu');
  }

  gameOver(cause) {
    this.state = 'gameover';
    this.input.unlock();
    this.audio.stopEngine();
    this.audio.gameOver();
    setTimeout(() => this.menus.showGameOver(cause), 50);
  }

  victory() {
    this.victoryShown = true;
    this.victoryT = 0;
    this.state = 'victory';
    this.input.unlock();
    this.audio.stopEngine();
    this.audio.victory();
    this.save(false);
    this.menus.showVictory();
  }

  save(showMsg) {
    if (!this.player || this.player.dead) return;
    const ok = saveGame(this);
    if (showMsg) this.hud.notify(ok ? '💾 Spillet er lagret.' : 'Kunne ikke lagre spillet.', ok ? 'good' : 'bad');
  }

  // ------------------------------------------------------------------
  // Handlinger
  onKey(e) {
    const p = this.player;
    if (this.state === 'playing') {
      const code = e.code;
      if (code.startsWith('Digit')) {
        const i = +code.slice(5) - 1;
        const id = WEAPON_ORDER[i];
        if (id) {
          if (p.weapons.includes(id)) { p.setWeapon(id); this.audio.ui(); }
          else { this.hud.notify(`${WEAPONS[id].name} kan kjøpes i butikken (B).`); this.audio.error(); }
        }
      } else if (code === 'KeyE') this.interact();
      else if (code === 'KeyQ') p.cycleVehicle();
      else if (code === 'KeyH') p.useMedicine();
      else if (code === 'KeyB') this.openShop();
      else if (code === 'KeyM') this.openMap();
      else if (code === 'KeyV') {
        p.cameraMode = p.cameraMode === 'first' ? 'third' : 'first';
        this.settings.camera = p.cameraMode;
        this.persistSettings();
      } else if (code === 'Escape' && this.noLock) {
        this.pause();
      }
    } else if (this.state === 'shop' && (e.code === 'KeyB' || e.code === 'Escape')) {
      this.closeOverlay();
    } else if (this.state === 'map' && (e.code === 'KeyM' || e.code === 'Escape')) {
      this.closeOverlay();
    } else if ((this.state === 'paused' || this.state === 'ready') && (e.code === 'Enter' || e.code === 'KeyP')) {
      this.resume();
    }
  }

  interact() {
    const it = this.interactable;
    if (it) it.action();
    else if (!this.player.vehicle) this.player.summonVehicle();
  }

  addCoins(n, reason) {
    this.player.coins += n;
    this.stats.coinsEarned += n;
    this.hud.coinPop(n);
    this.hud.notify(`🪙 +${n} mynter – ${reason}`, 'coin');
    this.audio.coin();
  }

  openChest(entry) {
    const c = entry.data;
    this.chunks.collectChest(c.id);
    this.stats.chests++;
    this.particles.burst('coin', { x: c.x, y: c.y + 0.6, z: c.z }, c.rare ? 60 : 30);
    if (c.rare) this.audio.bigCoin();
    this.addCoins(c.value, c.rare ? 'Sjelden gullkiste!' : c.underwater ? 'Sunket skattekiste' : 'Skattekiste');
  }

  buy(kind, id) {
    const p = this.player;
    let price, name;
    if (kind === 'weapon') ({ price, name } = WEAPONS[id]);
    else if (kind === 'vehicle') ({ price, name } = VEHICLES[id]);
    else {
      const it = SHOP.flatMap((c) => c.items).find((x) => x.id === id);
      price = it.price;
      name = it.name;
    }
    if (p.coins < price) {
      this.audio.error();
      return;
    }
    p.coins -= price;
    if (kind === 'weapon') {
      p.weapons.push(id);
      p.setWeapon(id);
      this.hud.notify(`Kjøpt: ${WEAPONS[id].icon} ${name}. Trykk ${WEAPON_ORDER.indexOf(id) + 1} for å bytte.`, 'good');
    } else if (kind === 'vehicle') {
      p.ownedVehicles.push(id);
      p.selectedVehicle = id;
      this.hud.notify(`Kjøpt: ${VEHICLES[id].icon} ${name}! Trykk E ute i verden for å hente den.`, 'good');
    } else {
      p.inventory[id]++;
      this.hud.notify(`Kjøpt: ${ITEM_INFO[id].icon} ${name}`, 'good');
    }
    this.audio.bigCoin();
    this.hud.markDirty();
    this.save(false);
  }

  onPoacherStopped(p) {
    this.stoppedIds.add(p.id);
    this.stats.stopped++;
    this.addCoins(REWARDS.poacher, 'Krypskytter arrestert');
    const left = this.stats.totalPoachers - this.stats.stopped;
    if (left > 0) this.hud.notify(`🎯 ${left} krypskytter${left === 1 ? '' : 'e'} igjen.`, 'quest');
    else if (!this.victoryShown) this.victoryT = 2.5;
    this.save(false);
  }

  throttledNotify(key, text, type, interval = 6) {
    const now = this.time;
    if (this.notifyT[key] && now - this.notifyT[key] < interval) return;
    this.notifyT[key] = now;
    this.hud.notify(text, type);
  }

  onDetected() {
    this.throttledNotify('det', '⚠️ En krypskytter har oppdaget deg!', 'bad');
  }

  onAnimalAggro(a) {
    this.throttledNotify(`aggro-${a.type}`, `⚠️ ${a.name.charAt(0).toUpperCase() + a.name.slice(1)} angriper deg!`, 'bad');
  }

  // ------------------------------------------------------------------
  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    const t0 = performance.now();
    if (this.state === 'playing') {
      this.update(dt);
    } else if (this.player && (this.state === 'ready' || this.state === 'paused' || this.state === 'shop' || this.state === 'map')) {
      this.env.update(dt, this.time, this.camera, this.player.pos, this.gen.groundHeight(this.camera.position.x, this.camera.position.z), this.gen.biomeDef(this.player.pos.x, this.player.pos.z));
      this.audio.updateAmbient(dt, null, 0, false, false);
    }
    const t1 = performance.now();
    if (this.player && this.state !== 'menu' && this.state !== 'loading') this.renderer.render(this.scene, this.camera);
    else if (this.state === 'menu') this.renderer.clear();
    const t2 = performance.now();
    this.prof.update = this.prof.update * 0.9 + (t1 - t0) * 0.1;
    this.prof.render = this.prof.render * 0.9 + (t2 - t1) * 0.1;
    this.input.endFrame();
  }

  update(dt) {
    this.time += dt;
    const p = this.player;
    const input = this.input;
    if (input.wheel) p.cycleWeapon(input.wheel > 0 ? 1 : -1);
    if (this.restartEngineOnResume && p.vehicle) {
      this.audio.startEngine(p.vehicle.type);
      this.restartEngineOnResume = false;
    }

    p.update(dt);
    const focus = p.vehicle ? p.vehicle.pos : p.pos;
    this.chunks.update(focus.x, focus.z, this.time, 4);
    this.nearestChest = this.chunks.updateChests(this.time, p.pos.x, p.pos.y, p.pos.z);
    this.entities.update(dt);
    for (const v of Object.values(this.vehicles)) {
      if (v !== p.vehicle && v.group.visible) v.update(dt, null);
    }
    this.combat.update(dt);
    this.quests.update(dt, this.time);
    this.particles.update(dt);
    this.interactable = this.state === 'playing' ? this.entities.findInteractable() : null;

    p.updateCamera(dt, this.camera);
    this.camShake = Math.max(0, this.camShake - dt * 2.5);
    const camGround = this.gen.groundHeight(this.camera.position.x, this.camera.position.z);
    const biomeDef = this.gen.biomeDef(focus.x, focus.z);
    this.env.update(dt, this.time, this.camera, focus, camGround, biomeDef);

    this.hud.update(dt);
    this.minimap.update();
    this.audio.updateAmbient(dt, biomeDef.ambient, focus.y, this.env.underwater, true);

    if (this.victoryT > 0) {
      this.victoryT -= dt;
      if (this.victoryT <= 0) this.victory();
    }

    this.autosaveT -= dt;
    if (this.autosaveT <= 0) {
      this.autosaveT = 60;
      this.save(false);
    }
  }
}

new Game();
