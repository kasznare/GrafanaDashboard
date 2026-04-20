# Signal Deck

Signal Deck is a proof-of-concept monitoring demo that combines:

- a custom React UI for an operator-facing dashboard
- a mock .NET microservice that emits synthetic service state and Prometheus metrics
- Prometheus for scraping and storing metrics
- Grafana with a provisioned datasource and dashboard

## What This POC Actually Is

This repository is intentionally split into two visualization layers:

- The React UI is a custom application that renders cards, charts, incident items, and service summaries from the mock backend JSON API.
- Grafana is a separate monitoring tool connected to Prometheus.
- The React UI also embeds selected Grafana panels with `iframe` elements, so the page shows both custom UI components and native Grafana panels at the same time.

In other words:

- the top and middle sections of the page are custom React views
- the bottom "Embedded Grafana" section is Grafana rendered inside the React UI
- Grafana itself is also available directly as a standalone dashboard

## How The Current POC Works

The data flow in this project is:

1. The mock backend simulates several services and updates their latency, error rate, queue depth, saturation, and health state.
2. The backend exposes:
   - `/api/overview` and `/api/trends` for the React UI
   - `/metrics` for Prometheus
3. Prometheus scrapes the backend metrics every 5 seconds.
4. Grafana reads data from Prometheus and renders dashboards.
5. The React UI fetches the JSON API for the custom parts of the screen and embeds Grafana panels for the Prometheus-backed parts.

This means the current backend is not a real monitoring aggregator for your microservices. It is a demo data source.

## Run With Docker

```bash
docker compose up --build
```

After the stack starts:

- UI: [http://localhost:8080](http://localhost:8080)
- Mock API: [http://localhost:4000/api/overview](http://localhost:4000/api/overview)
- Prometheus: [http://localhost:9090](http://localhost:9090)
- Grafana: [http://localhost:3001/d/mock-monitoring/mock-monitoring-overview](http://localhost:3001/d/mock-monitoring/mock-monitoring-overview)

## Local Development Without Docker

Install dependencies:

```bash
cd backend
dotnet restore
cd ../frontend
npm install
```

Run the backend:

```bash
cd backend
dotnet watch run
```

Run the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:4000`.

## Moving This POC To Docker Swarm

If you want to use this in a real Docker Swarm environment with:

- two instances of a service
- several microservices
- Prometheus and Grafana monitoring

then you should treat this repository as a starting point, not as a production-ready stack.

The main architectural shift is this:

- the current `backend/` service should not stay a mock generator
- your real microservices should expose metrics directly
- Prometheus should discover and scrape Swarm tasks
- Grafana should visualize those metrics
- the React UI should either become a thin portal on top of real monitoring data or be dropped in favor of Grafana alone

### 1. Cluster And Deployment Layer

For Swarm, the current local `docker-compose.yml` is not enough by itself.

What needs to change:

- Use `docker stack deploy`, not `docker compose up`.
- Build images ahead of time and push them to a registry.
- Replace local `build:`-only deployment with `image:` references that all Swarm nodes can pull.
- Add `deploy:` settings for replicas, restart policy, rolling updates, resource limits, and placement.
- Use overlay networks so Prometheus, Grafana, and your app services can talk to each other across nodes.

Practical guidance:

- Keep one stack for monitoring, or at least one shared overlay network such as `monitoring`.
- Run `docker stack deploy` from a Swarm manager node.
- Pin stateful services such as Prometheus and Grafana to nodes that have the correct persistent storage available.

Example service shape in Swarm:

```yaml
services:
  checkout:
    image: registry.example.com/checkout:1.0.0
    networks:
      - app
      - monitoring
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/health"]
      interval: 10s
      timeout: 3s
      retries: 5
    deploy:
      replicas: 2
      restart_policy:
        condition: any
      update_config:
        parallelism: 1
        delay: 10s
      resources:
        limits:
          cpus: "0.50"
          memory: 512M
        reservations:
          cpus: "0.10"
          memory: 128M
      labels:
        prometheus-job: checkout
        service: checkout
        team: payments
```

### 2. Microservice Layer

Each microservice must become independently scrapeable.

What needs to be added or standardized in each service:

- a health endpoint such as `/health`
- a Prometheus metrics endpoint such as `/metrics`
- consistent internal metrics port if possible
- useful labels or metadata such as service name, environment, team, version

Best practice for Swarm:

- Standardize the metrics path and internal metrics port across services if you can.
- Do not rely on published public ports for metrics scraping.
- Put monitored services on a shared internal `monitoring` overlay network.
- Scale stateless services to `replicas: 2` or more using Swarm.

Important limitation of the current POC:

- The current mock backend is stateful demo logic.
- If you scale it to two replicas as-is, each replica will generate different synthetic data.
- That is fine for a demo, but wrong for production.
- In a real system, each application instance emits its own real metrics, and Prometheus aggregates them.

### 3. Prometheus Layer

The current Prometheus setup uses a static target:

- scrape `backend:4000/metrics`

That is correct for local compose, but not for a real Swarm with many services and replicas.

For Swarm, Prometheus should discover services or tasks dynamically.

Recommended direction:

- Replace `static_configs` with `dockerswarm_sd_configs`.
- Discover `tasks` so Prometheus can see each replica separately.
- Keep only services that are explicitly labeled for monitoring.
- Attach Prometheus to the same overlay network used by the services it scrapes.

Example pattern:

```yaml
scrape_configs:
  - job_name: swarm-tasks
    dockerswarm_sd_configs:
      - host: unix:///var/run/docker.sock
        role: tasks
        port: 8080
    relabel_configs:
      - source_labels: [__meta_dockerswarm_task_desired_state]
        regex: running
        action: keep
      - source_labels: [__meta_dockerswarm_service_label_prometheus_job]
        regex: .+
        action: keep
      - source_labels: [__meta_dockerswarm_service_label_prometheus_job]
        target_label: job
      - source_labels: [__meta_dockerswarm_network_name]
        regex: monitoring
        action: keep
```

Notes:

- This example assumes your services expose metrics on internal port `8080`.
- If your services use different metrics ports, you should either standardize them or create separate scrape jobs.
- Prometheus needs access to Swarm metadata. In small Swarm setups this often means running on a manager node or using a Docker socket proxy.

For a two-node Swarm:

- A single Prometheus replica with persistent storage is usually the simplest starting point.
- Multiple Prometheus replicas do not automatically give you clean HA unless you also solve storage, deduplication, and query consistency.

### 4. Grafana Layer

Grafana is already the right tool in this architecture. The changes here are mostly operational.

What needs to change for real use:

- Persist `/var/lib/grafana`.
- Keep dashboards and datasources provisioned through files, configs, or a GitOps flow.
- Disable anonymous access outside demo environments.
- Use proper admin credentials and secrets.
- If you want more than one Grafana replica, use a shared external database instead of SQLite-in-a-container.

For a small two-node Swarm, the usual starting point is:

- 1 Grafana replica
- persistent volume
- provisioned dashboards
- Prometheus as the default datasource

### 5. React UI Layer

The React UI in this repository is not a replacement for Grafana. It is a custom shell around monitoring data.

In production you have three realistic choices:

- Keep the React UI as a portal and replace the mock backend with a real aggregation API.
- Keep only Grafana and drop the custom UI.
- Keep the React UI, but let it show metadata, incident summaries, ownership, deployment status, and links into Grafana, while Grafana stays the source of truth for timeseries.

If you keep the React UI, the backend behind it should no longer generate fake metrics. Instead it should:

- query Prometheus for aggregates
- fetch deployment metadata from your service registry or deployment system
- fetch alerts from Alertmanager or your alerting source
- expose normalized JSON for the UI

The iframe approach used in this POC is valid in production if:

- Grafana embedding is allowed
- the auth model is handled correctly
- the UI is meant to be a portal, not a full replacement for Grafana

### 6. Infrastructure Monitoring You Will Probably Add

For a real Swarm setup, application metrics are only part of the picture.

You will usually also want:

- node-level metrics with `node-exporter`
- container metrics with `cAdvisor`
- alerting with Alertmanager
- optional logs and traces if you want a fuller observability stack

In Swarm, infrastructure exporters are often deployed as global services so they run on every node.

### 7. What Changes At Each Level

Cluster level:

- initialize Swarm
- use a registry for images
- deploy stacks from a manager node
- create overlay networks
- label nodes for placement if needed

Service level:

- add `/health`
- add `/metrics`
- standardize internal metrics port
- add `deploy.replicas`, restart policy, update config, resources
- add labels for Prometheus discovery and ownership

Prometheus level:

- stop scraping a single static demo target
- use Swarm service discovery
- persist TSDB data
- attach to monitoring network
- add scrape jobs for app services and optionally nodes/containers

Grafana level:

- persist data
- provision dashboards/datasources
- configure authentication
- keep 1 replica unless you also externalize Grafana state

UI level:

- decide whether it is a portal or the primary dashboard
- replace the mock backend with a real aggregation service if you keep it
- keep iframe embedding only if the auth and UX model fits your environment

### 8. Minimal Migration Checklist

If you want to take this POC toward a real Swarm deployment, the shortest sane path is:

1. Build and push the frontend and backend images to a registry.
2. Create a Swarm stack file with `image:` references and `deploy:` settings.
3. Replace the mock backend with either:
   - real microservices exposing `/metrics`, or
   - a real monitoring aggregation API for the React UI
4. Move Prometheus from static scrape targets to Swarm task discovery.
5. Put Prometheus and the monitored services on a shared overlay network.
6. Persist Prometheus and Grafana data.
7. Add Alertmanager and infrastructure exporters.
8. Decide whether the React UI remains a portal or whether Grafana becomes the primary UI.

## Project Structure

- [`/Users/kasznarandras/Code/GrafanaDashboard/frontend`](/Users/kasznarandras/Code/GrafanaDashboard/frontend): React monitoring UI
- [`/Users/kasznarandras/Code/GrafanaDashboard/backend`](/Users/kasznarandras/Code/GrafanaDashboard/backend): ASP.NET Core mock microservice and Prometheus metrics endpoint
- [`/Users/kasznarandras/Code/GrafanaDashboard/prometheus/prometheus.yml`](/Users/kasznarandras/Code/GrafanaDashboard/prometheus/prometheus.yml): Prometheus scrape targets
- [`/Users/kasznarandras/Code/GrafanaDashboard/grafana/dashboards/monitoring-overview.json`](/Users/kasznarandras/Code/GrafanaDashboard/grafana/dashboards/monitoring-overview.json): provisioned Grafana dashboard
