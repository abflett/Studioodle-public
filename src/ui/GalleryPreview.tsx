import { useEffect, useState } from 'react';
import { ImageOff, LoaderCircle } from 'lucide-react';
import { pictureThumbnails } from '../app/pictureThumbnails';
import type { ThumbnailEntry } from '../app/pictureThumbnails';
import { createPictureThumbnailRepository } from '../platform/pictureThumbnails';
import { paperSize } from '../editor/document';
import type { PictureSummary } from '../editor/pictureSummary';
import { useLatest } from './useLatest';
import { galleryThumbnailTier } from '../app/thumbnailSize';

export function GalleryPreview({ picture, onMetadata, onUnavailable }: { picture: PictureSummary; onMetadata?: (value: PictureSummary) => void; onUnavailable?: (value: PictureSummary) => void }) {
  const [result, setResult] = useState<{ key: string; entry?: ThumbnailEntry; failed?: boolean }>();
  const [attempt, setAttempt] = useState(0);
  const [tier, setTier] = useState(() => galleryThumbnailTier());
  useEffect(() => {
    let density: MediaQueryList;
    const resize = () => {
      setTier(galleryThumbnailTier());
      density?.removeEventListener('change', resize);
      density = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
      density.addEventListener('change', resize);
    };
    resize(); window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); density.removeEventListener('change', resize); };
  }, []);
  const latestPicture = useLatest(picture);
  const key = `${picture.id}:${picture.updatedAt}`, warm = pictureThumbnails.peek(picture, tier);
  const entry = result?.key === key ? result.entry : warm && { ...warm, source: 'memory' as const };
  const url = entry?.url;
  const status = entry && (!entry.persisted ? 'not-stored' : entry.source);
  const statusLabel = status === 'not-stored' ? 'Thumbnail generated but not stored; it may rebuild after leaving the gallery.'
    : status === 'generated' ? 'Thumbnail generated this gallery visit and saved to device storage.'
      : status === 'memory' ? 'Thumbnail reused from memory; no storage read or regeneration.'
      : 'Thumbnail read from device storage.';
  const failed = result?.key === key && result.failed;
  const size = paperSize(picture.format, picture.size);
  useEffect(() => {
    // Thumbnail metadata publication may replace the summary object without
    // changing its revision. Do not restart the load (or overwrite its diagnostic).
    const picture = latestPicture.current;
    const controller = new AbortController();
    void pictureThumbnails.get(picture, controller.signal, tier).then(entry => {
      if (controller.signal.aborted) return;
      setResult({ key, entry });
      onMetadata?.({ ...picture, pageLayout: entry.thumbnail.pageLayout, stickerCount: entry.thumbnail.stickerCount });
    }).catch(() => { if (!controller.signal.aborted) { setResult({ key, failed: true }); onUnavailable?.(picture); } });
    return () => controller.abort();
  }, [latestPicture, onMetadata, onUnavailable, key, attempt, tier]);
  return <span className="saved-preview preview-frame" data-fit="cover" data-thumbnail-tier={entry?.thumbnail.tier} aria-busy={!url && !failed} style={{ aspectRatio: `${size.width} / ${size.height}`, width: '100%', height: '100%' }}>
    {url && <img src={url} alt="" draggable={false} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={() => {
      pictureThumbnails.invalidate(picture.id, picture.updatedAt);
      setResult({ key, failed: true });
      if (attempt < 1) void createPictureThumbnailRepository().delete(picture.id, picture.updatedAt, entry?.thumbnail.tier).catch(() => {}).finally(() => setAttempt(value => value + 1));
      else onUnavailable?.(picture);
    }} />}
    {url && <span className="thumbnail-source" data-source={status} role="img" aria-label={statusLabel} title={statusLabel} />}
    {!url && <span className={`preview-loading${failed ? ' is-error' : ''}`}>{failed ? <ImageOff aria-hidden="true" /> : <LoaderCircle className="preview-spinner" aria-hidden="true" />}<span className="sr-only" role="status">{failed ? 'Preview unavailable' : 'Loading picture preview'}</span></span>}
  </span>;
}
