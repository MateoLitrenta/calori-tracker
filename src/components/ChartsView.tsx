import './PeriodSelector.css';
import './FitnessCharts.css';
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChartBar, Footprints, Barbell, CalendarBlank, CaretLeft, CaretRight, X } from '@phosphor-icons/react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppStore } from '../hooks/useAppStore';
import { buildChartStats } from '../utils/chartStats';
import type { ChartPeriod } from '../utils/chartStats';
import { formatDateStr, getBalanceCategory, getBalanceLabel } from '../utils/helpers';

const number = (value: number) => value.toLocaleString('es-AR');
const signed = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`;
const days = (value: number) => `${value} ${value === 1 ? 'día' : 'días'}`;
const kcal = (value: number | null, balance = false, average = false) => value === null ? 'Sin datos' : `${balance ? signed(value) : number(value)} ${average ? 'kcal/día' : 'kcal'}`;
const dateLabel = (date: string, pattern = 'd MMM yyyy') => format(parseISO(date), pattern, { locale: es });
const dateRange = (start: string, end: string) => `${dateLabel(start)} – ${dateLabel(end)}`;
const monthGroup = (start: string, end: string) => start === end
  ? dateLabel(start, 'd MMM') : `${dateLabel(start, 'd')}–${dateLabel(end, 'd MMM')}`;
const balanceTone = (value: number | null) => {
  const category = getBalanceCategory(value);
  return category.startsWith('deficit') ? 'charts-deficit' : category.startsWith('surplus') ? 'charts-surplus' : 'charts-neutral';
};

export default function ChartsView() {
  const { activeProfile } = useAppStore();
  const [period, setPeriod] = useState<ChartPeriod>('Semana');
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [plotOverflows, setPlotOverflows] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const annualWindow = useRef<{ plot: HTMLDivElement; scope: string; width: number; overflow: boolean; left: number | null } | null>(null);
  const today = formatDateStr(new Date());
  const data = useMemo(() => activeProfile ? buildChartStats(activeProfile, period, today) : null,
    [activeProfile, period, today]);
  const annualScope = period === 'Año' && data ? `${activeProfile?.user_id}/${activeProfile?.id}/${data.start}` : null;
  const hasPlot = !!data?.summary.energyDays;
  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot || !hasPlot) {
      annualWindow.current = null;
      return;
    }
    if (!annualScope) annualWindow.current = null;
    else if (annualWindow.current?.plot !== plot || annualWindow.current.scope !== annualScope) {
      annualWindow.current = { plot, scope: annualScope, width: 0, overflow: false, left: null };
    }

    const update = () => {
      const width = plot.clientWidth;
      const overflow = plot.scrollWidth > width + 1;
      const annual = annualWindow.current;
      if (annual && overflow && !annual.overflow) {
        const first = plot.querySelector<HTMLElement>('[data-has-energy="true"]');
        plot.scrollLeft = annual.left ?? (first
          ? plot.scrollLeft + first.getBoundingClientRect().left - plot.getBoundingClientRect().left
          : 0);
        annual.left = plot.scrollLeft;
      }
      if (annual) {
        annual.width = width;
        annual.overflow = overflow;
      }
      setPlotOverflows(overflow);
    };
    const rememberScroll = () => {
      const annual = annualWindow.current;
      // Resizing to a fully visible chart clamps scroll to zero.
      if (annual?.overflow && annual.width === plot.clientWidth) annual.left = plot.scrollLeft;
    };
    plot.addEventListener('scroll', rememberScroll);
    const observer = new ResizeObserver(update);
    observer.observe(plot);
    if (plot.firstElementChild) observer.observe(plot.firstElementChild);
    return () => {
      observer.disconnect();
      plot.removeEventListener('scroll', rememberScroll);
    };
  }, [annualScope, hasPlot, period]);
  if (!data) return null;

  const { summary, buckets, comparison } = data;
  const detail = buckets.find(bucket => bucket.start === selectedBucket);
  const peak = Math.max(1, ...buckets.flatMap(bucket => [bucket.summary.consumed ?? 0, bucket.summary.expenditure ?? 0]));
  const maxCalories = Math.ceil(peak / 500) * 500;
  const averages = period !== 'Semana';
  const mealDays = `${days(summary.mealDays)} con comidas`;
  const energyDays = `${days(summary.energyDays)} con datos`;
  const periodIntro = period === 'Semana' ? 'Esta semana' : period === 'Mes' ? 'Este mes' : 'Este año';
  const insight = summary.balance === null
    ? 'Todavía no hay comidas registradas para calcular el balance de este período.'
    : `${periodIntro} tu balance promedio fue de ${signed(summary.balance)} kcal/día · ${getBalanceLabel(summary.balance)}.`;
  const range = `${format(parseISO(data.start), 'd MMM', { locale: es })} – ${format(parseISO(data.end), 'd MMM yyyy', { locale: es })}`;
  const summaryNote = summary.mealDays === 0
    ? summary.energyDays === 0
      ? 'Las medias aparecerán cuando registres comidas, pasos o ejercicio.'
      : `Hay ${days(summary.energyDays)} con gasto estimado y ninguno con comidas. Falta ingesta para calcular el balance.`
    : summary.energyDays > summary.mealDays
      ? 'El balance usa sólo días con comidas. El gasto también incluye días de actividad sin comidas; por eso la resta de estas dos medias puede diferir del balance.'
      : `El balance promedia los saldos diarios. Las tres medias usan los mismos ${mealDays}; tener registros no implica que estén completos.`;
  const recordedMonths = buckets.filter(bucket => bucket.summary.energyDays > 0).map(bucket => bucket.label.toLowerCase());

  return (
    <div className="charts-view charts-insights">
      <header className="charts-header">
        <div className="charts-heading">
          <h1>Datos</h1>
          <p className="charts-range"><CalendarBlank size={16} aria-hidden="true" />{range}</p>
        </div>
        <div className="charts-period period-selector" role="group" aria-label="Período"
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

      <section className="charts-panel charts-summary" aria-label={`Resumen de ${period.toLowerCase()}`}>
        <div key={`summary-${period}`} className="charts-kpis">
          <h3>Resumen del período</h3>
          <div className="charts-summary-body">
            <div className="charts-summary-balance">
              <h4>Balance promedio</h4>
              <p className={`charts-balance-value ${balanceTone(summary.balance)}`}>{summary.balance === null ? 'Sin datos' : signed(summary.balance)}</p>
              {summary.balance === null ? (
                <p className="charts-secondary">Registrá comidas para calcular tu balance.</p>
              ) : (
                <>
                  <span className="charts-unit">kcal/día<span className="charts-average-base"> · {mealDays}</span></span>
                  <p className={`charts-balance-label ${balanceTone(summary.balance)}`}>{getBalanceLabel(summary.balance)}</p>
                </>
              )}
            </div>
            <div className="charts-summary-secondary">
              <dl className="charts-summary-metrics">
                <div><dt>Consumidas</dt><dd>{summary.consumed === null ? 'Sin datos' : number(summary.consumed)}
                  <span className="charts-unit">{summary.consumed === null ? 'Sin comidas registradas' : <>kcal/día<span className="charts-average-base"> · {mealDays}</span></>}</span></dd></div>
                <div><dt>Gasto estimado</dt><dd>{summary.expenditure === null ? 'Sin datos' : number(summary.expenditure)}
                  <span className="charts-unit">{summary.expenditure === null ? 'Sin registros energéticos' : <>kcal/día<span className="charts-average-base"> · {energyDays} energéticos</span></>}</span></dd></div>
              </dl>
            </div>
          </div>
        </div>
        <p className="charts-summary-note">{summaryNote}</p>
        <details className="charts-method">
          <summary>Cómo se calculan</summary>
          <p className="charts-coverage">{energyDays} · {mealDays}</p>
          <p className="charts-insight">{insight}</p>
          <p>Balance y consumidas usan días con comidas. Gasto usa días con cualquier registro energético (comidas, pasos o ejercicio). Incluye TMB, pasos y ejercicio registrado. Se excluyen días sin datos y fechas futuras.</p>
          <p>El redondeo de cada media también puede producir pequeñas diferencias al restarlas, incluso si usan los mismos días.</p>
        </details>
      </section>

      <section className="charts-panel charts-energy" aria-labelledby="charts-energy-heading"
        onKeyDown={event => {
          if (event.key === 'Escape' && detail) {
            event.stopPropagation();
            setSelectedBucket(null);
          }
        }}>
        <h3 id="charts-energy-heading">Consumidas vs gasto</h3>
        {summary.energyDays > 0 && <p className="charts-secondary" id="charts-energy-reading">{period === 'Mes' ? 'Promedios diarios en grupos del mes.' : period === 'Año' ? 'Promedios diarios por mes.' : 'Valores diarios.'} <span className="charts-plot-unit">{averages ? 'kcal/día' : 'kcal'} · Elegí una barra para ver el detalle.</span></p>}
        {period === 'Año' && summary.energyDays > 0 && <p className="charts-activity-months">Con datos de energía · {recordedMonths.join(', ')}</p>}
        {summary.energyDays === 0 ? (
          <div className="charts-empty" role="status">
            <ChartBar size={32} aria-hidden="true" />
            <p>Todavía no hay comidas, pasos ni ejercicio registrados en este período.</p>
            <span>Registrá comidas y actividad para ver tu evolución.</span>
          </div>
        ) : (
          <>
            <div className="charts-plot" data-period={period}>
              <div className="charts-scale" aria-hidden="true">
                <span>{number(maxCalories)}</span><span>{number(maxCalories / 2)}</span><span>0</span>
              </div>
              <div key={`plot-${period}`} ref={plotRef} className="charts-plot-scroll">
                <div className={`charts-bars ${period === 'Año' ? 'charts-bars-year' : ''}`} role="list" aria-label={`Evolución de ${period.toLowerCase()}`} aria-describedby="charts-energy-reading">
                  {buckets.map(bucket => {
                    const item = bucket.summary;
                    const title = period === 'Mes' ? dateRange(bucket.start, bucket.end) : bucket.title;
                    const accessible = `${title}. ${averages ? 'Consumidas promedio' : 'Consumidas'}: ${item.consumed === null ? 'Sin comidas registradas' : kcal(item.consumed, false, averages)}. ${averages ? 'Gasto promedio' : 'Gasto estimado'}: ${kcal(item.expenditure, false, averages)}. ${averages ? 'Balance promedio' : 'Balance'}: ${kcal(item.balance, true, averages)}. ${getBalanceLabel(item.balance)}.`;
                    return (
                      <div key={bucket.start} role="listitem">
                        <button type="button" className="charts-bucket" aria-label={accessible}
                          data-has-energy={item.energyDays > 0}
                          aria-pressed={detail?.start === bucket.start}
                          aria-describedby={detail?.start === bucket.start ? 'charts-bucket-detail' : undefined}
                          onMouseEnter={() => setSelectedBucket(bucket.start)}
                          onFocus={() => setSelectedBucket(bucket.start)}
                          onClick={() => setSelectedBucket(bucket.start)}>
                          <span className="charts-bar-pair" aria-hidden="true">
                            {item.energyDays === 0 && <span className="charts-bar-empty">—</span>}
                            <span className="charts-bar-track">
                              {item.consumed !== null && <span className="charts-bar charts-bar-consumed" data-zero={item.consumed === 0} style={{ height: `${item.consumed / maxCalories * 100}%` }}>{item.consumed === 0 && <span>0</span>}</span>}
                            </span>
                            <span className="charts-bar-track">
                              {item.expenditure !== null && <span className="charts-bar charts-bar-expenditure" data-zero={item.expenditure === 0} style={{ height: `${item.expenditure / maxCalories * 100}%` }}>{item.expenditure === 0 && <span>0</span>}</span>}
                            </span>
                          </span>
                          <span className="charts-bucket-label" aria-hidden="true">{period === 'Mes' ? monthGroup(bucket.start, bucket.end) : bucket.label}</span>
                          <span className={`charts-bucket-balance ${balanceTone(item.balance)}`} aria-hidden="true">{item.balance === null ? '—' : signed(item.balance)}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {period === 'Año' && <div className="charts-year-navigation" data-overflow={plotOverflows}>
              <p className="charts-scroll-hint">12 meses · Deslizá o usá las flechas.</p>
              <div>
                <button type="button" aria-label="Ver meses anteriores" onClick={() => {
                  const plot = plotRef.current;
                  if (plot) plot.scrollBy({ left: -plot.clientWidth * .8 });
                }}><CaretLeft size={18} aria-hidden="true" /></button>
                <button type="button" aria-label="Ver meses siguientes" onClick={() => {
                  const plot = plotRef.current;
                  if (plot) plot.scrollBy({ left: plot.clientWidth * .8 });
                }}><CaretRight size={18} aria-hidden="true" /></button>
              </div>
            </div>}
            {period !== 'Año' && <p className="charts-scroll-hint" data-overflow={plotOverflows}>
              {period === 'Semana' ? 'Deslizá para ver todos los días.' : 'Deslizá para ver todos los grupos del mes.'}
            </p>}
            <div className="charts-legend" aria-label="Leyenda">
              <span><i className="charts-key-consumed" aria-hidden="true" />Consumidas</span>
              <span><i className="charts-key-expenditure" aria-hidden="true" />Gasto<span className="charts-desktop-only"> estimado</span></span>
              <span className="charts-secondary">Balance debajo de cada período · {averages ? 'kcal/día' : 'kcal'}</span>
            </div>
            <div className="charts-detail" id="charts-bucket-detail" role="group" aria-label="Detalle del gráfico"
              data-selected={Boolean(detail)}>
              <div className="charts-detail-header">
                <h4>{detail ? period === 'Mes' ? dateRange(detail.start, detail.end) : detail.title : 'Detalle'}</h4>
                <button type="button" className="charts-detail-clear" disabled={!detail}
                  aria-label="Quitar selección del gráfico" title="Quitar selección" onClick={() => setSelectedBucket(null)}>
                  <X size={16} aria-hidden="true" /><span>Quitar selección</span>
                </button>
              </div>
              <dl>
                <div><dt>{averages ? 'Consumidas promedio' : 'Consumidas'}</dt><dd title={detail?.summary.consumed === null ? 'Sin comidas registradas' : undefined}>{!detail ? '—' : detail.summary.consumed === null ? 'Sin comidas' : kcal(detail.summary.consumed, false, averages)}</dd></div>
                <div><dt>{averages ? 'Gasto promedio' : 'Gasto estimado'}</dt><dd>{detail ? kcal(detail.summary.expenditure, false, averages) : '—'}</dd></div>
                <div><dt>{averages ? 'Balance promedio' : 'Balance'}</dt><dd className={balanceTone(detail?.summary.balance ?? null)}>{detail ? kcal(detail.summary.balance, true, averages) : '—'}</dd></div>
              </dl>
              <p className="charts-secondary charts-detail-caption">
                <span className={`charts-detail-category ${balanceTone(detail?.summary.balance ?? null)}`}>{detail ? getBalanceLabel(detail.summary.balance) : 'Sin selección'}</span>
                <span className="charts-detail-guidance">{!detail
                ? <><span className="charts-desktop-only">Elegí una barra para ver sus valores exactos.</span><span className="charts-mobile-only">Tocá un período para ver el detalle.</span></>
                : averages
                  ? <span>{days(detail.summary.mealDays)} con comidas · {days(detail.summary.energyDays)} con datos energéticos</span>
                  : <span className="charts-desktop-only">Valores registrados del día seleccionado.</span>}</span>
              </p>
            </div>
          </>
        )}
      </section>

      <section key={`activity-${period}`} className="charts-panel charts-activity-panel" aria-labelledby="charts-activity-heading">
        <h3 id="charts-activity-heading">Actividad</h3>
        <div className="charts-activity">
          <div><Footprints size={20} aria-hidden="true" /><h4>Pasos<span className="charts-desktop-only"> promedio</span></h4>
            <p className="charts-activity-value">{summary.steps === null ? 'Sin datos' : number(summary.steps)}</p>
            <p className="charts-secondary">{summary.steps === null ? 'Sin pasos registrados' : `pasos/día · ${days(summary.stepDays)} con pasos`}</p>
          </div>
          <div><Barbell size={20} aria-hidden="true" /><h4>Ejercicio</h4>
            <p className="charts-activity-value">{kcal(summary.workoutCalories)}</p>
            <p className="charts-secondary"><span className="charts-desktop-only">kcal registradas en entrenamientos</span><span className="charts-mobile-only">Registradas</span></p>
          </div>
          <div><CalendarBlank size={20} aria-hidden="true" /><h4><span className="charts-desktop-only">Entrenamientos registrados</span><span className="charts-mobile-only">Entrenos</span></h4>
            <p className="charts-activity-value">{number(summary.workoutCount)}</p>
            <p className="charts-secondary">En este período</p>
          </div>
        </div>
        <p className="charts-streak">Racha de comidas · {days(data.currentStreak)}</p>
      </section>

      {comparison && (
        <section key={`comparison-${period}`} className="charts-panel charts-comparison" aria-labelledby="charts-comparison-heading">
          <h3 id="charts-comparison-heading">Comparado con el período anterior</h3>
          <div className="charts-comparison-periods">
            <div><h4>Actual · {dateRange(data.start, data.end < today ? data.end : today)}</h4>
              <p>{mealDays} · {days(summary.energyDays)} con gasto estimado</p></div>
            <div><h4>Anterior · {dateRange(data.previousStart, data.previousEnd)}</h4>
              <p>{days(data.previousSummary.mealDays)} con comidas · {days(data.previousSummary.energyDays)} con gasto estimado</p></div>
          </div>
          <dl>
            <div><dt>Consumidas</dt><dd>{signed(comparison.consumed)} <span>kcal/día</span></dd></div>
            <div><dt>Gasto estimado</dt><dd>{signed(comparison.expenditure)} <span>kcal/día</span></dd></div>
            <div><dt>Balance</dt><dd>{signed(comparison.balance)} <span>kcal/día</span></dd></div>
          </dl>
          <p className="charts-secondary">Actual menos anterior. {data.end > today ? 'El período actual está en curso; el anterior abarca el calendario completo. ' : ''}Cada media usa sus días registrados. Las diferencias describen los registros disponibles.</p>
        </section>
      )}
    </div>
  );
}
