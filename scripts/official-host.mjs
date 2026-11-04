import { existsSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = resolve(process.env.STUDIOODLE_PRIVATE_ROOT || resolve(checkout, '..'));
const command = process.argv[2];
const commands = new Set(['dev', 'web', 'build', 'web:build', 'check', 'typecheck']);
if (!commands.has(command)) throw Error('Unknown official build command.');
if (!existsSync(resolve(host, 'art/bundled/coloringBook.json')) ||
    !existsSync(resolve(host, 'vite/config.shared.ts')) ||
    !existsSync(resolve(host, 'app')) || realpathSync(resolve(host, 'app')) !== realpathSync(checkout)) {
  throw Error('Official builds require the authorized private Studioodle checkout with this repository as its app/ submodule. Set STUDIOODLE_PRIVATE_ROOT if needed. No private assets are included in this public repository.');
}
// Invoke npm through its JS entry point: no shell interpolation or credentials.
if (!process.env.npm_execpath) throw Error('Run through npm run.');
const child = spawn(process.execPath, [process.env.npm_execpath, 'run', command, '--', ...process.argv.slice(3)], {
  cwd: host, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
