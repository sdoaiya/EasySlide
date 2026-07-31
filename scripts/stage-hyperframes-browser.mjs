import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const destinationArg = process.argv[2];
if (!destinationArg) throw new Error('Usage: node stage-hyperframes-browser.mjs <destination>');

const cli = resolve('desktop/node_modules/hyperframes/bin/hyperframes.mjs');
const ensured = spawnSync(process.execPath, [cli, 'browser', 'ensure'], { encoding: 'utf8' });
if (ensured.error) throw ensured.error;
if (ensured.status !== 0) throw new Error(ensured.stderr || 'Hyperframes browser ensure failed');

const output = `${ensured.stdout}\n${ensured.stderr}`.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
const browserPath = output.match(/^\s*Path:\s+(.+)$/m)?.[1]?.trim();
if (!browserPath) throw new Error(`Hyperframes did not report a browser path:\n${output}`);

const destination = resolve(destinationArg);
mkdirSync(destination, { recursive: true });
cpSync(dirname(browserPath), destination, { recursive: true, force: true });
writeFileSync(`${destination}/browser.json`, JSON.stringify({ executable: browserPath.split(/[\\/]/).at(-1) }, null, 2));
console.log(`Staged Hyperframes browser: ${destination}`);
