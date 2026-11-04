import { Artwork } from '../editor/Artwork';
import { paperSize } from '../editor/document';
import { prepareStickers } from '../editor/vectorStickers';
import { pictureSummary } from '../editor/pictureSummary';
import type { PictureSummary } from '../editor/pictureSummary';
import type { SavedPicture } from '../editor/savedPicture';
import { createPictureThumbnailRepository, thumbnailVersion } from '../platform/pictureThumbnails';
import type { PictureThumbnail } from '../platform/pictureThumbnails';
import { pictureRepository, pictureSaves } from './pictures';
import { createThumbnailQueue } from './thumbnailQueue';

const stored = createPictureThumbnailRepository();
export type ThumbnailEntry = { thumbnail: PictureThumbnail; url: string; persisted: boolean; source: 'generated' | 'storage' | 'memory' };
type Entry = ThumbnailEntry;
// Count potential decoded RGBA as well as encoded bytes, rather than five pictures
// of arbitrary size. This is a cache estimate, not a total browser-memory limit.
export const thumbnailMemoryBudget = 24 * 1024 * 1024;
const entryBytes = (entry: Entry) => entry.thumbnail.blob.size + entry.thumbnail.width * entry.thumbnail.height * 4;
const memoryBytes = () => [...cache.values()].reduce((sum, entry) => sum + entryBytes(entry), 0);
const cache = new Map<string, Entry>();
const generation = createThumbnailQueue<{ thumbnail: PictureThumbnail; persisted: boolean }>();
const jobs = new Map<string, Promise<Entry>>();
const keyFor = (picture: PictureSummary, tier: number) => `${picture.id}:${picture.updatedAt}:${thumbnailVersion}:${tier}`;
const check = (signal?: AbortSignal) => { if (signal?.aborted) throw signal.reason ?? new DOMException('Preview cancelled', 'AbortError'); };
const encode = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Preview encoding failed.')), 'image/png'));

async function downsample(source: PictureThumbnail, tier: number, signal?: AbortSignal): Promise<PictureThumbnail> {
  const bitmap = await createImageBitmap(source.blob), canvas = document.createElement('canvas');
  try {
    check(signal);
    const scale = tier / Math.max(bitmap.width, bitmap.height);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await encode(canvas); check(signal);
    return { ...source, tier, width: canvas.width, height: canvas.height, blob };
  } finally { bitmap.close(); canvas.width = canvas.height = 1; }
}

export async function renderThumbnail(picture: SavedPicture, signal?: AbortSignal, tier = 768): Promise<PictureThumbnail> {
  check(signal);
  await prepareStickers(picture.document.surfaces.map(surface => surface.kind)); check(signal);
  const size = paperSize(picture.format, picture.size), ratio = tier / Math.max(size.width, size.height);
  const width = Math.max(1, Math.round(size.width * ratio)), height = Math.max(1, Math.round(size.height * ratio));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  let artwork: Artwork | undefined;
  try {
    artwork = Artwork.restore(picture.document);
    const ctx = canvas.getContext('2d')!; ctx.setTransform(width / size.width, 0, 0, height / size.height, 0, 0);
    artwork.render(ctx, true); check(signal);
    const blob = await encode(canvas);
    check(signal);
    const summary = pictureSummary(picture);
    return { id: picture.id, tier, updatedAt: picture.updatedAt, version: thumbnailVersion, width, height, blob, pageLayout: summary.pageLayout, stickerCount: summary.stickerCount };
  } finally { artwork?.dispose(); canvas.width = canvas.height = 1; }
}

/** Only the selected preview can generate; queueing is serial and obsolete work cancels. */
export const pictureThumbnails = {
  stats() { return { cached: cache.size, memoryBytes: memoryBytes(), memoryBudget: thumbnailMemoryBudget, blobBytes: [...cache.values()].reduce((sum, entry) => sum + entry.thumbnail.blob.size, 0), queued: jobs.size, generation: generation.stats() }; },
  peek(summary: PictureSummary, tier = 768) { return cache.get(keyFor(summary, tier)); },
  async get(summary: PictureSummary, signal?: AbortSignal, tier = 768): Promise<Entry> {
    check(signal);
    const key = keyFor(summary, tier), cached = cache.get(key);
    if (cached) {
      cache.delete(key); cache.set(key, cached);
      if (!cached.persisted) void stored.put(cached.thumbnail).then(ok => { cached.persisted = ok; }).catch(() => {});
      return { ...cached, source: 'memory' };
    }
    const previous = jobs.get(key);
    if (previous) { try { const entry = await previous; check(signal); return entry; } catch { check(signal); } }
    const job = (async () => {
      check(signal);
      let thumbnail: PictureThumbnail | undefined;
      try { thumbnail = await stored.get(summary, signal, tier); } catch { check(signal); }
      let persisted = !!thumbnail;
      const source = thumbnail ? 'storage' as const : 'generated' as const;
      if (!thumbnail) {
        const generated = await generation.run(async () => {
          check(signal);
          // A larger PNG can produce a missing lower tier without loading artwork.
          let thumbnail: PictureThumbnail | undefined;
          try {
            const memory = [...cache.values()].map(entry => entry.thumbnail)
              .filter(image => image.id === summary.id && image.updatedAt === summary.updatedAt && image.tier > tier)
              .sort((a, b) => a.tier - b.tier)[0];
            const larger = memory ?? await stored.larger(summary, tier, signal);
            if (larger) thumbnail = await downsample(larger, tier, signal);
          } catch { check(signal); }
          if (!thumbnail) {
            const picture = await pictureRepository.get(summary.id, signal); check(signal);
            if (!picture || picture.updatedAt !== summary.updatedAt) throw Error('Drawing changed while loading its preview.');
            thumbnail = await renderThumbnail(picture, signal, tier); check(signal);
          }
          const latest = pictureSaves.latest(summary.id);
          if (latest && latest.updatedAt !== summary.updatedAt) throw Error('Preview superseded by a newer edit.');
          let persisted = false;
          try { persisted = await stored.put(thumbnail); } catch { /* Cache failure must not hide artwork. */ }
          return { thumbnail, persisted };
        }, signal);
        thumbnail = generated.thumbnail; persisted = generated.persisted;
      }
      check(signal);
      const current = await pictureRepository.getSummary(summary.id, signal); check(signal);
      if (!current || current.updatedAt !== summary.updatedAt) throw Error('Preview was superseded or deleted.');
      const entry = { thumbnail, url: URL.createObjectURL(thumbnail.blob), persisted, source };
      cache.set(key, entry);
      while (cache.size > 64 || memoryBytes() > thumbnailMemoryBudget) { const oldest = cache.keys().next().value!; URL.revokeObjectURL(cache.get(oldest)!.url); cache.delete(oldest); }
      return entry;
    })();
    jobs.set(key, job);
    try { return await job; } finally { if (jobs.get(key) === job) jobs.delete(key); }
  },
  invalidate(id: string, updatedAt?: number) {
    for (const [key, entry] of cache) if (entry.thumbnail.id === id && (updatedAt === undefined || entry.thumbnail.updatedAt === updatedAt)) { URL.revokeObjectURL(entry.url); cache.delete(key); }
  },
  clear() { for (const entry of cache.values()) URL.revokeObjectURL(entry.url); cache.clear(); },
};
