import { useLayoutEffect, type RefObject } from 'react';
import type { DisplayGeometry } from './useCameraRibbon';

export function useAndroidDisplay(fullscreen: boolean) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const host = window.StudioodleDisplay;
      if (!host) return;
      root.dataset.androidDisplayMode = fullscreen ? 'full' : 'safe';
      host.setFullscreen?.(fullscreen);
      // Safe mode's native WebView is already fitted between visible system bars.
      // Full mode uses local camera avoidance instead of a full-edge inset.
      for (const edge of ['top', 'right', 'bottom', 'left']) root.style.setProperty(`--overlay-safe-${edge}`, '0px');
      window.dispatchEvent(new Event('studioodle-overlay-layout'));
    };
    update();
    window.addEventListener('studioodle-display-change', update);
    return () => {
      window.removeEventListener('studioodle-display-change', update);
      delete root.dataset.androidDisplayMode;
      for (const edge of ['top', 'right', 'bottom', 'left']) root.style.removeProperty(`--overlay-safe-${edge}`);
    };
  }, [fullscreen]);
}

/** Only move corner controls if a reported camera actually intersects them. */
export function useCameraHeader(header: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const controls = [...header.current?.querySelectorAll<HTMLElement>('.dialog-header-button') ?? []];
    const reset = () => controls.forEach(b => b.style.removeProperty('translate'));
    const update = () => {
      reset();
      if (document.documentElement.dataset.androidDisplayMode !== 'full') return;
      let raw: DisplayGeometry;
      try { raw = JSON.parse(window.StudioodleDisplay?.read() ?? 'null') as DisplayGeometry; } catch { return; }
      if (!raw || !Array.isArray(raw.rects) || raw.width <= 0) return;
      const scale = innerWidth / raw.width;
      if (!Number.isFinite(scale) || Math.abs(raw.height * scale - innerHeight) > 3) return;
      for (const button of controls) {
        const box = button.getBoundingClientRect();
        if (!box.width) continue;
        let x = 0, y = 0;
        for (const rect of raw.rects) {
          const r = { left: rect.left * scale, right: rect.right * scale, top: rect.top * scale, bottom: rect.bottom * scale };
          if (box.right+x <= r.left || box.left+x >= r.right || box.bottom+y <= r.top || box.top+y >= r.bottom) continue;
          const nextX = box.left > innerWidth/2 ? r.left-box.right-1 : r.right-box.left+1;
          if (box.left+nextX >= 0 && box.right+nextX <= innerWidth) x = nextX;
          else y = r.bottom-box.top+1;
        }
        if (x || y) button.style.translate = `${x}px ${y}px`;
      }
    };
    const observer = new ResizeObserver(update);
    controls.forEach(b => observer.observe(b));
    update();
    for (const event of ['resize', 'studioodle-display-change', 'studioodle-overlay-layout']) window.addEventListener(event, update);
    return () => { observer.disconnect(); reset(); for (const event of ['resize', 'studioodle-display-change', 'studioodle-overlay-layout']) window.removeEventListener(event, update); };
  }, [header]);
}
