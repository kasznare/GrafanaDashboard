import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { GrafanaPanel } from './components/GrafanaPanel';
import { MetricCard } from './components/MetricCard';
import { ServiceCard } from './components/ServiceCard';
import { OverviewResponse, TrendsResponse } from './types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';
const grafanaBaseUrl = import.meta.env.VITE_GRAFANA_URL ?? 'http://localhost:3001';
const prometheusBaseUrl = import.meta.env.VITE_PROMETHEUS_URL ?? 'http://localhost:9090';

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatRelativeTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

export default function App() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [trends, setTrends] = useState<TrendsResponse['points']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      try {
        const [overviewResponse, trendsResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/overview`),
          fetch(`${apiBaseUrl}/trends`)
        ]);

        if (!overviewResponse.ok || !trendsResponse.ok) {
          throw new Error('Dashboard data could not be loaded.');
        }

        const overviewPayload = (await overviewResponse.json()) as OverviewResponse;
        const trendsPayload = (await trendsResponse.json()) as TrendsResponse;

        if (!active) {
          return;
        }

        setOverview(overviewPayload);
        setTrends(trendsPayload.points);
        setError(null);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unknown error');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadDashboard();
    const intervalId = window.setInterval(loadDashboard, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const fullDashboardUrl = `${grafanaBaseUrl}/d/mock-monitoring/mock-monitoring-overview?orgId=1&from=now-30m&to=now`;
  const grafanaPanels = [
    {
      id: 1,
      title: 'Request Rate',
      description: 'Prometheus-backed ingress volume across the simulated services.'
    },
    {
      id: 2,
      title: 'P95 Latency',
      description: 'Tail latency line for each workload streamed from the backend gauges.'
    },
    {
      id: 3,
      title: 'Queue Depth',
      description: 'Current pressure levels to surface services moving toward backlog.'
    },
    {
      id: 4,
      title: 'Error Budget',
      description: 'Remaining budget so you can spot burn-down before it becomes an incident.'
    }
  ];

  if (loading && !overview) {
    return (
      <main className="app-shell">
        <section className="hero-card hero-card--loading">
          <p className="eyebrow">Bootstrapping</p>
          <h1>Waiting for the monitoring stack</h1>
          <p>The UI will populate once the mock API, Prometheus, and Grafana are reachable.</p>
        </section>
      </main>
    );
  }

  if (!overview) {
    return (
      <main className="app-shell">
        <section className="hero-card hero-card--loading">
          <p className="eyebrow">Dashboard unavailable</p>
          <h1>Signal Deck could not fetch the mock backend.</h1>
          <p>{error ?? 'Start the backend or run docker compose up --build.'}</p>
        </section>
      </main>
    );
  }

  const hottestService = [...overview.services].sort((left, right) => right.saturation - left.saturation)[0];
  const chartData = trends.map((point) => ({
    ...point,
    label: formatTime(point.timestamp)
  }));

  const metricCards = [
    {
      label: 'Service Coverage',
      value: `${overview.summary.healthyServices}/${overview.summary.totalServices}`,
      hint: `${overview.summary.degradedServices} degraded, ${overview.summary.criticalServices} critical`,
      tone:
        overview.summary.criticalServices > 0
          ? 'critical'
          : overview.summary.degradedServices > 0
            ? 'warning'
            : 'good'
    },
    {
      label: 'Traffic',
      value: `${overview.summary.totalRequestRate} req/s`,
      hint: 'Synthetic load emitted by the mock backend',
      tone: 'neutral'
    },
    {
      label: 'Tail Latency',
      value: `${overview.summary.latencyP95} ms`,
      hint: 'Weighted p95 across all services',
      tone: overview.summary.latencyP95 > 320 ? 'warning' : 'good'
    },
    {
      label: 'Error Budget',
      value: `${overview.summary.errorBudgetRemaining}%`,
      hint: `${overview.summary.activeAlerts} active alert(s)`,
      tone: overview.summary.errorBudgetRemaining < 92 ? 'critical' : 'neutral'
    }
  ] as const;

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-card__content">
          <div>
            <p className="eyebrow">Monitoring Console</p>
            <h1>Signal Deck for Grafana and Prometheus</h1>
            <p className="hero-copy">
              A dockerized mock monitoring stack with a custom React surface on top of Prometheus metrics and
              provisioned Grafana dashboards.
            </p>
          </div>
          <div className="hero-card__actions">
            <a href={fullDashboardUrl} target="_blank" rel="noreferrer">
              Open Grafana
            </a>
            <a href={prometheusBaseUrl} target="_blank" rel="noreferrer">
              Open Prometheus
            </a>
          </div>
        </div>

        <div className="hero-card__meta">
          <div>
            <span className="meta-label">Hotspot</span>
            <strong>{hottestService.name}</strong>
            <span>{hottestService.saturation}% saturation</span>
          </div>
          <div>
            <span className="meta-label">Last refresh</span>
            <strong>{formatRelativeTime(overview.asOf)}</strong>
            <span>{error ? `Warning: ${error}` : 'Live refresh every 10 seconds'}</span>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        {metricCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} hint={card.hint} tone={card.tone} />
        ))}
      </section>

      <section className="content-grid">
        <article className="chart-card">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Traffic Shape</p>
              <h2>Load and alert trend</h2>
            </div>
            <p>Backend-generated synthetic samples keep the dashboard moving even before any real traffic exists.</p>
          </header>
          <div className="chart-card__body">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff7a18" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#ff7a18" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#9fb5c8', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#9fb5c8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: '#0f1b28',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '16px'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="requestRate"
                  stroke="#ff9d42"
                  strokeWidth={2}
                  fill="url(#trafficGradient)"
                  name="Request rate"
                />
                <Line
                  type="monotone"
                  dataKey="activeAlerts"
                  stroke="#8ef7b2"
                  strokeWidth={2}
                  dot={false}
                  name="Active alerts"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="chart-card">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Reliability</p>
              <h2>Latency and errors</h2>
            </div>
            <p>These numbers mirror the same simulated workload that Prometheus scrapes from the backend.</p>
          </header>
          <div className="chart-card__body">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#9fb5c8', fontSize: 12 }} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: '#9fb5c8', fontSize: 12 }} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#9fb5c8', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0f1b28',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '16px'
                  }}
                />
                <Line yAxisId="left" type="monotone" dataKey="latencyP95" stroke="#6ec5ff" strokeWidth={3} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="errorRate" stroke="#ff6474" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="section-block">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Service Map</p>
            <h2>Current workload posture</h2>
          </div>
          <p>The mock backend emits per-service health, latency, queue depth, and error budget metrics.</p>
        </header>
        <div className="service-grid">
          {overview.services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      </section>

      <section className="content-grid">
        <article className="event-card">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Incident Feed</p>
              <h2>Recent state transitions</h2>
            </div>
            <p>When the simulator crosses a threshold, it records an event to mimic an ops timeline.</p>
          </header>
          <ul className="event-list">
            {overview.events.map((event) => (
              <li key={event.id} className={`event-list__item event-list__item--${event.severity}`}>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.description}</p>
                </div>
                <div>
                  <span>{event.service}</span>
                  <span>{formatRelativeTime(event.time)}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="event-card">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Stack Notes</p>
              <h2>What is wired together</h2>
            </div>
            <p>The entire stack is disposable and local, but behaves like a real monitored system.</p>
          </header>
          <ul className="stack-list">
            <li>Express mock API exposes JSON endpoints and `/metrics` for Prometheus scraping.</li>
            <li>Prometheus polls every 5 seconds and stores the synthetic service series.</li>
            <li>Grafana provisions the Prometheus datasource and a dashboard at startup.</li>
            <li>This React UI surfaces both raw mock state and embedded Grafana panels side by side.</li>
          </ul>
        </article>
      </section>

      <section className="section-block">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Embedded Grafana</p>
            <h2>Native Prometheus visualizations inside the UI</h2>
          </div>
          <p>Anonymous viewing is enabled so the dashboard can embed provisioned panels without extra login setup.</p>
        </header>
        <div className="grafana-grid">
          {grafanaPanels.map((panel) => (
            <GrafanaPanel
              key={panel.id}
              title={panel.title}
              description={panel.description}
              src={`${grafanaBaseUrl}/d-solo/mock-monitoring/mock-monitoring-overview?orgId=1&panelId=${panel.id}&from=now-30m&to=now&theme=light`}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
