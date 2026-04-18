import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import client from 'prom-client';

type Severity = 'info' | 'warning' | 'critical';
type Health = 'healthy' | 'degraded' | 'critical';

type ServiceDefinition = {
  id: string;
  name: string;
  region: string;
  tier: string;
  owner: string;
  baseLatency: number;
  baseTraffic: number;
};

type ServiceSnapshot = ServiceDefinition & {
  status: Health;
  latencyP95: number;
  requestRate: number;
  errorRate: number;
  queueDepth: number;
  errorBudgetRemaining: number;
  saturation: number;
};

type EventItem = {
  id: string;
  time: string;
  severity: Severity;
  title: string;
  service: string;
  region: string;
  description: string;
};

type TrendPoint = {
  timestamp: string;
  requestRate: number;
  latencyP95: number;
  errorRate: number;
  activeAlerts: number;
};

const app = express();
const port = Number(process.env.PORT ?? 4000);
const registry = new client.Registry();

client.collectDefaultMetrics({
  prefix: 'mock_runtime_',
  register: registry
});

const requestCounter = new client.Counter({
  name: 'mock_api_http_requests_total',
  help: 'HTTP requests handled by the mock API.',
  labelNames: ['route', 'method', 'status_code'],
  registers: [registry]
});

const requestDuration = new client.Histogram({
  name: 'mock_api_http_request_duration_seconds',
  help: 'HTTP request latency for the mock API.',
  labelNames: ['route', 'method', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2],
  registers: [registry]
});

const syntheticRequests = new client.Counter({
  name: 'mock_service_requests_total',
  help: 'Synthetic service request traffic emitted by the simulator.',
  labelNames: ['service', 'status_code'],
  registers: [registry]
});

const syntheticDuration = new client.Histogram({
  name: 'mock_service_request_duration_seconds',
  help: 'Synthetic service latency samples emitted by the simulator.',
  labelNames: ['service'],
  buckets: [0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.5, 3],
  registers: [registry]
});

const serviceHealthGauge = new client.Gauge({
  name: 'mock_service_health_score',
  help: 'Synthetic service health score. 1 is healthy, 0.6 degraded, 0.2 critical.',
  labelNames: ['service', 'region'],
  registers: [registry]
});

const queueDepthGauge = new client.Gauge({
  name: 'mock_service_queue_depth',
  help: 'Synthetic queue depth per service.',
  labelNames: ['service', 'region'],
  registers: [registry]
});

const errorBudgetGauge = new client.Gauge({
  name: 'mock_service_error_budget_remaining',
  help: 'Synthetic error budget remaining percentage per service.',
  labelNames: ['service', 'region'],
  registers: [registry]
});

const latencyGauge = new client.Gauge({
  name: 'mock_service_latency_p95_ms',
  help: 'Synthetic p95 latency in milliseconds per service.',
  labelNames: ['service', 'region'],
  registers: [registry]
});

const saturationGauge = new client.Gauge({
  name: 'mock_service_saturation',
  help: 'Synthetic saturation percentage per service.',
  labelNames: ['service', 'region'],
  registers: [registry]
});

const alertGauge = new client.Gauge({
  name: 'mock_active_alerts',
  help: 'Synthetic count of currently active alerts.',
  registers: [registry]
});

const services: ServiceDefinition[] = [
  {
    id: 'gateway',
    name: 'Edge Gateway',
    region: 'eu-central',
    tier: 'Edge',
    owner: 'Platform',
    baseLatency: 120,
    baseTraffic: 430
  },
  {
    id: 'checkout',
    name: 'Checkout API',
    region: 'eu-central',
    tier: 'Core',
    owner: 'Payments',
    baseLatency: 180,
    baseTraffic: 280
  },
  {
    id: 'inventory',
    name: 'Inventory Sync',
    region: 'us-east',
    tier: 'Data',
    owner: 'Supply',
    baseLatency: 240,
    baseTraffic: 190
  },
  {
    id: 'streaming',
    name: 'Streaming Worker',
    region: 'ap-south',
    tier: 'Realtime',
    owner: 'Media',
    baseLatency: 150,
    baseTraffic: 310
  }
];

let snapshots: ServiceSnapshot[] = services.map((service, index) => ({
  ...service,
  status: 'healthy',
  latencyP95: service.baseLatency + index * 12,
  requestRate: service.baseTraffic,
  errorRate: 0.4 + index * 0.12,
  queueDepth: 20 + index * 10,
  errorBudgetRemaining: 99.2 - index * 0.4,
  saturation: 40 + index * 6
}));

const events: EventItem[] = [];
const trends: TrendPoint[] = [];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function healthScore(status: Health): number {
  if (status === 'critical') {
    return 0.2;
  }

  if (status === 'degraded') {
    return 0.6;
  }

  return 1;
}

function resolveHealth(latencyP95: number, errorRate: number, queueDepth: number, saturation: number): Health {
  if (latencyP95 > 500 || errorRate > 2.2 || queueDepth > 120 || saturation > 92) {
    return 'critical';
  }

  if (latencyP95 > 320 || errorRate > 1.1 || queueDepth > 70 || saturation > 78) {
    return 'degraded';
  }

  return 'healthy';
}

function pushEvent(now: number, severity: Severity, title: string, service: ServiceDefinition, description: string): void {
  events.unshift({
    id: `${service.id}-${now}-${events.length}`,
    time: new Date(now).toISOString(),
    severity,
    title,
    service: service.name,
    region: service.region,
    description
  });

  if (events.length > 10) {
    events.length = 10;
  }
}

function aggregate(currentSnapshots: ServiceSnapshot[]) {
  const totalRequestRate = currentSnapshots.reduce((sum, service) => sum + service.requestRate, 0);
  const weightedLatency =
    currentSnapshots.reduce((sum, service) => sum + service.latencyP95 * service.requestRate, 0) /
    totalRequestRate;
  const weightedErrorRate =
    currentSnapshots.reduce((sum, service) => sum + service.errorRate * service.requestRate, 0) /
    totalRequestRate;
  const activeAlerts = currentSnapshots.filter((service) => service.status !== 'healthy').length;
  const errorBudgetRemaining =
    currentSnapshots.reduce((sum, service) => sum + service.errorBudgetRemaining, 0) / currentSnapshots.length;

  return {
    totalRequestRate: round(totalRequestRate, 0),
    latencyP95: round(weightedLatency, 0),
    errorRate: round(weightedErrorRate, 2),
    activeAlerts,
    errorBudgetRemaining: round(errorBudgetRemaining, 2)
  };
}

function simulateStep(now: number, emitMetrics: boolean): void {
  snapshots = snapshots.map((service, index) => {
    const baselineWave = Math.sin(now / 18000 + index * 1.2);
    const pressureWave = Math.cos(now / 25000 + index * 0.8);

    const requestRate = clamp(
      service.requestRate + baselineWave * 18 + pressureWave * 8 + (Math.random() - 0.5) * 20,
      service.baseTraffic * 0.6,
      service.baseTraffic * 1.8
    );
    const saturation = clamp(
      service.saturation + pressureWave * 4 + (Math.random() - 0.5) * 9,
      28,
      97
    );
    const queueDepth = clamp(
      service.queueDepth + (saturation > 82 ? 8 : -2) + (Math.random() - 0.5) * 14,
      4,
      180
    );
    const latencyP95 = clamp(
      service.baseLatency + saturation * 2 + queueDepth * 1.4 + (Math.random() - 0.5) * 40,
      90,
      680
    );
    const errorRate = clamp(
      0.18 + saturation / 80 + queueDepth / 180 + (Math.random() - 0.5) * 0.45,
      0.05,
      3.8
    );
    const errorBudgetRemaining = clamp(
      service.errorBudgetRemaining - errorRate * 0.05 + (Math.random() - 0.5) * 0.12,
      82,
      100
    );

    const status = resolveHealth(latencyP95, errorRate, queueDepth, saturation);

    if (status !== service.status) {
      const severity: Severity = status === 'critical' ? 'critical' : status === 'degraded' ? 'warning' : 'info';
      const title =
        status === 'healthy'
          ? 'Recovered to green'
          : status === 'degraded'
            ? 'Latency drift detected'
            : 'Critical saturation spike';

      pushEvent(
        now,
        severity,
        title,
        service,
        `${service.name} moved to ${status} with p95 ${round(latencyP95, 0)} ms and ${round(errorRate, 2)}% error rate.`
      );
    }

    if (emitMetrics) {
      const totalRequests = Math.max(1, Math.round(requestRate * 5));
      const errorRequests = Math.max(0, Math.round(totalRequests * (errorRate / 100)));

      syntheticRequests.inc({ service: service.id, status_code: '200' }, totalRequests - errorRequests);
      syntheticRequests.inc({ service: service.id, status_code: '500' }, errorRequests);
      syntheticDuration.observe({ service: service.id }, latencyP95 / 1000);

      serviceHealthGauge.set({ service: service.id, region: service.region }, healthScore(status));
      queueDepthGauge.set({ service: service.id, region: service.region }, queueDepth);
      errorBudgetGauge.set({ service: service.id, region: service.region }, errorBudgetRemaining);
      latencyGauge.set({ service: service.id, region: service.region }, latencyP95);
      saturationGauge.set({ service: service.id, region: service.region }, saturation);
    }

    return {
      ...service,
      status,
      requestRate: round(requestRate, 0),
      saturation: round(saturation, 0),
      queueDepth: round(queueDepth, 0),
      latencyP95: round(latencyP95, 0),
      errorRate: round(errorRate, 2),
      errorBudgetRemaining: round(errorBudgetRemaining, 2)
    };
  });

  const currentAggregate = aggregate(snapshots);
  trends.push({
    timestamp: new Date(now).toISOString(),
    requestRate: currentAggregate.totalRequestRate,
    latencyP95: currentAggregate.latencyP95,
    errorRate: currentAggregate.errorRate,
    activeAlerts: currentAggregate.activeAlerts
  });

  if (trends.length > 36) {
    trends.shift();
  }

  if (emitMetrics) {
    alertGauge.set(currentAggregate.activeAlerts);
  }
}

for (let step = 12; step >= 1; step -= 1) {
  simulateStep(Date.now() - step * 5000, false);
}

simulateStep(Date.now(), true);
setInterval(() => {
  simulateStep(Date.now(), true);
}, 5000);

app.use(cors());
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationInSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    const route = req.path;
    const statusCode = String(res.statusCode);

    requestCounter.inc({ route, method: req.method, status_code: statusCode });
    requestDuration.observe({ route, method: req.method, status_code: statusCode }, durationInSeconds);
  });

  next();
});

app.get('/api/overview', (_req: Request, res: Response) => {
  const summary = aggregate(snapshots);

  res.json({
    asOf: new Date().toISOString(),
    summary: {
      ...summary,
      totalServices: snapshots.length,
      healthyServices: snapshots.filter((service) => service.status === 'healthy').length,
      degradedServices: snapshots.filter((service) => service.status === 'degraded').length,
      criticalServices: snapshots.filter((service) => service.status === 'critical').length
    },
    services: snapshots,
    events
  });
});

app.get('/api/trends', (_req: Request, res: Response) => {
  res.json({
    generatedAt: new Date().toISOString(),
    points: trends
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok'
  });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

app.listen(port, () => {
  console.log(`Mock monitoring backend running on port ${port}`);
});
