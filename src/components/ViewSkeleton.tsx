import './HomeSkeleton.css';
import type { Tab } from './BottomNav';

export default function ViewSkeleton({ view }: { view: Tab }) {
  if (view === 'home') return (
    <div key={view} role="status" aria-live="polite" aria-label="Cargando" className="view-skeleton view-skeleton-home">
      <span className="sr-only">Cargando Inicio…</span>
      <div className="home-placeholder-date" aria-hidden="true">
        <div className="placeholder-date-heading"><i /><i /><i /></div>
        <div className="placeholder-week">{Array.from({ length: 7 }, (_, day) => <i key={day} />)}</div>
      </div>
      <div className="home-placeholder-balance" aria-hidden="true">
        <div className="placeholder-readout"><i /><i /><i /></div>
        <div className="placeholder-channels"><div><i /><i /></div><div><i /><i /></div></div>
        <i className="placeholder-footnote" />
      </div>
      <div className="home-placeholder-journal" aria-hidden="true">
        <div className="home-placeholder-actions"><i /><i /></div>
        <div className="home-placeholder-habits">
          <i className="placeholder-label" />
          <div className="placeholder-columns">{[0, 1, 2].map(slot => <div key={slot}><i /><i /><i /></div>)}</div>
        </div>
        <div id="fitness-daily-entries" className="home-placeholder-records">
          <i className="placeholder-label" />
          {[0, 1].map(slot => <div className="placeholder-record" key={slot}><i /><i /><i /></div>)}
        </div>
      </div>
    </div>
  );
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
