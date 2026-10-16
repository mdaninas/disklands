// Biomes decorate the map; the treemap's area remains the size measurement.
const BIOMES = Object.freeze({
  grass: Object.freeze({ id: 'grass', name: 'Padang rumput', surface: '#78a94a', deep: '#4b7133', detail: '#9bc562', ink: '#20321f' }),
  forest: Object.freeze({ id: 'forest', name: 'Hutan', surface: '#527d3d', deep: '#2f512e', detail: '#739652', ink: '#f3f5dd' }),
  desert: Object.freeze({ id: 'desert', name: 'Gurun', surface: '#dfc382', deep: '#ae8d52', detail: '#f0d89f', ink: '#4a3b23' }),
  snow: Object.freeze({ id: 'snow', name: 'Salju', surface: '#d0ddd2', deep: '#8eaaa4', detail: '#eef1df', ink: '#2b4546' }),
  badlands: Object.freeze({ id: 'badlands', name: 'Mesa', surface: '#b66c42', deep: '#7d462f', detail: '#d99358', ink: '#fff1d7' }),
  swamp: Object.freeze({ id: 'swamp', name: 'Rawa', surface: '#72804a', deep: '#444f30', detail: '#95a15e', ink: '#f4f0d8' }),
  stone: Object.freeze({ id: 'stone', name: 'Pegunungan', surface: '#8d9888', deep: '#5c675c', detail: '#b1b7a6', ink: '#25372a' }),
  water: Object.freeze({ id: 'water', name: 'Danau', surface: '#4f91a1', deep: '#326875', detail: '#72b2b7', ink: '#f5f5df' }),
  mixed: Object.freeze({ id: 'mixed', name: 'Lainnya', surface: '#a0a27f', deep: '#70745c', detail: '#bdbea0', ink: '#323c2b' })
});

const FOLDER_BIOMES = ['grass', 'forest', 'desert', 'snow', 'badlands', 'swamp', 'stone', 'water'];
const FILE_BIOMES = Object.freeze({
  code: 'forest', apps: 'stone', documents: 'desert', archives: 'badlands',
  images: 'grass', videos: 'water', audio: 'swamp', other: 'snow'
});

function normalizedKey(value) {
  return String(value ?? '').normalize('NFC').replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase();
}

function hashKey(value) {
  const key = normalizedKey(value);
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

/** Stable across sorting, filtering and Windows path capitalization. */
export function biomeFor(entry = {}) {
  if (entry.type === 'aggregate') return BIOMES.mixed;
  if (entry.type === 'folder') {
    return BIOMES[FOLDER_BIOMES[hashKey(entry.path || entry.name) % FOLDER_BIOMES.length]];
  }
  return BIOMES[Object.hasOwn(FILE_BIOMES, entry.category) ? FILE_BIOMES[entry.category] : 'snow'];
}

const DECOR = Object.freeze({
  grass: ['tree', 'flower', 'rock', 'flower', 'house', 'tree', 'flower', 'water'],
  forest: ['tree', 'pine', 'tree', 'rock', 'pine', 'tree', 'flower', 'tree'],
  desert: ['sand', 'cactus', 'rock', 'sand', 'house', 'cactus', 'sand'],
  snow: ['pine', 'ice', 'rock', 'ice', 'house', 'pine', 'ice'],
  badlands: ['rock', 'sand', 'ore', 'rock', 'cactus', 'sand', 'rock'],
  swamp: ['water', 'reed', 'tree', 'reed', 'rock', 'water', 'reed'],
  stone: ['rock', 'ore', 'rock', 'pine', 'ore', 'house', 'rock'],
  water: ['water', 'reed', 'rock', 'water', 'reed', 'water', 'rock'],
  mixed: ['rock', 'flower', 'sand', 'tree', 'rock', 'flower']
});

/** Only fixed class names and generated numeric styles enter the HTML. */
export function biomeScene(biome, seedKey, compact = false) {
  const selected = Object.hasOwn(BIOMES, biome?.id) ? BIOMES[biome.id] : BIOMES.mixed;
  const decor = DECOR[selected.id];
  let randomState = hashKey(seedKey) || 1;
  const random = () => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  };
  const count = compact ? 2 : 8 + Math.floor(random() * 4);
  const pieces = [];
  for (let index = 0; index < count; index += 1) {
    // A loose grid prevents ornaments piling up and leaves space for labels.
    const x = compact ? 64 + index * 18 : 17 + (index % 4) * 21 + random() * 6;
    const y = compact ? 29 + index * 29 : 22 + Math.floor(index / 4) * 18 + random() * 8;
    const shape = decor[Math.floor(random() * decor.length)];
    const scale = (0.72 + random() * 0.36).toFixed(2);
    pieces.push(`<span class="voxel-${shape}" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--scale:${scale}"></span>`);
  }
  return `<span class="biome-scene biome-scene-${selected.id}" aria-hidden="true">${pieces.join('')}</span>`;
}
