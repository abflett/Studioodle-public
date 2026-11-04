import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, LoaderCircle, Printer, RotateCw, Trash2 } from 'lucide-react';
import { pictureSummary } from '../editor/pictureSummary';
import type { PictureSummary } from '../editor/pictureSummary';
import type { SavedPicture } from '../editor/savedPicture';
import { paperSize } from '../editor/document';
import { pictureSvg } from '../editor/pictureSvg';
import { pictureThumbnails } from '../app/pictureThumbnails';
import { galleryThumbnailTier } from '../app/thumbnailSize';
import { ColoringPageActionIcon } from './ColoringPageActionIcon';
import { useLatest } from './useLatest';
import { DialogHeader } from './DialogHeader';
import drawingAction from '@studioodle-assets/interface/start-coloring.png';

type Props = {
  summary: PictureSummary;
  onMetadata: (summary: PictureSummary) => void;
  loadPicture: (signal?: AbortSignal) => Promise<SavedPicture | undefined>;
  opening: boolean; pageAdded: boolean; pagesLoading: boolean; actionBusy: boolean;
  message?: string; index: number; count: number;
  onNavigate: (direction: 'previous' | 'next') => void;
  onClose: () => void; onEdit: (picture: SavedPicture) => void;
  onDelete: (picture: SavedPicture) => void; onExport: (picture: SavedPicture) => void;
  onPrint: (picture: SavedPicture) => void; onAddPage: (picture: SavedPicture) => void;
};
/** Only the selected picture owns source loading and preview resources. */
function ViewerImage({ summary, width, height, loadPicture, onLoaded, disabled, onEdit }: {
  summary: PictureSummary; width: number; height: number;
  loadPicture: Props['loadPicture']; onLoaded: (picture: SavedPicture) => void;
  disabled: boolean; onEdit: () => void;
}) {
  const latest = useLatest({ loadPicture, onLoaded });
  const [cached] = useState(() => pictureThumbnails.peek(summary, galleryThumbnailTier()));
  const preview = useRef<HTMLImageElement>(null);
  const [sharp, setSharp] = useState<string>();
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => {
    const url = cached && URL.createObjectURL(cached.thumbnail.blob);
    if (url && preview.current) preview.current.src = url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [cached]);
  useEffect(() => {
    const controller = new AbortController(); let url: string | undefined;
    void (async () => {
      const picture = await latest.current.loadPicture(controller.signal);
      if (controller.signal.aborted) return;
      if (!picture || picture.id !== summary.id || picture.updatedAt !== summary.updatedAt) throw Error('Drawing changed');
      latest.current.onLoaded(picture);
      const svg = await pictureSvg(picture);
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
      const image = new Image(); image.src = url; await image.decode();
      if (!controller.signal.aborted) setSharp(url);
    })().catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [latest, summary.id, summary.updatedAt, attempt]);
  return <>
    <button type="button" className="picture-viewer-paper" style={{ width, height, background: summary.background }} disabled={disabled} aria-label={`Edit picture: ${summary.title}`} title="Edit this picture" onClick={onEdit}>
      {(sharp || cached) && <img ref={preview} className="picture-viewer-image" src={sharp ?? cached?.url} data-picture-id={summary.id} data-quality={sharp ? 'sharp' : 'thumbnail'} alt={summary.title} draggable={false} onError={() => setError(true)} />}
    </button>
    {!sharp && !error && <span className="viewer-loading" role="status"><LoaderCircle className="preview-spinner" aria-hidden="true" />Preparing preview</span>}
    {error && <div className="viewer-loading" role="status"><span>Could not load the full preview.</span><button className="icon-button" aria-label="Retry picture preview" onClick={() => { setError(false); setSharp(undefined); setAttempt(value => value + 1); }}><RotateCw aria-hidden="true" /></button></div>}
  </>;
}
/** Persistent modal/navigation; only its image changes while browsing. */
export function PictureViewer(props: Props) {
  const { summary, opening, pageAdded, pagesLoading, actionBusy, message, onClose, count, index, onNavigate } = props;
  const dialog = useRef<HTMLDialogElement>(null), browser = useRef<HTMLDivElement>(null);
  const key = `${summary.id}:${summary.updatedAt}`;
  const [loaded, setLoaded] = useState<{ key: string; picture: SavedPicture }>();
  const picture = loaded?.key === key ? loaded.picture : undefined;
  const [bounds, setBounds] = useState({ width: 1, height: 1 });
  useLayoutEffect(() => {
    const modal = dialog.current!; modal.showModal();
    const element = browser.current!;
    const measure = () => {
      const portrait = matchMedia('(max-aspect-ratio: 1/1)').matches;
      setBounds({ width: Math.max(1, element.clientWidth - (portrait ? 0 : 112)), height: Math.max(1, element.clientHeight - (portrait ? 52 : 0)) });
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element); window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); modal.close(); };
  }, []);
  const size = paperSize(summary.format, summary.size), ratio = size.width / size.height;
  const width = Math.min(bounds.width, bounds.height * ratio), height = width / ratio;
  const disabled = !picture || opening || actionBusy, navigationDisabled = count < 2 || opening || actionBusy;
  const close = () => { if (!opening) onClose(); };
  return <dialog ref={dialog} className="setup-dialog picture-viewer" aria-labelledby="picture-viewer-title" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => {
    if (event.target instanceof Element && event.target.closest('input,textarea,select')) return;
    if (!navigationDisabled && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); onNavigate(event.key === 'ArrowLeft' ? 'previous' : 'next'); }
  }}>
    <div className="picture-viewer-layout" aria-busy={opening}>
      <div className="picture-viewer-header"><DialogHeader id="picture-viewer-title" title={<span className="sr-only">View picture: {summary.title}</span>} onClose={close} closeLabel="Close picture viewer" closeDisabled={opening} /></div>
      <div ref={browser} className="viewer-browser">
        <button className="icon-button viewer-previous" disabled={navigationDisabled} aria-label="Previous picture in viewer" title="Previous picture" onClick={() => onNavigate('previous')}><ArrowLeft aria-hidden="true" /></button>
        <div className="picture-viewer-stage" style={{ height }}>
          <ViewerImage key={key} summary={summary} width={width} height={height} disabled={disabled} onEdit={() => picture && props.onEdit(picture)} loadPicture={props.loadPicture} onLoaded={picture => { setLoaded({ key, picture }); props.onMetadata(pictureSummary(picture)); }} />
        </div>
        <button className="icon-button viewer-next" disabled={navigationDisabled} aria-label="Next picture in viewer" title="Next picture" onClick={() => onNavigate('next')}><ArrowRight aria-hidden="true" /></button>
        <span className="sr-only" role="status">Saved picture {index + 1} of {count}</span>
      </div>
      <footer className="picture-viewer-footer">
        <nav className="viewer-actions" aria-label="Selected saved picture actions">
          <button className="icon-button coloring-page-add" data-added={pageAdded || undefined} disabled={disabled || pagesLoading || (summary.stickerCount ?? 0) < 1 || pageAdded} aria-label={pageAdded ? 'Added to coloring pages' : 'Add selected picture to coloring pages'} title={pageAdded ? 'Added to coloring pages' : 'Save as coloring page'} onClick={() => picture && props.onAddPage(picture)}><ColoringPageActionIcon added={pageAdded} /></button>
          <button className="icon-button" disabled={disabled} aria-label="Print selected saved picture" title="Print" onClick={() => picture && props.onPrint(picture)}><Printer aria-hidden="true" /></button>
          <button className="icon-button" disabled={disabled} aria-label="Export selected saved picture" title="Export" onClick={() => picture && props.onExport(picture)}><Download aria-hidden="true" /></button>
          <button className="icon-button" disabled={disabled} aria-label="Delete selected saved picture" title="Delete" onClick={() => picture && props.onDelete(picture)}><Trash2 aria-hidden="true" /></button>
          <button className="page-draw-action viewer-edit" title="Edit this picture" disabled={disabled} aria-label="Edit this picture" onClick={() => picture && props.onEdit(picture)}><img src={drawingAction} alt="" aria-hidden="true" /></button>
        </nav>
        {opening && <div className="viewer-message" role="status"><LoaderCircle className="preview-spinner" width={18} height={18} aria-hidden="true" />Opening editor...</div>}
        {message && <div className="viewer-message" role="status">{message}</div>}
      </footer>
    </div>
  </dialog>;
}
