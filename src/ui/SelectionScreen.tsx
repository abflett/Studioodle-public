import { ColoringPagePicker } from './ColoringPagePicker';
import { Brand } from './Brand';
import { platformCapabilities } from '../platform/capabilities';
import { paperRotation } from '../app/paperLayers';
import { ExportPictureDialog } from './ExportPictureDialog';
import { BlankPageSetup } from './BlankPageSetup';
import { saveCustomPage, customPagesRepository } from '../app/customColoringPages';
import { coloringPages } from '../app/coloringPages';
import { DeletePictureDialog } from './DeletePictureDialog';
import { isDesktop, isNative, toggleDesktopFullscreen, watchDesktopFullscreen } from '../platform/desktop';
import { WebInstall } from '../platform/WebInstall';
import type { AppSettings } from './settings';
import { SelectionSettings } from './SelectionSettings';
import { paperSize } from '../editor/document';
import { useDisplayPage } from './useDisplayPage';
import type { PaperOrientation, PaperPresetId } from '../editor/paperPresets';
import { createColoringPage } from '../editor/coloringPage';
import { coloringPageLayoutFingerprint } from '../editor/coloringPageLayout';
import { PictureViewer } from './PictureViewer';
import { usePictureLibrary } from './usePictureLibrary';
import type { SavedPicture } from '../editor/savedPicture';
import { printPicture } from '../app/pictureOutput';
import { GalleryPreview } from './GalleryPreview';
import { mergeColoringPages } from '../editor/coloringBook';
import type { ColoringBookPage } from '../editor/coloringBook';
import { useEffect, useMemo, useState, useRef, useCallback, useLayoutEffect } from 'react';
import { ArrowLeft, ArrowRight, X, Undo2, Settings, LogOut, Fullscreen, Minimize, LoaderCircle, ImageOff, RotateCw } from 'lucide-react';
import { pictureChoices, savedStackImage, portfolioPaper } from '../app/startup';
import type { EditorSetup } from '../editor/setup';
import type { ThemePreference } from './theme';

function Arrow({ direction }: { direction: 'left' | 'right' }) {
  return direction === 'left' ? <ArrowLeft aria-hidden="true" /> : <ArrowRight aria-hidden="true" />;
}

type WizardStep = 'shape' | 'paper' | 'scene';

export function SelectionScreen({ opening = false, openingError = false, onOpen, onExit, theme, onThemeChange, settings, onSettingsChange }: {
  opening?: boolean;
  openingError?: boolean;
  onOpen: (setup: EditorSetup) => void;
  onExit: () => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}) {
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    if (isDesktop) {
      let disposed = false;
      let stop: (() => void) | undefined;
      void watchDesktopFullscreen(value => { if (!disposed) setFullscreen(value); }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten; }).catch(() => {});
      return () => { disposed = true; stop?.(); };
    }
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const [exportingPicture, setExportingPicture] = useState<SavedPicture>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [step, setStep] = useState<WizardStep | null>(null);
  const [paperPreset, setPaperPreset] = useState<PaperPresetId>('display');
  const displaySize = useDisplayPage();
  const [manualOrientation, setOrientation] = useState<PaperOrientation>();
  const orientation = manualOrientation ?? (displaySize.width >= displaySize.height ? 'landscape' : 'portrait');
  const [pageTurn, setPageTurn] = useState<'next' | 'previous'>();
  const [background, setBackground] = useState('#ffffff');
  const { library, saved, sampleIndex, setSampleIndex, loadCurrent, previewMetadata, previewFailed, retryAttempt, currentError, retry, removePicture, restorePicture } = usePictureLibrary();
  const [customPages, setCustomPages] = useState<ColoringBookPage[]>([]);
  const [bookState, setBookState] = useState<{ pages: EditorSetup[]; error: boolean; loading: boolean }>({ pages: coloringPages, error: false, loading: true });
  const scenes: EditorSetup[] = bookState.pages;
  const refreshBooks = useCallback(async () => {
    try { const book = await customPagesRepository.load(); setCustomPages(book.pages); setBookState({ pages: mergeColoringPages(coloringPages, book.pages), error: false, loading: false }); }
    catch { setBookState(previous => ({ ...previous, error: true, loading: false })); }
  }, []);
  useEffect(() => {
    let active = true;
    void customPagesRepository.load().then(book => {
      if (active) { setCustomPages(book.pages); setBookState({ pages: mergeColoringPages(coloringPages, book.pages), error: false, loading: false }); }
    }).catch(() => { if (active) setBookState(previous => ({ ...previous, error: true, loading: false })); });
    return () => { active = false; };
  }, []);
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(undefined), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const [deletingPage, setDeletingPage] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SavedPicture>();
  const [toastPaused, setToastPaused] = useState(false);
  const [removed, setRemoved] = useState<SavedPicture>();
  const [actionError, setActionError] = useState<string>();
  useEffect(() => {
    if (!removed || toastPaused || actionError || pendingDelete || viewing) return;
    const timeout = window.setTimeout(() => setRemoved(undefined), 8000);
    return () => window.clearTimeout(timeout);
  }, [removed, toastPaused, actionError, pendingDelete, viewing]);
  const removeCurrent = async (picture: SavedPicture) => {
    setPendingDelete(undefined);
    try {
      if (deletingPage) {
        await customPagesRepository.delete(picture.id);
        setCustomPages(pages => pages.filter(item => item.id !== picture.id));
        await refreshBooks();
        setInitialSceneId(undefined);
        setDeletingPage(false); setRemoved(undefined); setActionError(undefined); setNotice('Coloring page removed');
        return;
      }
      await removePicture(picture);
      setViewing(false); setRemoved(picture); setToastPaused(false); setActionError(undefined);
    } catch { setActionError('Could not delete this picture.'); }
  };
  const undoRemove = async () => {
    if (!removed) return;
    try {
      await restorePicture(removed);
      setRemoved(undefined); setActionError(undefined);
    } catch { setActionError('Could not restore this picture.'); }
  };
  const [initialSceneId, setInitialSceneId] = useState<string>();

  const currentSummary = saved[sampleIndex];
  const previewSize = paperSize(currentSummary?.format ?? 'landscape', currentSummary?.size);
  const previewRatio = previewSize.width / previewSize.height;
  const frontPaper = portfolioPaper(previewRatio);
  // Paper, mask and overlay keep their shared template ratio; the drawing covers that frame.
  const sheetRatio = frontPaper.ratio;
  const browseSaved = (direction: 'next' | 'previous') => {
    setPageTurn(direction);
    setSampleIndex(index => (index + (direction === 'next' ? 1 : saved.length - 1)) % saved.length);
  };
  const addedLayouts = useMemo(() => new Set(customPages.map(coloringPageLayoutFingerprint)), [customPages]);
  const pageAdded = !!currentSummary?.pageLayout && addedLayouts.has(currentSummary.pageLayout);
  const selectedKey = currentSummary ? `${currentSummary.id}:${currentSummary.updatedAt}` : undefined;
  const [actionBusy, setActionBusy] = useState(false);
  const pictureOpening = opening;
  const actionInFlight = useRef(false);
  const selection = useRef(selectedKey);
  useLayoutEffect(() => { selection.current = selectedKey; return () => { selection.current = undefined; }; }, [selectedKey]);
  const addColoringPage = async (current: SavedPicture) => {
    if (pageAdded || actionInFlight.current || current.document.surfaces.length < 2) return;
    actionInFlight.current = true; setActionBusy(true);
    const identity = selectedKey;
    try {
      const number = customPages.reduce((max, page) => Math.max(max, Number(/^Coloring page (\d+)$/i.exec(page.title)?.[1] ?? 0)), 0) + 1;
      const page = createColoringPage(current, `Coloring Page ${number}`);
      await saveCustomPage(page, page.id, page.title);
      await refreshBooks();
      if (selection.current === identity) { setRemoved(undefined); setActionError(undefined); setNotice('Added to coloring pages'); }
    } catch { if (selection.current === identity) setActionError('Could not save coloring page. Device storage may be full or unavailable.'); }
    finally { actionInFlight.current = false; setActionBusy(false); }
  };
  const openPicture = (setup: EditorSetup) => {
    setStep(null);
    // Templates are immutable starting points, each use gets a fresh saved-picture id.
    onOpen(step === 'scene' ? { ...setup, id: undefined } : setup);
  };

  return (
    <main className="selection-screen" data-opening={pictureOpening || undefined} aria-busy={pictureOpening} aria-label="Choose a picture">
      <section className="selection" inert={pictureOpening}>
        <nav className="selection-preferences studio-actions" aria-label="Studio controls">
          <button className="icon-button" title="Settings" aria-label="Settings" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}><Settings aria-hidden="true" /></button>
        {(isDesktop || document.fullscreenEnabled) && <button className="fullscreen-toggle icon-button" title={fullscreen ? 'Leave fullscreen' : 'Fullscreen'} aria-label={fullscreen ? 'Leave fullscreen' : 'Fullscreen'} onClick={() => {
          const action = isDesktop ? toggleDesktopFullscreen().then(setFullscreen) : document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
          void action.catch(() => setActionError('Fullscreen is unavailable in this window.'));
        }}>{fullscreen ? <Minimize aria-hidden="true" /> : <Fullscreen aria-hidden="true" />}</button>}
          {platformCapabilities.exit && <button className="icon-button" title="Exit Studioodle" aria-label="Exit Studioodle" onClick={onExit}><LogOut aria-hidden="true" /></button>}
          {!isNative && (import.meta.env.DEV || import.meta.env.VITE_PWA_ENABLED === 'true') && <WebInstall />}
        </nav>
        <div className="choice-grid">
          {pictureChoices.map((item) => (
            <button className={`choice-card choice-${item.id}`} key={item.id}
              aria-label={item.id === 'blank' ? 'Draw a new picture' : 'Color a picture'}
              title={item.id === 'blank' ? 'Draw a new picture' : 'Color a picture'}
              onClick={() => { if (item.id === 'blank') { setOrientation(undefined); } else setInitialSceneId(undefined); setStep(item.id === 'blank' ? 'shape' : 'scene'); }} aria-haspopup="dialog">
              <span className="choice-art">
                <img className="choice-illustration" src={item.artwork} srcSet={item.srcSet} sizes={item.sizes} alt="" aria-hidden="true" draggable={false} decoding="async" />
              </span>
            </button>
          ))}
        </div>
        <section className="previous-section" aria-label="Previous pictures">

          <div className="picture-carousel" data-paper-shape={frontPaper.shape}>
            <button className="icon-button" aria-label="Previous saved picture" disabled={saved.length < 2} onClick={() => browseSaved('previous')}><Arrow direction="left" /></button>
            <div className="saved-picture-card" role="group" aria-labelledby="your-pictures-label">
              <button className="choice-card previous-picture" aria-label={currentSummary ? `View saved picture: ${currentSummary.title}` : 'View a saved picture (no saved pictures yet)'} title={currentSummary ? `View ${currentSummary.title}` : 'Your pictures'} disabled={!currentSummary} aria-haspopup="dialog" onClick={() => { setActionError(undefined); setNotice(undefined); setViewing(true); }}>
                <span className="choice-art portfolio-stage">
                  <span className="portfolio-stack" aria-hidden="true">
                    <img className="portfolio-stack-art" src={savedStackImage.artwork} srcSet={savedStackImage.srcSet} sizes={savedStackImage.sizes} alt="" draggable={false} decoding="async" />
                    <span className="portfolio-stack-brand"><Brand decorative /></span>
                    <span className="portfolio-stack-status" data-state={pictureOpening ? 'opening' : currentSummary ? 'preview' : library.loading ? 'loading' : library.error ? 'error' : 'empty'}>
                      <LoaderCircle className="preview-spinner portfolio-status-spinner" />
                      <ImageOff className="portfolio-status-error" />
                      {library.error && <span className="portfolio-stack-error">Storage unavailable</span>}
                    </span>
                  </span>
                  {currentSummary ? <span className="portfolio-pile" data-paper-shape={frontPaper.shape} style={{ rotate: paperRotation(currentSummary?.id ?? 'empty'), width: `min(90%, calc(var(--object-height) * var(--sheet-fill, .88) * ${sheetRatio}))`, aspectRatio: `${sheetRatio}` }}>
                    <span className={`portfolio-page${pageTurn ? ` turn-${pageTurn}` : ''}`} key={currentSummary ? `${currentSummary.id}:${currentSummary.updatedAt}` : 'empty'}>
                      <span className="portfolio-paper-backing" aria-hidden="true" style={{ maskImage: `url("${frontPaper.backingMask}")`, backgroundColor: '#302b23' }} />
                      <span className="portfolio-artwork" style={frontPaper.artworkStyle}>
                        <GalleryPreview key={`${currentSummary.id}:${currentSummary.updatedAt}:${retryAttempt}`} picture={currentSummary} onMetadata={previewMetadata} onUnavailable={previewFailed} />
                      </span>
                      <img className="portfolio-paper-overlay" src={frontPaper.artwork} alt="" aria-hidden="true" draggable={false} />
                    </span>
                  </span> : null}
                </span>
              </button>
              {(library.error || currentError) && <button className="icon-button gallery-retry" aria-label="Retry loading saved pictures" title="Retry loading" onClick={retry}><RotateCw aria-hidden="true" /></button>}
              <h2 className="sr-only" id="your-pictures-label">Your pictures</h2>
            </div>
            <button className="icon-button" aria-label="Next saved picture" disabled={saved.length < 2} onClick={() => browseSaved('next')}><Arrow direction="right" /></button>
          </div>


          <p className="sr-only" role="status">{saved.length ? `Saved picture ${sampleIndex + 1} of ${saved.length}` : 'No saved pictures yet'}</p>
        </section>
      </section>
      <span className="sr-only" role="status">{pictureOpening ? 'Loading picture' : library.loading ? 'Loading saved pictures' : library.error ? 'Storage unavailable' : ''}</span>

      {(step === 'shape' || step === 'paper') && <BlankPageSetup displaySize={displaySize} step={step} onStep={setStep} paperPreset={paperPreset} orientation={orientation} background={background} onPreset={setPaperPreset} onOrientation={setOrientation} onBackground={setBackground} onClose={() => setStep(null)} onOpen={openPicture} />}
      {step === 'scene' && <ColoringPagePicker pages={scenes} initialPageId={initialSceneId} bundledIds={new Set(coloringPages.map(page => page.id))} onClose={() => setStep(null)} onOpen={openPicture} onAdded={() => { void refreshBooks(); }} onDelete={page => { setDeletingPage(true); setPendingDelete(page); }} />}
      {viewing && currentSummary && <PictureViewer summary={currentSummary} index={sampleIndex} count={saved.length} onNavigate={direction => { setActionError(undefined); setNotice(undefined); browseSaved(direction); }} onMetadata={previewMetadata} loadPicture={loadCurrent} opening={opening} actionBusy={actionBusy} pageAdded={pageAdded} pagesLoading={bookState.loading}
        message={actionError ?? (openingError ? 'Could not open the editor. Please retry Edit.' : notice)} onClose={() => setViewing(false)} onEdit={onOpen}
        onDelete={picture => { setDeletingPage(false); setPendingDelete(picture); }} onExport={setExportingPicture}
        onPrint={picture => printPicture(picture, () => setActionError('Could not open printing. Allow the print window and try again.'))}
        onAddPage={picture => { void addColoringPage(picture); }} />}
      {exportingPicture && <ExportPictureDialog picture={exportingPicture} onClose={() => setExportingPicture(undefined)} />}
      <DeletePictureDialog picture={pendingDelete} onCancel={() => { setPendingDelete(undefined); setDeletingPage(false); }} onConfirm={removeCurrent} />
      <SelectionSettings settings={settings} onSettingsChange={onSettingsChange} open={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} onThemeChange={onThemeChange} />

      {bookState.error && <p className="custom-pages-storage-error" role="alert">Coloring pages could not be loaded. Saved pages have not been changed.</p>}
      {!viewing && (removed || actionError || notice) && <div className="save-notice library-notice" role="status" onPointerEnter={() => setToastPaused(true)} onPointerLeave={() => setToastPaused(false)} onFocusCapture={() => setToastPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setToastPaused(false); }}>
        <span>{actionError ?? notice ?? 'Picture removed'}</span>
        {removed && <button className="icon-button" aria-label="Undo delete" onClick={undoRemove}><Undo2 /></button>}
        <button className="icon-button" aria-label="Dismiss message" onClick={() => { setRemoved(undefined); setActionError(undefined); setNotice(undefined); }}><X /></button>
      </div>}
    </main>
  );
}
