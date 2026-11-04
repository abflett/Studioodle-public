import { useLayoutEffect, type RefObject } from 'react';

type Rect = { left: number; top: number; right: number; bottom: number };
export type DisplayGeometry = { width: number; height: number; rects: Rect[]; top: number; left: number; right: number };
declare global { interface Window { StudioodleDisplay?: { read(): string; setFullscreen?(enabled: boolean): void } } }

/** Prefer the camera rectangle over an edge inset that can include the status area. */
export function cameraSafeInsets(raw: DisplayGeometry) {
  const top = raw.rects.filter(r => r.top < raw.top && r.bottom > 0 && r.left < raw.width && r.right > 0);
  const left = raw.rects.filter(r => r.left < raw.left && r.right > 0 && r.top < raw.height && r.bottom > 0);
  const right = raw.rects.filter(r => r.right > raw.width - raw.right && r.left < raw.width && r.top < raw.height && r.bottom > 0);
  return {
    top: top.length ? Math.max(...top.map(r => r.bottom)) : raw.top,
    left: left.length ? Math.max(...left.map(r => r.right)) : raw.left,
    right: right.length ? Math.max(...right.map(r => raw.width - r.left)) : raw.right,
  };
}

/** Native physical pixels become CSS pixels using the actual WebView width. */
export function cameraRibbonLayout(raw: DisplayGeometry, width: number, height: number, buttonHeight: number) {
  const scale = width / raw.width;
  if (!Number.isFinite(scale) || scale <= 0 || Math.abs(raw.height * scale - height) > 3) return null;
  const rects = raw.rects.map(r => ({ left: r.left * scale, right: r.right * scale, top: r.top * scale, bottom: r.bottom * scale }));
  let intervals = [[4, width - 4]];
  for (const r of rects) {
    if (r.bottom <= 0 || r.top >= buttonHeight + 8 || r.right <= 0 || r.left >= width) continue;
    intervals = intervals.flatMap(([left, right]) => [[left!, Math.min(right!, r.left)], [Math.max(left!, r.right), right!]])
      .filter(([left, right]) => right! - left! >= 28);
  }
  if (!rects.length || !intervals.length) return null;
  // Assign each next tool to the interval with the most room per button.
  const counts = intervals.map(() => 0);
  for (let n = 0; n < 10; n++) {
    let best = 0;
    intervals.forEach(([left, right], i) => { if ((right! - left!) / (counts[i]! + 1) > (intervals[best]![1]! - intervals[best]![0]!) / (counts[best]! + 1)) best = i; });
    counts[best] = counts[best]! + 1;
  }
  const buttons: { left: number; width: number }[] = [];
  intervals.forEach(([left, right], i) => {
    const count = counts[i]!;
    if (!count) return;
    const slot = Math.min(56, (right! - left!) / count);
    // Keep spare width at the outside edge rather than creating another camera moat.
    const start = left! > 4 ? left! : right! < width - 4 ? right! - slot * count : left! + (right! - left! - slot * count) / 2;
    for (let n = 0; n < count; n++) buttons.push({ left: start + slot * n + 1, width: slot - 2 });
  });
  return buttons.length === 10 && buttons.every(b => b.width >= 28) ? buttons : null;
}

export function useCameraRibbon(studio: RefObject<HTMLElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const ribbon = studio.current?.querySelector<HTMLElement>('.main-ribbon');
    if (!ribbon) return;
    const buttons = [...ribbon.querySelectorAll('button')];
    const reset = () => {
      delete ribbon.dataset.cameraFit;
      buttons.forEach(b => { b.style.removeProperty('left'); b.style.removeProperty('width'); });
    };
    const update = () => {
      reset();
      let raw: DisplayGeometry;
      try {
        raw = JSON.parse(window.StudioodleDisplay?.read() ?? 'null') as DisplayGeometry;
        if (!raw || !Array.isArray(raw.rects) || ![raw.width, raw.height, raw.top, raw.left, raw.right, ...raw.rects.flatMap(r => [r.left, r.top, r.right, r.bottom])].every(Number.isFinite)) return;
      } catch { return; }
      const scale = innerWidth / raw.width;
      if (scale <= 0 || Math.abs(raw.height * scale - innerHeight) > 3) return;
      const safe = cameraSafeInsets(raw);
      for (const edge of ['top', 'left', 'right'] as const) ribbon.style.setProperty(`--camera-safe-${edge}`, `${Math.max(0, safe[edge] * scale)}px`);
      const layout = enabled ? cameraRibbonLayout(raw, innerWidth, innerHeight, buttons[0]?.getBoundingClientRect().height ?? 44) : null;
      if (!layout) return;
      ribbon.dataset.cameraFit = 'true';
      buttons.forEach((b, i) => { b.style.left = `${layout[i]!.left}px`; b.style.width = `${layout[i]!.width}px`; });
    };
    const clearInsets = () => { for (const edge of ['top', 'left', 'right']) ribbon.style.removeProperty(`--camera-safe-${edge}`); };
    const refresh = () => { clearInsets(); update(); };
    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('studioodle-display-change', refresh);
    return () => { reset(); clearInsets(); window.removeEventListener('resize', refresh); window.removeEventListener('studioodle-display-change', refresh); };
  }, [studio, enabled]);
}
