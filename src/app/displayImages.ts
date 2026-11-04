// The browser chooses only the required painted-art variant, including display DPR.
const sourceUrls = import.meta.glob('@studioodle-assets/selection/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const urls = Object.fromEntries(Object.entries(sourceUrls).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]));
export function selectionImage(name: 'easel' | 'coloring-book' | 'paper-stack') {
  const maximum = name === 'easel' ? 1254 : 1536;
  const widths = [256, 512, 768, 1024, maximum];
  const url = (width: number) => urls[`${name}${width === maximum ? '' : `-${width}`}.webp`]!;
  return { artwork: url(256), srcSet: widths.map(width => `${url(width)} ${width}w`).join(', '),
    sizes: name === 'paper-stack' ? 'min(576px, 40vmax)' : 'min(480px, 30vmax)' };
}
