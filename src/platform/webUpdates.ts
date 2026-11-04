import { version as packageVersion } from '../../package.json';
import { pictureSaves } from '../app/pictures';

type UpdateState = {
  phase: 'preview' | 'checking' | 'downloading' | 'ready' | 'error';
  message: string;
  registration?: ServiceWorkerRegistration;
  completed: number;
  total: number;
  updateReady: boolean;
};
const pageVersion = typeof document === 'undefined' ? packageVersion : document.querySelector<HTMLMetaElement>('meta[name="studioodle-version"]')?.content ?? packageVersion;
let state: UpdateState = { phase: import.meta.env.DEV ? 'preview' : 'checking', message: import.meta.env.DEV ? 'Offline downloads are disabled in this development preview.' : 'Checking for updates...', completed: 0, total: 0, updateReady: false };
const listeners = new Set<() => void>();
let started = false, homeReady = false, applying = false, reloadRequested = false;
export const webUpdateSnapshot = () => state;
export const subscribeWebUpdates = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function update(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
  void applyAtHome();
}
function compareVersions(a: string, b: string) {
  if (!/^\d+\.\d+\.\d+$/.test(a) || !/^\d+\.\d+\.\d+$/.test(b)) return 0;
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
  return 0;
}
function safeHome() {
  return homeReady && !!document.querySelector('.selection-screen:not([aria-busy="true"])') && document.visibilityState === 'visible' && !document.querySelector('dialog[open]') && !pictureSaves.hasErrors();
}
async function applyAtHome() {
  if (!state.updateReady || applying || reloadRequested || !safeHome()) return;
  applying = true;
  try {
    if (await pictureSaves.flush() && safeHome()) {
      reloadRequested = true;
      location.reload();
    }
  } finally { applying = false; }
}
export function setWebHomeReady(ready: boolean) { homeReady = ready; void applyAtHome(); }

async function readActive() {
  const registration = state.registration;
  const worker = registration?.active;
  if (!worker) return;
  const information = await new Promise<{ version: string } | undefined>(resolve => {
    const channel = new MessageChannel();
    const finish = (value?: { version: string }) => { clearTimeout(timer); channel.port1.close(); resolve(value); };
    const timer = setTimeout(() => finish(), 1200);
    channel.port1.onmessage = event => finish(event.data);
    try { worker.postMessage({ type: 'STUDIOODLE_VERSION' }, [channel.port2]); }
    catch { finish(); }
  });
  if (worker !== state.registration?.active) return;
  if (!information?.version) return; // An older worker is being replaced by this launch's update check.
  const difference = compareVersions(information.version, pageVersion);
  if (difference < 0 || registration?.installing) return;
  update({ phase: 'ready', updateReady: difference > 0, message: difference > 0
    ? 'Update downloaded. It will apply automatically when you return home and close any open panel.'
    : 'Ready for offline use. Export important pictures as backups.' });
}

export async function checkWebUpdates() {
  if (!state.registration) return;
  if (!navigator.onLine) { update({ phase: state.phase === 'ready' ? 'ready' : 'error', message: 'You are offline. Updates will be checked when you reconnect.' }); return; }
  try { await state.registration.update(); await readActive(); }
  catch { update({ message: 'Could not check for updates. Reconnecting will retry automatically.' }); }
}

/** One updater per browser page, including while the editor is open. */
export function startWebUpdates() {
  if (started || import.meta.env.DEV) return;
  started = true;
  if (!('serviceWorker' in navigator)) { update({ phase: 'error', message: 'Offline installation is not supported by this browser.' }); return; }
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'STUDIOODLE_DOWNLOAD_PROGRESS') return;
    update({ phase: 'downloading', completed: event.data.completed, total: event.data.total,
      message: `Downloading for offline use: ${event.data.completed} of ${event.data.total} files.` });
    if (event.data.completed === event.data.total) void readActive();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { void readActive(); });
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(registration => {
    update({ registration });
    const watch = () => {
      const worker = registration.installing;
      if (!worker) { void readActive(); return; }
      let activated = false;
      update({ phase: 'downloading', completed: 0, total: 0, message: 'Downloading for offline use...' });
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') { activated = true; void readActive(); }
        if (worker.state === 'redundant' && !activated) update({ phase: 'error', message: 'Offline download interrupted. Reconnecting will retry automatically.' });
      });
      worker.postMessage({ type: 'STUDIOODLE_PROGRESS' });
    };
    registration.addEventListener('updatefound', watch);
    watch(); void checkWebUpdates();
  }).catch(() => update({ phase: 'error', message: 'Offline setup is unavailable. Reopen online to retry.' }));
  window.addEventListener('online', () => { void checkWebUpdates(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { void checkWebUpdates(); void applyAtHome(); }
  });
  window.setInterval(() => { void checkWebUpdates(); }, 15 * 60 * 1000);
  window.setInterval(() => { void applyAtHome(); }, 500);
}
