import { useEffect, useRef, useState } from 'react';
import { Download, Globe, LoaderCircle, RefreshCw, Share, Ellipsis, SquarePlus, Check, Monitor, Smartphone, ExternalLink } from 'lucide-react';
import { DialogHeader } from '../ui/DialogHeader';
import { websiteLinks } from '@studioodle-site-content';
import './webInstall.css';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export function WebInstall() {
  const [status, setStatus] = useState(import.meta.env.DEV ? 'Offline downloads are disabled in this development preview.' : 'Preparing offline download…');
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState<'apple' | 'android' | 'desktop'>(() => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? 'apple' : /Android/.test(navigator.userAgent) ? 'android' : 'desktop');
  const dialog = useRef<HTMLDialogElement>(null);
  const [install, setInstall] = useState<InstallPrompt>();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [failed, setFailed] = useState(false);
  const [refreshReady, setRefreshReady] = useState(false);
  useEffect(() => {
    const modal = dialog.current;
    if (open) modal?.showModal(); else modal?.close();
  }, [open]);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!('serviceWorker' in navigator)) return;
    let disposed = false;
    let current: ServiceWorkerRegistration | undefined;
    const startingController = navigator.serviceWorker.controller;
    let unwatch = () => {};
    const updateStatus = () => {
      if (disposed || !current) return;
      const updated = !!startingController && navigator.serviceWorker.controller !== startingController;
      setStatus(current.waiting || updated ? 'Update downloaded. Refresh when you are ready to use it. Your current session will not reload automatically.'
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
        if (worker) setFailed(false);
        const changed = () => {
          if (disposed) return;
          if (worker?.state === 'redundant' && !value.active) { setFailed(true); setStatus('Offline download interrupted. Reopen online to retry.'); }
          else updateStatus();
        };
        worker?.addEventListener('statechange', changed);
      };
      value.addEventListener('updatefound', watch);
      unwatch = () => value.removeEventListener('updatefound', watch);
      watch(); check();
    }).catch(() => { if (!disposed) { setFailed(true); setStatus('Offline download unavailable. Reopen online to retry.'); } });
    const controllerChanged = () => {
      if (disposed) return;
      if (startingController && navigator.serviceWorker.controller !== startingController) setRefreshReady(true);
      updateStatus();
    };
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);
    const interval = window.setInterval(check, 60 * 60 * 1000);
    return () => {
      disposed = true; clearInterval(interval); unwatch();
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  const busy = !import.meta.env.DEV && !failed && 'serviceWorker' in navigator && (!registration || !!registration.installing);
  const ready = !!registration?.active;
  const update = refreshReady || !!registration?.waiting;
  const Icon = busy ? LoaderCircle : Globe;
  const steps = guide === 'apple' ? [
    { icon: Share, title: 'Open Share', detail: 'In Safari, tap the Share icon. It may be inside the More menu.' },
    { icon: SquarePlus, title: 'Add to Home Screen', detail: 'Scroll through the actions and choose Add to Home Screen.' },
    { icon: Check, title: 'Add Studioodle', detail: 'Keep Open as Web App enabled if offered, then tap Add.' },
  ] : guide === 'android' ? [
    { icon: Ellipsis, title: 'Open the browser menu', detail: 'In Chrome or Edge, tap the menu beside the address bar.' },
    { icon: SquarePlus, title: 'Install app', detail: 'Choose Install app or Add to Home screen.' },
    { icon: Check, title: 'Confirm installation', detail: 'Open Studioodle from its new home-screen icon.' },
  ] : [
    { icon: Monitor, title: 'Look beside the address bar', detail: 'Chrome and Edge may show an install icon. Or open the browser menu.' },
    { icon: SquarePlus, title: 'Install Studioodle', detail: 'Choose Install Studioodle or Install this site as an app. In Safari on Mac, use File > Add to Dock.' },
    { icon: Check, title: 'Launch from your apps', detail: 'Studioodle opens in its own window, ready for your next picture.' },
  ];
  const checkForUpdates = () => {
    setStatus('Checking for updates...');
    void registration?.update().then(() => setStatus(registration.waiting || refreshReady
      ? 'Update downloaded. Refresh when you are ready to use it.'
      : registration.installing ? 'Downloading update...' : registration.active ? 'No new update found. Ready for offline use.' : 'Offline download is not ready. Reopen online to retry.'))
      .catch(() => setStatus('Could not check for updates. Try again when online.'));
  };
  return <>
    <button className="icon-button web-install" aria-label="Install and updates" title={update ? 'Update ready' : busy ? 'Downloading for offline use' : ready ? 'Available offline' : 'Install and updates'} aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon className={busy ? 'preview-spinner' : undefined} aria-hidden="true" />{update && <span className="web-status-dot" />}</button>
    <dialog ref={dialog} className="setup-dialog web-install-dialog" aria-labelledby="web-install-title" onCancel={event => { event.preventDefault(); setOpen(false); }}>
      <div className="web-install-layout">
        <DialogHeader id="web-install-title" title="Studioodle, wherever you doodle" onClose={() => setOpen(false)} closeLabel="Close install and updates" />
        <div className="web-install-content">
          <section className="web-offline-status" aria-labelledby="offline-title"><Icon className={busy ? 'preview-spinner' : undefined} aria-hidden="true" /><div><h3 id="offline-title">{update ? 'An update is ready on refresh' : busy ? 'Getting ready for offline drawing' : ready ? 'Your studio is available offline' : 'Your studio on the web'}</h3><p role="status">{status}</p></div><button className="format-button" disabled={!registration} onClick={checkForUpdates}><RefreshCw aria-hidden="true" /><span>Check for updates</span></button></section>
          <section aria-labelledby="install-title" className="web-install-guide"><div className="web-guide-heading"><div><h3 id="install-title">Give Studioodle a home</h3><p>One tap from your home screen or desktop. No account needed.</p></div>{install && <button className="go-button" onClick={() => { void install.prompt().then(() => install.userChoice).catch(() => setStatus('Use the illustrated steps below to install Studioodle.')).finally(() => setInstall(undefined)); }}><Download aria-hidden="true" />Install Studioodle</button>}</div>
            <div className="web-guide-tabs" role="group" aria-label="Installation instructions">
              {([{ id: 'apple', label: 'iPhone / iPad', icon: Smartphone }, { id: 'android', label: 'Android', icon: Smartphone }, { id: 'desktop', label: 'Computer', icon: Monitor }] as const).map(item => <button key={item.id} className="format-button" aria-pressed={guide === item.id} onClick={() => setGuide(item.id)}><item.icon aria-hidden="true" /><span>{item.label}</span></button>)}
            </div>
            <ol className="web-install-steps">{steps.map((step, index) => <li key={step.title}><div className="web-step-picture" aria-hidden="true"><span className="web-step-number">{index + 1}</span><div className="web-step-browser"><span /><step.icon /></div></div><h4>{step.title}</h4><p>{step.detail}</p></li>)}</ol>
          </section>
          <footer className="web-install-links"><p>Updates never reload an open picture. Refresh when you are ready to use a downloaded update. Export your favorites to keep a backup.</p><nav aria-label="Studioodle links"><a className="format-button" href="https://studioodle.com/" target="_blank" rel="noreferrer"><Globe aria-hidden="true" />Website &amp; news<ExternalLink aria-hidden="true" /></a>{websiteLinks.android && <a className="format-button" href={websiteLinks.android}><Smartphone aria-hidden="true" />Android APK</a>}{websiteLinks.windows && <a className="format-button" href={websiteLinks.windows}><Monitor aria-hidden="true" />Windows download</a>}</nav></footer>
        </div>
      </div>
    </dialog>
  </>;
}
