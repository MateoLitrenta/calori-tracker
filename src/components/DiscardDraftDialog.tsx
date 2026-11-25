import { useLayoutEffect, useRef } from 'react';
import './FitnessProfile.css';

export default function DiscardDraftDialog({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    keep.current?.focus({ preventScroll: true });
    return () => dialog.close();
  }, []);

  return <dialog ref={ref} data-discard-draft className="profile-dialog" aria-labelledby="discard-draft-title" aria-describedby="discard-draft-description"
    onCancel={event => { event.preventDefault(); onKeep(); }}
    onClick={event => { if (event.target === event.currentTarget) onKeep(); }}>
    <div className="profile-dialog-body">
      <h2 id="discard-draft-title" className="profile-section-title">¿Descartar los cambios?</h2>
      <p id="discard-draft-description" className="profile-muted">Los cambios sin guardar se perderán.</p>
      <div className="profile-actions profile-form-actions">
        <button ref={keep} type="button" className="profile-button profile-button-neutral" onClick={onKeep}>Seguir editando</button>
        <button type="button" className="profile-button profile-button-danger" onClick={onDiscard}>Descartar cambios</button>
      </div>
    </div>
  </dialog>;
}
