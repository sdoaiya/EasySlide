import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const timestamps = ['1.5', '5.4', '9.5'];
const [leftArg, rightArg] = process.argv.slice(2);
if (!leftArg || !rightArg) {
  throw new Error('Usage: node compare-renders.mjs <first.mp4> <second.mp4>');
}

const left = resolve(leftArg);
const right = resolve(rightArg);
for (const file of [left, right]) {
  if (!existsSync(file)) throw new Error(`Render not found: ${file}`);
}

function frameHash(file, timestamp) {
  const frame = execFileSync('ffmpeg', [
    '-v', 'error', '-ss', timestamp, '-i', file,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], { maxBuffer: 32 * 1024 * 1024 });
  return createHash('sha256').update(frame).digest('hex');
}

const frames = timestamps.map((timestamp) => {
  const leftHash = frameHash(left, timestamp);
  const rightHash = frameHash(right, timestamp);
  return { timestamp, left: leftHash, right: rightHash, equal: leftHash === rightHash };
});

console.log(JSON.stringify({ equal: frames.every((frame) => frame.equal), frames }, null, 2));
if (frames.some((frame) => !frame.equal)) process.exitCode = 1;
