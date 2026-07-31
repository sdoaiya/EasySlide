import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [executableArg, outputArg = 'renders/m0-packaged.mp4'] = process.argv.slice(2);
if (!executableArg) {
  throw new Error('Usage: node run-packaged-render.mjs <EasySlide executable> [output.mp4]');
}

const executable = resolve(executableArg);
const project = dirname(fileURLToPath(import.meta.url));
const output = resolve(outputArg);
const appAsar = join(dirname(executable), 'resources', 'app.asar');
const cli = join(appAsar, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
const browserRoot = join(dirname(executable), 'resources', 'hyperframes-browser');
const browserManifest = join(browserRoot, 'browser.json');

for (const required of [executable, appAsar]) {
  if (!existsSync(required)) throw new Error(`Missing packaged runtime: ${required}`);
}

let browserPath = process.env.HYPERFRAMES_BROWSER_PATH;
if (existsSync(browserManifest)) {
  const { executable: browserExecutable } = JSON.parse(readFileSync(browserManifest, 'utf8'));
  browserPath = join(browserRoot, browserExecutable);
}
if (process.argv.includes('--require-packaged-browser') && !browserPath) {
  throw new Error('Packaged Hyperframes browser is required but missing');
}

const rendered = spawnSync(executable, [
  cli,
  'render',
  project,
  '--output', output,
  '--fps', '25',
  '--quality', 'high',
  '--workers', '1',
], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    ...(browserPath ? { HYPERFRAMES_BROWSER_PATH: browserPath } : {}),
  },
  stdio: 'inherit',
});

if (rendered.error) throw rendered.error;
if (rendered.status !== 0) throw new Error(`Packaged Hyperframes exited with ${rendered.status}`);
if (!existsSync(output) || statSync(output).size === 0) {
  throw new Error('Packaged Hyperframes returned success without a video artifact');
}

const probed = spawnSync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration,size',
  '-show_entries', 'stream=codec_name,width,height,r_frame_rate',
  '-of', 'json',
  output,
], { encoding: 'utf8' });

if (probed.error) throw probed.error;
if (probed.status !== 0) throw new Error(probed.stderr || 'FFprobe rejected packaged render');
console.log(probed.stdout.trim());
