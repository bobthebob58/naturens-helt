// Lagring av fremgang i nettleserens localStorage.
const KEY = 'naturens-helt-save-v1';
const SETTINGS_KEY = 'naturens-helt-settings-v1';

export function saveGame(game) {
  const p = game.player;
  const pos = p.vehicle ? p.vehicle.pos : p.pos;
  const data = {
    version: 1,
    seed: game.gen.seed,
    difficulty: game.difficulty.key,
    pos: [pos.x, pos.y + 0.5, pos.z],
    yaw: p.yaw,
    health: p.health,
    coins: p.coins,
    weapons: p.weapons,
    weapon: p.weapon,
    inventory: p.inventory,
    ownedVehicles: p.ownedVehicles,
    selectedVehicle: p.selectedVehicle,
    stoppedPoachers: [...game.stoppedIds],
    freedCages: game.entities.cages.filter((c) => c.freed).map((c) => c.id),
    discoveredCamps: game.entities.camps.filter((c) => c.discovered).map((c) => c.id),
    collectedChests: [...game.chunks.collected],
    stats: game.stats,
    time: game.time,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.version === 1 ? d : null;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignorer */ }
}

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignorer */ }
}
