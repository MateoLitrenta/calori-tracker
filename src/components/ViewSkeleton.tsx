import type { Tab } from './BottomNav';

export default function ViewSkeleton({ view }: { view: Tab }) {
  return (
    <div key={view} role="status" aria-live="polite" aria-label="Cargando"
      className={`view-skeleton view-skeleton-${view}`}>
      <span className="sr-only">Cargando…</span>
      <div aria-hidden="true" className="skeleton-heading">
        {view === 'chat' && <span className="skeleton-block skeleton-avatar" />}
        <span className="skeleton-block skeleton-title" />
      </div>
      {view === 'profile' ? (
        <div aria-hidden="true" className="skeleton-surface skeleton-profile">
          <div className="skeleton-identity"><span className="skeleton-block skeleton-avatar" /><span className="skeleton-block skeleton-line" /></div>
          <div className="skeleton-grid"><span className="skeleton-block" /><span className="skeleton-block" /><span className="skeleton-block" /><span className="skeleton-block" /></div>
        </div>
      ) : (
        <div aria-hidden="true" className="skeleton-surface skeleton-primary"><span className="skeleton-block skeleton-line" /></div>
      )}
      {view !== 'chat' && <div aria-hidden="true" className="skeleton-grid skeleton-widgets"><span className="skeleton-surface" /><span className="skeleton-surface" /><span className="skeleton-surface" /></div>}
      <div aria-hidden="true" className="skeleton-surface skeleton-secondary"><span className="skeleton-block skeleton-line" /></div>
    </div>
  );
}
