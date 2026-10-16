const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// Vite consumes this browser ES module; Node can load its dependency-free source.
const source = readFileSync(path.join(__dirname, '../src/biomes.js'), 'utf8');
const helpers = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('folder biomes and scenery stay stable when paths normalize, sizes change or entries reorder', async () => {
  const { biomeFor, biomeScene } = await helpers;
  const folders = ['Downloads', 'Documents', 'Projects', 'Photos'].map(name => ({ type: 'folder', name, path: `D:\\Users\\${name}`, size: 100 }));
  const originals = new Map(folders.map(entry => [entry.path, biomeFor(entry)]));
  for (const entry of [...folders].reverse().filter(entry => entry.name !== 'Photos')) {
    assert.equal(biomeFor({ ...entry, size: 900000 }), originals.get(entry.path));
  }
  const windowsPath = 'D:\\Users\\Downloads';
  const normalizedPath = 'd:/users/downloads/';
  const biome = biomeFor({ type: 'folder', path: windowsPath });
  assert.equal(biome, biomeFor({ type: 'folder', path: normalizedPath }));
  assert.equal(biomeScene(biome, windowsPath), biomeScene(biome, normalizedPath));
  assert.equal(biomeFor({ type: 'folder', path: 'D:/Caf\u00e9' }), biomeFor({ type: 'folder', path: 'd:/cafe\u0301/' }));
});

test('file categories have fixed biomes and unknown or inherited keys use a safe fallback', async () => {
  const { biomeFor } = await helpers;
  const categories = { code: 'forest', apps: 'stone', documents: 'desert', archives: 'badlands', images: 'grass', videos: 'water', audio: 'swamp', other: 'snow' };
  for (const [category, expected] of Object.entries(categories)) {
    const biome = biomeFor({ type: 'file', category });
    assert.equal(biome.id, expected);
    assert.equal(biome, biomeFor({ type: 'file', category, name: 'renamed.file', size: 1 }));
    for (const color of [biome.surface, biome.deep, biome.detail, biome.ink]) assert.match(color, /^#[0-9a-f]{6}$/i);
  }
  const fallback = biomeFor({ type: 'file', category: 'other' });
  for (const category of ['unknown', 'toString', '__proto__', 'constructor', undefined]) {
    assert.equal(biomeFor({ type: 'file', category }), fallback);
  }
  assert.equal(biomeFor({ type: 'aggregate' }).name, 'Lainnya');
});

test('decorative HTML does not include supplied markup and stays bounded for large and compact tiles', async () => {
  const { biomeFor, biomeScene } = await helpers;
  const attack = '</span><img src=x onerror="alert(1)"><script>alert(1)</script>';
  for (const id of [attack, '__proto__', 'toString']) {
    const scene = biomeScene({ id }, attack);
    assert.ok(!scene.includes(attack));
    assert.doesNotMatch(scene, /<img|<script|onerror/i);
    assert.match(scene, /aria-hidden="true"/);
  }
  for (let index = 0; index < 60; index += 1) {
    const seed = `D:/Folders/${index}`;
    const biome = biomeFor({ type: 'folder', path: seed });
    const large = biomeScene(biome, seed);
    const compact = biomeScene(biome, seed, true);
    const count = (large.match(/class="voxel-/g) || []).length;
    assert.ok(count >= 8 && count <= 14);
    assert.ok((compact.match(/class="voxel-/g) || []).length <= 3);
    assert.equal(large, biomeScene(biome, seed));
  }
});
