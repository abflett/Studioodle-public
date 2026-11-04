import { useEffect, useState } from 'react';
import './webInstall.css';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export function WebInstall() {
  const [status, setStatus] = useState('Preparing offline download…');
  const [install, setInstall] = useState<InstallPrompt>();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let disposed = false;
    let current: ServiceWorkerRegistration | undefined;
    let unwatch = () => {};
    const updateStatus = () => {
      if (disposed || !current) return;
      setStatus(current.waiting ? 'Update ready. Close all Studioodle app windows and tabs, then reopen to update.'
        : current.installing ? 'Downloading artwork for offline use…'
        : current.active ? 'Ready for offline use. Export important pictures as backups.' : 'Preparing offline download…');
    };
    const check = () => { if (navigator.onLine) void current?.update().catch(() => {}); };
    const focus = () => { if (document.visibilityState === 'visible') check(); };
    const prompt = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    const installed = () => setInstall(undefined);
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(value => {
      if (disposed) return;
      current = value; setRegistration(value);
      const watch = () => {
        updateStatus();
        const worker = value.installing;
        const changed = () => {
          if (disposed) return;
          if (worker?.state === 'redundant' && !value.active) setStatus('Offline download interrupted. Reopen online to retry.');
          else updateStatus();
        };
        worker?.addEventListener('statechange', changed);
      };
      value.addEventListener('updatefound', watch);
      unwatch = () => value.removeEventListener('updatefound', watch);
      watch(); check();
    }).catch(() => { if (!disposed) setStatus('Offline download unavailable. Reopen online to retry.'); });
    navigator.serviceWorker.addEventListener('controllerchange', updateStatus);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);
    const interval = window.setInterval(check, 60 * 60 * 1000);
    return () => {
      disposed = true; clearInterval(interval); unwatch();
      navigator.serviceWorker.removeEventListener('controllerchange', updateStatus);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  return <details className="web-install"><summary>Install &amp; updates</summary>
    <p role="status">{status}</p>
    {install ? <button onClick={() => { void install.prompt().then(() => install.userChoice).catch(() => setStatus('Use your browser menu to install Studioodle.')).finally(() => setInstall(undefined)); }}>Install Studioodle</button>
      : <p>Use your browser’s Install App option. On iPhone/iPad, use Safari’s Share → Add to Home Screen.</p>}
    <button disabled={!registration} onClick={() => {
      setStatus('Checking for updates…');
      void registration?.update().then(() => setStatus(registration.waiting
        ? 'Update ready. Close all Studioodle app windows and tabs, then reopen to update.'
        : registration.installing ? 'Downloading update…' : registration.active ? 'No new update found. Ready for offline use.' : 'Offline download is not ready. Reopen online to retry.'))
        .catch(() => setStatus('Could not check for updates. Try again when online.'));
    }}>Check for updates</button>
  </details>;
}
