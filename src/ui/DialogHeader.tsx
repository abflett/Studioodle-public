import type { ReactNode, Ref } from 'react';
import { useRef } from 'react';
import { useCameraHeader } from './useAndroidDisplay';
import { ArrowLeft, X } from 'lucide-react';

/** Consistent title alignment and full-size, labelled controls for every overlay. */
export function DialogHeader({ id, title, onClose, closeLabel, back, headingRef, children, closeDisabled = false }: {
  id: string;
  title: ReactNode;
  onClose: () => void;
  closeLabel: string;
  closeDisabled?: boolean;
  back?: { label: string; onClick: () => void };
  headingRef?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
}) {
  const header = useRef<HTMLElement>(null);
  useCameraHeader(header);
  return <header ref={header} className={`wizard-header dialog-header${back ? ' has-back' : ''}`}>
    {back && <button type="button" className="icon-button dialog-header-button dialog-back" aria-label={back.label} title={back.label} onClick={back.onClick}><ArrowLeft aria-hidden="true" /></button>}
    <div className="dialog-heading"><h2 id={id} ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{title}</h2>{children}</div>
    <button type="button" className="icon-button dialog-header-button dialog-close" disabled={closeDisabled} aria-label={closeLabel} title={closeLabel} onClick={onClose}><X aria-hidden="true" /></button>
  </header>;
}
