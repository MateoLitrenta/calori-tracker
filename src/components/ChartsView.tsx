import './PremiumViews.css';
import { useMemo, useState, type CSSProperties } from 'react';
import { ChartBar, Footprints, Barbell } from '@phosphor-icons/react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppStore } from '../hooks/useAppStore';
import { buildChartStats } from '../utils/chartStats';
import type { ChartPeriod } from '../utils/chartStats';
import { formatDateStr, getBalanceCategory, getBalanceLabel } from '../utils/helpers';

const number = (value: number) => value.toLocaleString('es-AR');
const signed = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`;
const kcal = (value: number | null, balance = false) => value === null ? 'Sin datos' : `${balance ? signed(value) : number(value)} kcal`;
const balanceTone = (value: number | null) => {
  const category = getBalanceCategory(value);
  return category.startsWith('deficit') ? 'charts-deficit' : category.startsWith('surplus') ? 'charts-surplus' : 'charts-neutral';
};

export default function ChartsView() {
  const { activeProfile } = useAppStore();
  const [period, setPeriod] = useState<ChartPeriod>('Semana');
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const today = formatDateStr(new Date());
  const data = useMemo(() => activeProfile ? buildChartStats(activeProfile, period, today) : null,
    [activeProfile, period, today]);
  if (!data) return null;

  const { summary, buckets, comparison } = data;
  const detail = buckets.find(bucket => bucket.start === selectedBucket);
  const maxCalories = Math.max(1, ...buckets.flatMap(bucket => [bucket.summary.consumed ?? 0, bucket.summary.expenditure ?? 0])) * 1.1;
  const averages = period !== 'Semana';
  const mealDays = `${summary.mealDays} ${summary.mealDays === 1 ? 'día con comidas' : 'días con comidas'}`;
  const energyDays = `${summary.energyDays} ${summary.energyDays === 1 ? 'día con datos' : 'días con datos'}`;
  const range = `${format(parseISO(data.start), 'd MMM', { locale: es })} – ${format(parseISO(data.end), 'd MMM yyyy', { locale: es })}`;

  return (
    <div className="premium-view charts-view charts-insights w-full max-w-4xl mx-auto">
      <header className="charts-header charts-panel">
        <div className="charts-heading">
          <span className="charts-heading-icon"><ChartBar size={24} weight="fill" aria-hidden="true" /></span>
          <div>
            <h2><span className="charts-desktop-only">Tu evolución</span><span className="charts-mobile-only">Datos</span></h2>
            <p><span className="charts-desktop-only">Entendé cómo cambian tu consumo, gasto y actividad.</span><span className="charts-mobile-only">Consumo, gasto y actividad.</span></p>
            <p className="charts-range">{range}</p>
          </div>
        </div>
        <div className="charts-period" role="group" aria-label="Período"
          style={{ '--active-index': (['Semana', 'Mes', 'Año'] as ChartPeriod[]).indexOf(period) } as CSSProperties}>
          <span className="charts-period-indicator" aria-hidden="true" />
          {(['Semana', 'Mes', 'Año'] as ChartPeriod[]).map(value => (
            <button key={value} type="button" aria-pressed={period === value} onClick={() => {
              setPeriod(value);
              setSelectedBucket(null);
            }}>{value}</button>
          ))}
        </div>
      </header>

      <section key={`summary-${period}`} className="charts-kpis" aria-label={`Resumen de ${period.toLowerCase()}`}>
        <div className="charts-kpi">
          <h3>Consumidas<span className="charts-desktop-only"> promedio</span></h3>
          <p className="charts-value">{summary.consumed === null ? 'Sin datos' : number(summary.consumed)}</p>
          <span className="charts-unit">{summary.consumed === null ? 'Sin comidas registradas' : 'kcal/día'}</span>
          <p className="charts-kpi-note">{mealDays}</p>
        </div>
        <div className="charts-kpi">
          <h3>Gasto<span className="charts-desktop-only"> promedio</span></h3>
          <p className="charts-value">{summary.expenditure === null ? 'Sin datos' : number(summary.expenditure)}</p>
          <span className="charts-unit">{summary.expenditure === null ? 'Sin registros energéticos' : <>kcal/día<span className="charts-desktop-only"> estimadas</span></>}</span>
          <p className="charts-kpi-note">{energyDays}</p>
        </div>
        <div className="charts-kpi">
          <h3>Balance<span className="charts-desktop-only"> promedio</span></h3>
          <p className={`charts-value ${balanceTone(summary.balance)}`}>{summary.balance === null ? 'Sin datos' : signed(summary.balance)}</p>
          <span className="charts-unit">{summary.balance === null ? 'Sin comidas registradas' : 'kcal/día · con comidas'}</span>
          <p className={`charts-kpi-note ${balanceTone(summary.balance)}`}>{getBalanceLabel(summary.balance)}</p>
        </div>
        <div className="charts-kpi charts-registered">
          <h3>Días registrados</h3>
          <p className="charts-value">{number(summary.energyDays)}</p>
          <span className="charts-unit"><span className="charts-desktop-only">Con comidas o actividad</span><span className="charts-mobile-only">días con datos</span></span>
          <p className="charts-kpi-note">En este período</p>
        </div>
      </section>

      <section className="charts-panel charts-energy" aria-labelledby="charts-energy-heading">
        <h3 id="charts-energy-heading">Consumidas vs Gasto estimado</h3>
        <p className="charts-secondary">{averages ? `Promedios diarios por ${period === 'Mes' ? 'semana' : 'mes'}.` : 'Valores diarios de esta semana.'}<span className="charts-desktop-only"> Gasto estimado: TMB + pasos + ejercicio registrado.</span></p>
        {summary.energyDays === 0 ? (
          <div className="charts-empty" role="status">
            <ChartBar size={32} aria-hidden="true" />
            <p>No hay suficientes registros para este período.</p>
            <span>Registrá comidas y actividad para ver tu evolución.</span>
          </div>
        ) : (
          <>
            <div key={`plot-${period}`} className="charts-plot-scroll">
              <div className={`charts-bars ${period === 'Año' ? 'charts-bars-year' : ''}`} role="list" aria-label={`Evolución de ${period.toLowerCase()}`}>
                {buckets.map(bucket => {
                  const item = bucket.summary;
                  const accessible = `${bucket.title}. ${averages ? 'Consumidas promedio' : 'Consumidas'}: ${item.consumed === null ? 'Sin comidas registradas' : kcal(item.consumed)}. ${averages ? 'Gasto promedio' : 'Gasto estimado'}: ${kcal(item.expenditure)}. ${averages ? 'Balance promedio' : 'Balance'}: ${kcal(item.balance, true)}. ${getBalanceLabel(item.balance)}.`;
                  return (
                    <div key={bucket.start} role="listitem">
                      <button type="button" className="charts-bucket" aria-label={accessible}
                        aria-pressed={detail?.start === bucket.start}
                        aria-describedby={detail?.start === bucket.start ? 'charts-bucket-detail' : undefined}
                        onMouseEnter={() => setSelectedBucket(bucket.start)}
                        onFocus={() => setSelectedBucket(bucket.start)}
                        onClick={() => setSelectedBucket(bucket.start)}>
                        <span className="charts-bar-pair" aria-hidden="true">
                          {item.energyDays === 0 && <span className="charts-bar-empty">—</span>}
                          <span className="charts-bar-track">
                            {item.consumed !== null && <span className="charts-bar charts-bar-consumed" style={{ height: `${item.consumed / maxCalories * 100}%` }} />}
                          </span>
                          <span className="charts-bar-track">
                            {item.expenditure !== null && <span className="charts-bar charts-bar-expenditure" style={{ height: `${item.expenditure / maxCalories * 100}%` }} />}
                          </span>
                        </span>
                        <span className="charts-bucket-label" aria-hidden="true">{bucket.label}</span>
                        <span className={`charts-bucket-balance ${balanceTone(item.balance)}`} aria-hidden="true">{item.balance === null ? '—' : signed(item.balance)}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            {period === 'Año' && <p className="charts-scroll-hint">Deslizá para ver todos los meses.</p>}
            <div className="charts-legend" aria-label="Leyenda">
              <span><i className="charts-key-consumed" aria-hidden="true" />Consumidas</span>
              <span><i className="charts-key-expenditure" aria-hidden="true" />Gasto estimado</span>
              <span className="charts-secondary">Balance debajo de cada período · kcal</span>
            </div>
            {detail ? (
              <div key={detail.start} className="charts-detail" id="charts-bucket-detail" role="tooltip">
                <h4>{detail.title}</h4>
                <dl>
                  <div><dt>{averages ? 'Consumidas promedio' : 'Consumidas'}</dt><dd>{detail.summary.consumed === null ? 'Sin comidas registradas' : kcal(detail.summary.consumed)}</dd></div>
                  <div><dt>{averages ? 'Gasto promedio' : 'Gasto estimado'}</dt><dd>{kcal(detail.summary.expenditure)}</dd></div>
                  <div><dt>{averages ? 'Balance promedio' : 'Balance'}</dt><dd className={balanceTone(detail.summary.balance)}>{kcal(detail.summary.balance, true)}<span>{getBalanceLabel(detail.summary.balance)}</span></dd></div>
                </dl>
                {averages && <p className="charts-secondary charts-desktop-only">{detail.summary.mealDays} días con comidas · {detail.summary.energyDays} días con datos energéticos</p>}
              </div>
            ) : <p className="charts-detail-hint charts-secondary"><span className="charts-desktop-only">Tocá, enfocá o pasá sobre un período para ver consumidas, gasto y balance exactos.</span><span className="charts-mobile-only">Tocá un período para ver el detalle.</span></p>}
          </>
        )}
        <p className="charts-method charts-desktop-only">Consumidas y balance: días con comidas registradas. Gasto: días con comidas, pasos o ejercicio. Los días sin datos y las fechas futuras no se incluyen.</p>
        <details className="charts-method charts-mobile-only">
          <summary>Cómo se calculan los promedios</summary>
          <p>Gasto: TMB + pasos + ejercicio registrado. Consumidas y balance usan días con comidas; gasto usa días con comidas, pasos o ejercicio. Se excluyen días sin datos y fechas futuras.</p>
        </details>
      </section>

      <section key={`activity-${period}`} className="charts-panel charts-activity-panel" aria-labelledby="charts-activity-heading">
        <h3 id="charts-activity-heading">Actividad</h3>
        <div className="charts-activity">
          <div><Footprints size={20} aria-hidden="true" /><h4>Pasos<span className="charts-desktop-only"> promedio</span></h4>
            <p className="charts-activity-value">{summary.steps === null ? 'Sin datos' : number(summary.steps)}</p>
            <p className="charts-secondary">{summary.steps === null ? 'Sin pasos registrados' : <><span className="charts-mobile-only">pasos/día</span><span className="charts-desktop-only">{`pasos/día · ${summary.stepDays} ${summary.stepDays === 1 ? 'día' : 'días'} con pasos`}</span></>}</p>
          </div>
          <div><Barbell size={20} aria-hidden="true" /><h4>Ejercicio</h4>
            <p className="charts-activity-value">{kcal(summary.workoutCalories)}</p>
            <p className="charts-secondary"><span className="charts-desktop-only">kcal registradas en entrenamientos</span><span className="charts-mobile-only">Registradas</span></p>
          </div>
          <div><h4><span className="charts-desktop-only">Entrenamientos registrados</span><span className="charts-mobile-only">Entrenos</span></h4>
            <p className="charts-activity-value">{number(summary.workoutCount)}</p>
            <p className="charts-secondary">En este período</p>
          </div>
        </div>
      </section>

      {comparison && (
        <section key={`comparison-${period}`} className="charts-panel charts-comparison" aria-labelledby="charts-comparison-heading">
          <h3 id="charts-comparison-heading"><span className="charts-desktop-only">Comparado con el período anterior</span><span className="charts-mobile-only">vs período anterior</span></h3>
          <dl>
            <div><dt>Consumidas</dt><dd>{signed(comparison.consumed)} <span>kcal/día</span></dd></div>
            <div><dt>Gasto estimado</dt><dd>{signed(comparison.expenditure)} <span>kcal/día</span></dd></div>
            <div><dt>Balance</dt><dd>{signed(comparison.balance)} <span>kcal/día</span></dd></div>
          </dl>
          <p className="charts-secondary charts-desktop-only">Diferencias entre promedios de {period === 'Semana' ? 'esta semana y la anterior' : period === 'Mes' ? 'este mes y el anterior' : 'este año y el anterior'}, según los días registrados.</p>
        </section>
      )}
      <p className="charts-streak">Racha de comidas en este período: {data.currentStreak} {data.currentStreak === 1 ? 'día' : 'días'}</p>
    </div>
  );
}
