import type { StickerKind } from './stickerKinds';

// Asset addressing is separate from metadata-only document validation.
const sourceUrls = import.meta.glob<string>('@studioodle-assets/vector/*.svg', { eager: true, query: '?url&no-inline', import: 'default' });
const svgUrls = Object.fromEntries(Object.entries(sourceUrls).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]));
export function vectorStickerUrl(kind: StickerKind) { return svgUrls[`${kind}.svg`]; }
