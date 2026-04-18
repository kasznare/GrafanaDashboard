# Signal Deck

Signal Deck is a local monitoring demo that combines:

- a React UI for an operator-facing dashboard
- a mock Node/Express backend that emits synthetic service health and Prometheus metrics
- Prometheus for scraping and storing metrics
- Grafana with a provisioned datasource and dashboard

## Run with Docker

```bash
docker compose up --build
```

After the stack starts:

- UI: [http://localhost:8080](http://localhost:8080)
- Mock API: [http://localhost:4000/api/overview](http://localhost:4000/api/overview)
- Prometheus: [http://localhost:9090](http://localhost:9090)
- Grafana: [http://localhost:3001/d/mock-monitoring/mock-monitoring-overview](http://localhost:3001/d/mock-monitoring/mock-monitoring-overview)

## Local development without Docker

Install dependencies:

```bash
cd backend && npm install
cd ../frontend && npm install
```

Run the backend:

```bash
cd backend
npm run dev
```

Run the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:4000`.

## Project structure

- [`/Users/kasznarandras/Code/GrafanaDashboard/frontend`](/Users/kasznarandras/Code/GrafanaDashboard/frontend): React monitoring UI
- [`/Users/kasznarandras/Code/GrafanaDashboard/backend`](/Users/kasznarandras/Code/GrafanaDashboard/backend): mock backend and Prometheus metrics endpoint
- [`/Users/kasznarandras/Code/GrafanaDashboard/prometheus/prometheus.yml`](/Users/kasznarandras/Code/GrafanaDashboard/prometheus/prometheus.yml): Prometheus scrape targets
- [`/Users/kasznarandras/Code/GrafanaDashboard/grafana/dashboards/monitoring-overview.json`](/Users/kasznarandras/Code/GrafanaDashboard/grafana/dashboards/monitoring-overview.json): provisioned Grafana dashboard
