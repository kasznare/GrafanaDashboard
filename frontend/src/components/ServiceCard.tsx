import { ServiceSnapshot } from '../types';

type ServiceCardProps = {
  service: ServiceSnapshot;
};

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <article className="service-card">
      <header className="service-card__header">
        <div>
          <p className="eyebrow">{service.tier}</p>
          <h3>{service.name}</h3>
        </div>
        <span className={`status-pill status-pill--${service.status}`}>{service.status}</span>
      </header>

      <dl className="service-card__stats">
        <div>
          <dt>Region</dt>
          <dd>{service.region}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{service.owner}</dd>
        </div>
        <div>
          <dt>P95 latency</dt>
          <dd>{service.latencyP95} ms</dd>
        </div>
        <div>
          <dt>Errors</dt>
          <dd>{service.errorRate}%</dd>
        </div>
        <div>
          <dt>Queue depth</dt>
          <dd>{service.queueDepth}</dd>
        </div>
        <div>
          <dt>Saturation</dt>
          <dd>{service.saturation}%</dd>
        </div>
      </dl>

      <div className="service-card__footer">
        <span>{service.requestRate} req/s</span>
        <span>{service.errorBudgetRemaining}% budget left</span>
      </div>
    </article>
  );
}
