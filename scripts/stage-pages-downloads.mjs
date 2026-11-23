import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

export function downloadEntries(manifest) {
  if (!Array.isArray(manifest)) throw Error('Invalid download manifest');
  const names = new Set();
  return manifest.map(entry => {
    if (!entry || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(entry.version)
      || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) throw Error('Invalid download entry');
    const name = `Studioodle_${entry.version}_x64-setup.exe`;
    if (names.has(name)) throw Error('Duplicate download entry');
    names.add(name);
    return { ...entry, name, url: `https://github.com/abflett/Studioodle-public/releases/download/v${entry.version}/${name}` };
  });
}

async function verifyFile(file, entry) {
  if ((await stat(file)).size !== entry.bytes) throw Error(`Download size mismatch: ${entry.name}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== entry.sha256) throw Error(`Download checksum mismatch: ${entry.name}`);
}

/** Stage only pinned, immutable installers; no binaries are committed to source. */
export async function stageDownloads(siteDirectory, fetchFile = fetch) {
  const directory = path.join(path.resolve(siteDirectory), 'downloads');
  const entries = downloadEntries(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')));
  await mkdir(directory, { recursive: true });
  for (const entry of entries) {
    const destination = path.join(directory, entry.name);
    try {
      await stat(destination);
      await verifyFile(destination, entry);
      continue;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const temporary = destination + '.download';
    try {
      const response = await fetchFile(entry.url);
      if (!response.ok || !response.body) throw Error(`Download failed (${response.status}): ${entry.name}`);
      let received = 0;
      const boundSize = new Transform({ transform(chunk, _encoding, callback) {
        received += chunk.length;
        callback(received > entry.bytes ? Error(`Download too large: ${entry.name}`) : null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), boundSize, createWriteStream(temporary, { flags: 'wx' }));
      await verifyFile(temporary, entry);
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    console.log(`Staged verified download: ${entry.name}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw Error('Usage: node scripts/stage-pages-downloads.mjs <website-directory>');
  await stageDownloads(process.argv[2]);
}
