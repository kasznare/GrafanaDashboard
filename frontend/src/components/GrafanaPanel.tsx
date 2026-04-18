type GrafanaPanelProps = {
  title: string;
  description: string;
  src: string;
};

export function GrafanaPanel({ title, description, src }: GrafanaPanelProps) {
  return (
    <article className="grafana-panel">
      <header className="section-heading section-heading--compact">
        <div>
          <p className="eyebrow">Grafana</p>
          <h3>{title}</h3>
        </div>
        <p>{description}</p>
      </header>
      <iframe title={title} src={src} loading="lazy" referrerPolicy="no-referrer" />
    </article>
  );
}
