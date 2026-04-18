type MetricCardProps = {
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'good' | 'warning' | 'critical';
};

export function MetricCard({ label, value, hint, tone = 'neutral' }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
      <span className="metric-card__hint">{hint}</span>
    </article>
  );
}
