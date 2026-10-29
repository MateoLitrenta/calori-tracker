interface Props {
  estimate: { calories: number; assumptions: string[]; context: string };
  adjusted: boolean;
  outdated: boolean;
}

/** Provider text is secondary, original and rendered as plain text. */
export default function EntryEstimateResult({ estimate, adjusted, outdated }: Props) {
  return <section className="entry-estimate-result" aria-label="Estimación con IA">
    <div role="status" aria-live="polite">
      <h5 className="entry-estimate-heading">{adjusted ? 'Valor ajustado' : outdated ? 'Datos modificados' : 'Estimación con IA'}</h5>
      <p className="entry-estimate-value">{estimate.calories.toLocaleString('es-AR')} kcal
        {(adjusted || outdated) && <span> · estimación original</span>}
      </p>
      <p className="entry-estimate-context">{estimate.context}</p>
      <p className="entry-estimate-note">{adjusted
        ? 'Se conserva el valor que escribiste en Calorías.'
        : outdated ? 'La estimación corresponde a los datos anteriores. Revisá las calorías antes de guardar.'
          : 'Estimación basada en los datos proporcionados.'}</p>
    </div>
    {estimate.assumptions.length > 0 && <details className="entry-estimate-details">
      <summary>¿Cómo se calculó?</summary>
      <p className="entry-estimate-note">Suposiciones del servicio (texto original; puede estar en otro idioma).</p>
      <ul>{estimate.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul>
    </details>}
  </section>;
}
