export type Health = 'healthy' | 'degraded' | 'critical';
export type Severity = 'info' | 'warning' | 'critical';

export type ServiceSnapshot = {
  id: string;
  name: string;
  region: string;
  tier: string;
  owner: string;
  status: Health;
  latencyP95: number;
  requestRate: number;
  errorRate: number;
  queueDepth: number;
  errorBudgetRemaining: number;
  saturation: number;
};

export type EventItem = {
  id: string;
  time: string;
  severity: Severity;
  title: string;
  service: string;
  region: string;
  description: string;
};

export type OverviewResponse = {
  asOf: string;
  summary: {
    totalServices: number;
    healthyServices: number;
    degradedServices: number;
    criticalServices: number;
    totalRequestRate: number;
    latencyP95: number;
    errorRate: number;
    activeAlerts: number;
    errorBudgetRemaining: number;
  };
  services: ServiceSnapshot[];
  events: EventItem[];
};

export type TrendsResponse = {
  generatedAt: string;
  points: Array<{
    timestamp: string;
    requestRate: number;
    latencyP95: number;
    errorRate: number;
    activeAlerts: number;
  }>;
};
