import type { CoachCardSnapshot } from '../utils/coachPresentation';
import { getBalanceLabel } from '../utils/helpers';

const number = (value: number) => value.toLocaleString('es-AR');

export default function CoachInsightCard({ card }: { card: CoachCardSnapshot }) {
  if (card.type === 'today_summary') return (
    <section className="coach-insight-card" aria-label="Resumen de hoy">
      <h4>Resumen de hoy</h4>
      <div className="coach-insight-hero">
        <span>Balance</span>
        <strong>{card.balance === null ? 'Sin datos todavía' : `${card.balance > 0 ? '+' : ''}${number(card.balance)} kcal`}</strong>
        {card.balance !== null && <span className={`coach-insight-balance ${card.balance < 0 ? 'is-deficit' : card.balance > 0 ? 'is-surplus' : ''}`}>
          {getBalanceLabel(card.balance)}
        </span>}
      </div>
      <dl className="coach-insight-metrics">
        {card.consumed !== null && <div><dt>Consumidas</dt><dd>{number(card.consumed)} kcal</dd></div>}
        <div><dt>Gasto estimado</dt><dd>{card.expenditure === null ? 'Sin datos' : `${number(card.expenditure)} kcal`}</dd></div>
      </dl>
      <p className="coach-insight-footnote">{number(card.mealCount)} {card.mealCount === 1 ? 'comida' : 'comidas'} · {number(card.workoutCount)} {card.workoutCount === 1 ? 'entreno' : 'entrenos'} · {card.steps ? `${number(card.steps)} pasos` : 'Pasos: Sin registro'}</p>
    </section>
  );

  if (card.type === 'nutrition_recent') return (
    <section className="coach-insight-card" aria-label="Alimentación · Últimos 7 días">
      <h4>Alimentación</h4><p className="coach-insight-period">Últimos 7 días</p>
      <dl className="coach-insight-metrics">
        <div className="coach-insight-primary-metric"><dt>Promedio registrado</dt><dd>{card.averageCalories === null ? 'Sin datos' : `${number(card.averageCalories)} kcal/día`}</dd></div>
        <div><dt>Días con comidas</dt><dd>{card.mealDays} de 7</dd></div>
        <div><dt>Comidas registradas</dt><dd>{number(card.mealCount)}</dd></div>
      </dl>
      {card.mealDays === 0 && <p className="coach-insight-footnote">No hay comidas registradas en esta ventana.</p>}
    </section>
  );

  return (
    <section className="coach-insight-card" aria-label="Actividad · Últimos 7 días">
      <h4>Actividad</h4><p className="coach-insight-period">Últimos 7 días</p>
      <dl className="coach-insight-metrics">
        <div><dt>Entrenos</dt><dd>{number(card.workoutCount)}</dd></div>
        <div><dt>Días entrenados</dt><dd>{card.workoutDays} de 7</dd></div>
        <div><dt>Pasos promedio</dt><dd>{card.averageSteps === null ? 'Sin registro' : number(card.averageSteps)}</dd></div>
        <div><dt>Días con pasos</dt><dd>{card.stepDays} de 7</dd></div>
      </dl>
      {card.recentActivities.length > 0 && <p className="coach-insight-footnote">Entre los registros: {card.recentActivities.join(' · ')}</p>}
      {card.workoutCount === 0 && card.stepDays === 0 && <p className="coach-insight-footnote">Sin actividad registrada en esta ventana.</p>}
    </section>
  );
}
