import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(root, 'index.html');
const html = readFileSync(indexPath, 'utf8');

const required = [
  'data-composition-id="easyslide-m0"',
  'id="scene-title"',
  'id="scene-chart"',
  'id="scene-image"',
  'window.__timelines["easyslide-m0"] = tl',
];
for (const token of required) {
  if (!html.includes(token)) throw new Error(`Missing M0 contract: ${token}`);
}

for (const forbidden of ['Math.random(', 'Date.now(', 'setTimeout(', 'repeat: -1']) {
  if (html.includes(forbidden)) throw new Error(`Non-deterministic M0 source: ${forbidden}`);
}

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate HTML id in M0 composition');

const scenes = [...html.matchAll(/<section\b[^>]*class="[^"]*\bscene\b[^"]*"[^>]*>/g)].map((match) => match[0]);
if (scenes.length !== 3) throw new Error(`Expected 3 scenes, found ${scenes.length}`);
for (const scene of scenes) {
  for (const attribute of ['id=', 'data-start=', 'data-duration=', 'data-track-index=']) {
    if (!scene.includes(attribute)) throw new Error(`Scene missing ${attribute}: ${scene}`);
  }
}

const assetMatches = [...html.matchAll(/(?:src|href)="(?!https?:|data:|#)([^"]+)"/g)];
for (const [, asset] of assetMatches) {
  if (!existsSync(resolve(root, asset))) throw new Error(`Missing local asset: ${asset}`);
}

const remoteAssets = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((match) => match[1]);
if (process.argv.includes('--strict-local') && remoteAssets.length) {
  throw new Error(`Desktop gate requires local runtime assets: ${remoteAssets.join(', ')}`);
}

const digest = createHash('sha256').update(html).digest('hex');
console.log(JSON.stringify({ scenes: scenes.length, ids: ids.length, local_assets: assetMatches.length, remote_assets: remoteAssets, source_sha256: digest }, null, 2));
