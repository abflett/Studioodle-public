import { createAppDatabase, abortTransaction } from './appDatabase';
import type { PictureSummary } from '../editor/pictureSummary';

export const thumbnailVersion = 1;
export const thumbnailTiers = [256, 512, 768, 1024] as const;
export type PictureThumbnail = { id: string; tier: number; updatedAt: number; version: number; blob: Blob; width: number; height: number; pageLayout?: string; stickerCount?: number };
export const thumbnailKeys = (id: string) => IDBKeyRange.bound([id, 0], [id, 1024]);
function valid(record: PictureThumbnail | undefined, updatedAt: number, tier: number): record is PictureThumbnail {
  return !!record && thumbnailTiers.some(size => size === tier) && record.updatedAt === updatedAt && record.version === thumbnailVersion && record.tier === tier && record.blob instanceof Blob && record.blob.type === 'image/png' && record.blob.size > 0 && record.blob.size <= 5 * 1024 * 1024 && record.width > 0 && record.width <= tier && record.height > 0 && record.height <= tier;
}
export function createPictureThumbnailRepository(name?: string) {
  const db = createAppDatabase(name);
  return {
    async get(summary: PictureSummary, signal?: AbortSignal, tier = 768): Promise<PictureThumbnail | undefined> {
      const record = await db.request(['thumbnails'], 'readonly', tx => tx.objectStore('thumbnails').get([summary.id, tier]), signal) as PictureThumbnail | undefined;
      if (valid(record, summary.updatedAt, tier)) return record;
    },
    async larger(summary: PictureSummary, tier: number, signal?: AbortSignal): Promise<PictureThumbnail | undefined> {
      if (tier >= 1024) return;
      return db.transaction(['thumbnails'], 'readonly', tx => {
        let found: PictureThumbnail | undefined;
        const cursor = tx.objectStore('thumbnails').openCursor(IDBKeyRange.bound([summary.id, tier], [summary.id, 1024], true));
        cursor.onsuccess = () => {
          const entry = cursor.result; if (!entry) return;
          if (valid(entry.value, summary.updatedAt, entry.value.tier)) found = entry.value;
          else entry.continue();
        };
        return () => found;
      }, signal);
    },
    async put(record: PictureThumbnail): Promise<boolean> {
      if (!valid(record, record.updatedAt, record.tier)) return false;
      return db.transaction(['thumbnails', 'summaries'], 'readwrite', tx => {
        let accepted = false;
        const request = tx.objectStore('summaries').get(record.id);
        request.onsuccess = () => {
          if (request.result?.updatedAt !== record.updatedAt) return;
          try { tx.objectStore('thumbnails').put(record); accepted = true; } catch { abortTransaction(tx); }
        };
        return () => accepted;
      });
    },
    async delete(id: string, updatedAt?: number, tier?: number) {
      await db.transaction(['thumbnails'], 'readwrite', tx => {
        const store = tx.objectStore('thumbnails'), cursor = store.openCursor(tier === undefined ? thumbnailKeys(id) : IDBKeyRange.only([id, tier]));
        cursor.onsuccess = () => { const entry = cursor.result; if (!entry) return; if (updatedAt === undefined || entry.value.updatedAt === updatedAt) entry.delete(); entry.continue(); };
        return () => undefined;
      });
    },
  };
}
