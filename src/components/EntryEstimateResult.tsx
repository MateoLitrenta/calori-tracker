import { formatCalories } from '../utils/helpers';

interface Props {
  estimate: { calories: number; assumptions: string[]; context: string };
  calories: number | '';
  adjusted: boolean;
  outdated: boolean;
  reclassifiedFrom?: string;
}

/** Provider text is secondary, original and rendered as plain text. */
export default function EntryEstimateResult({ estimate, calories, adjusted, outdated, reclassifiedFrom }: Props) {
  const valid = typeof calories === 'number' && Number.isInteger(calories) && calories > 0;
  return <section className="entry-estimate-result" aria-label="Estimación con IA">
    <div role="status" aria-live="polite">
      <h5 className="entry-estimate-heading">{adjusted ? 'Valor ajustado' : outdated ? 'Datos modificados' : reclassifiedFrom ? 'Categoría actualizada' : 'Estimación con IA'}</h5>
      <p className="entry-estimate-value">{valid
        ? `Se guardarán ${formatCalories(calories)} kcal`
        : 'Ingresá un valor válido en Calorías.'}
      </p>
      <p className="entry-estimate-context">{estimate.context}</p>
      <p className="entry-estimate-note">{adjusted
        ? `Ajustado por vos. Estimación original: ${formatCalories(estimate.calories)} kcal.`
        : outdated ? `Estimación original: ${formatCalories(estimate.calories)} kcal. Los datos cambiaron. Revisá las calorías antes de guardar.`
          : reclassifiedFrom ? `Se conservan las calorías de la estimación original (${reclassifiedFrom}).`
            : 'Estimación basada en los datos proporcionados.'}</p>
    </div>
    {estimate.assumptions.length > 0 && <details className="entry-estimate-details">
      <summary>¿Cómo se calculó?</summary>
      <p className="entry-estimate-note">Suposiciones del servicio (texto original; puede estar en otro idioma).</p>
      <ul>{estimate.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul>
    </details>}
  </section>;
}
