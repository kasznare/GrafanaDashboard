using System.Globalization;
using System.Text;

namespace SignalDeck.Backend;

public sealed class MonitoringState
{
    private readonly object _syncRoot = new();
    private readonly List<MonitoredServiceState> _services;
    private readonly List<EventItemDto> _events = [];
    private readonly List<TrendPointDto> _trends = [];
    private readonly Dictionary<ApiRequestKey, double> _apiRequestTotals = [];
    private readonly Dictionary<ServiceRequestKey, double> _syntheticRequestTotals = [];
    private bool _initialized;
    private DateTimeOffset _lastUpdated = DateTimeOffset.UtcNow;

    public MonitoringState()
    {
        _services =
        [
            new MonitoredServiceState("gateway", "Edge Gateway", "eu-central", "Edge", "Platform", 120, 430, 120, 430, 0.4, 20, 99.2, 40, "healthy"),
            new MonitoredServiceState("checkout", "Checkout API", "eu-central", "Core", "Payments", 180, 280, 192, 280, 0.52, 30, 98.8, 46, "healthy"),
            new MonitoredServiceState("inventory", "Inventory Sync", "us-east", "Data", "Supply", 240, 190, 264, 190, 0.64, 40, 98.4, 52, "healthy"),
            new MonitoredServiceState("streaming", "Streaming Worker", "ap-south", "Realtime", "Media", 150, 310, 186, 310, 0.76, 50, 98.0, 58, "healthy")
        ];
    }

    public void Initialize()
    {
        lock (_syncRoot)
        {
            if (_initialized)
            {
                return;
            }

            for (var step = 12; step >= 1; step--)
            {
                SimulateStepLocked(DateTimeOffset.UtcNow.AddSeconds(-step * 5), emitMetrics: false);
            }

            SimulateStepLocked(DateTimeOffset.UtcNow, emitMetrics: true);
            _initialized = true;
        }
    }

    public void AdvanceSimulation()
    {
        lock (_syncRoot)
        {
            SimulateStepLocked(DateTimeOffset.UtcNow, emitMetrics: true);
        }
    }

    public OverviewResponseDto GetOverview()
    {
        lock (_syncRoot)
        {
            var summary = AggregateLocked();

            return new OverviewResponseDto
            {
                AsOf = _lastUpdated,
                Summary = new OverviewSummaryDto
                {
                    TotalServices = _services.Count,
                    HealthyServices = _services.Count(service => service.Status == "healthy"),
                    DegradedServices = _services.Count(service => service.Status == "degraded"),
                    CriticalServices = _services.Count(service => service.Status == "critical"),
                    TotalRequestRate = summary.TotalRequestRate,
                    LatencyP95 = summary.LatencyP95,
                    ErrorRate = summary.ErrorRate,
                    ActiveAlerts = summary.ActiveAlerts,
                    ErrorBudgetRemaining = summary.ErrorBudgetRemaining
                },
                Services = _services.Select(service => service.ToDto()).ToArray(),
                Events = _events.ToArray()
            };
        }
    }

    public TrendsResponseDto GetTrends()
    {
        lock (_syncRoot)
        {
            return new TrendsResponseDto
            {
                GeneratedAt = _lastUpdated,
                Points = _trends.ToArray()
            };
        }
    }

    public void RecordApiRequest(string route, string method, int statusCode, double durationSeconds)
    {
        lock (_syncRoot)
        {
            var key = new ApiRequestKey(route, method, statusCode.ToString(CultureInfo.InvariantCulture));

            _apiRequestTotals.TryGetValue(key, out var currentCount);
            _apiRequestTotals[key] = currentCount + 1;

            var routeKey = new ServiceRequestKey("mock-api", statusCode.ToString(CultureInfo.InvariantCulture));
            _syntheticRequestTotals.TryGetValue(routeKey, out var currentRouteCount);
            _syntheticRequestTotals[routeKey] = currentRouteCount + 1;
        }
    }

    public string RenderPrometheusMetrics()
    {
        lock (_syncRoot)
        {
            var builder = new StringBuilder();

            builder.AppendLine("# HELP mock_api_http_requests_total HTTP requests handled by the mock API.");
            builder.AppendLine("# TYPE mock_api_http_requests_total counter");
            foreach (var metric in _apiRequestTotals.OrderBy(entry => entry.Key.Route).ThenBy(entry => entry.Key.Method).ThenBy(entry => entry.Key.StatusCode))
            {
                builder.Append("mock_api_http_requests_total");
                builder.Append(FormatLabels(
                    ("route", metric.Key.Route),
                    ("method", metric.Key.Method),
                    ("status_code", metric.Key.StatusCode)));
                builder.Append(' ');
                builder.AppendLine(FormatNumber(metric.Value));
            }

            builder.AppendLine("# HELP mock_service_requests_total Synthetic service request traffic emitted by the simulator.");
            builder.AppendLine("# TYPE mock_service_requests_total counter");
            foreach (var metric in _syntheticRequestTotals.OrderBy(entry => entry.Key.Service).ThenBy(entry => entry.Key.StatusCode))
            {
                builder.Append("mock_service_requests_total");
                builder.Append(FormatLabels(
                    ("service", metric.Key.Service),
                    ("status_code", metric.Key.StatusCode)));
                builder.Append(' ');
                builder.AppendLine(FormatNumber(metric.Value));
            }

            AppendServiceGauge(builder,
                "mock_service_health_score",
                "Synthetic service health score. 1 is healthy, 0.6 degraded, 0.2 critical.",
                service => service.HealthScore);
            AppendServiceGauge(builder,
                "mock_service_queue_depth",
                "Synthetic queue depth per service.",
                service => service.QueueDepth);
            AppendServiceGauge(builder,
                "mock_service_error_budget_remaining",
                "Synthetic error budget remaining percentage per service.",
                service => service.ErrorBudgetRemaining);
            AppendServiceGauge(builder,
                "mock_service_latency_p95_ms",
                "Synthetic p95 latency in milliseconds per service.",
                service => service.LatencyP95);
            AppendServiceGauge(builder,
                "mock_service_saturation",
                "Synthetic saturation percentage per service.",
                service => service.Saturation);

            builder.AppendLine("# HELP mock_active_alerts Synthetic count of currently active alerts.");
            builder.AppendLine("# TYPE mock_active_alerts gauge");
            builder.Append("mock_active_alerts ");
            builder.AppendLine(AggregateLocked().ActiveAlerts.ToString(CultureInfo.InvariantCulture));

            return builder.ToString();
        }
    }

    private void AppendServiceGauge(StringBuilder builder, string metricName, string help, Func<MonitoredServiceState, double> selector)
    {
        builder.Append("# HELP ");
        builder.Append(metricName);
        builder.Append(' ');
        builder.AppendLine(help);
        builder.Append("# TYPE ");
        builder.Append(metricName);
        builder.AppendLine(" gauge");

        foreach (var service in _services.OrderBy(service => service.Id))
        {
            builder.Append(metricName);
            builder.Append(FormatLabels(
                ("service", service.Id),
                ("region", service.Region)));
            builder.Append(' ');
            builder.AppendLine(FormatNumber(selector(service)));
        }
    }

    private void SimulateStepLocked(DateTimeOffset now, bool emitMetrics)
    {
        var nowMilliseconds = now.ToUnixTimeMilliseconds();

        for (var index = 0; index < _services.Count; index++)
        {
            var service = _services[index];
            var baselineWave = Math.Sin(nowMilliseconds / 18000d + index * 1.2d);
            var pressureWave = Math.Cos(nowMilliseconds / 25000d + index * 0.8d);

            var requestRate = Clamp(
                service.RequestRate + baselineWave * 18d + pressureWave * 8d + (Random.Shared.NextDouble() - 0.5d) * 20d,
                service.BaseTraffic * 0.6d,
                service.BaseTraffic * 1.8d);
            var saturation = Clamp(
                service.Saturation + pressureWave * 4d + (Random.Shared.NextDouble() - 0.5d) * 9d,
                28d,
                97d);
            var queueDepth = Clamp(
                service.QueueDepth + (saturation > 82d ? 8d : -2d) + (Random.Shared.NextDouble() - 0.5d) * 14d,
                4d,
                180d);
            var latencyP95 = Clamp(
                service.BaseLatency + saturation * 2d + queueDepth * 1.4d + (Random.Shared.NextDouble() - 0.5d) * 40d,
                90d,
                680d);
            var errorRate = Clamp(
                0.18d + saturation / 80d + queueDepth / 180d + (Random.Shared.NextDouble() - 0.5d) * 0.45d,
                0.05d,
                3.8d);
            var errorBudgetRemaining = Clamp(
                service.ErrorBudgetRemaining - errorRate * 0.05d + (Random.Shared.NextDouble() - 0.5d) * 0.12d,
                82d,
                100d);

            var status = ResolveHealth(latencyP95, errorRate, queueDepth, saturation);

            if (!string.Equals(status, service.Status, StringComparison.Ordinal))
            {
                var severity = status switch
                {
                    "critical" => "critical",
                    "degraded" => "warning",
                    _ => "info"
                };

                var title = status switch
                {
                    "healthy" => "Recovered to green",
                    "degraded" => "Latency drift detected",
                    _ => "Critical saturation spike"
                };

                PushEventLocked(now, severity, title, service, $"{service.Name} moved to {status} with p95 {Round(latencyP95, 0):0} ms and {Round(errorRate, 2):0.##}% error rate.");
            }

            if (emitMetrics)
            {
                var totalRequests = Math.Max(1d, Math.Round(requestRate * 5d, MidpointRounding.AwayFromZero));
                var errorRequests = Math.Max(0d, Math.Round(totalRequests * (errorRate / 100d), MidpointRounding.AwayFromZero));

                IncrementSyntheticRequestLocked(service.Id, "200", totalRequests - errorRequests);
                IncrementSyntheticRequestLocked(service.Id, "500", errorRequests);
            }

            service.RequestRate = Round(requestRate, 0);
            service.Saturation = Round(saturation, 0);
            service.QueueDepth = Round(queueDepth, 0);
            service.LatencyP95 = Round(latencyP95, 0);
            service.ErrorRate = Round(errorRate, 2);
            service.ErrorBudgetRemaining = Round(errorBudgetRemaining, 2);
            service.Status = status;
        }

        var aggregate = AggregateLocked();
        _trends.Add(new TrendPointDto
        {
            Timestamp = now,
            RequestRate = aggregate.TotalRequestRate,
            LatencyP95 = aggregate.LatencyP95,
            ErrorRate = aggregate.ErrorRate,
            ActiveAlerts = aggregate.ActiveAlerts
        });

        while (_trends.Count > 36)
        {
            _trends.RemoveAt(0);
        }

        _lastUpdated = now;
    }

    private void IncrementSyntheticRequestLocked(string service, string statusCode, double increment)
    {
        var key = new ServiceRequestKey(service, statusCode);
        _syntheticRequestTotals.TryGetValue(key, out var currentCount);
        _syntheticRequestTotals[key] = currentCount + increment;
    }

    private void PushEventLocked(DateTimeOffset now, string severity, string title, MonitoredServiceState service, string description)
    {
        _events.Insert(0, new EventItemDto
        {
            Id = $"{service.Id}-{now.ToUnixTimeMilliseconds()}-{_events.Count}",
            Time = now,
            Severity = severity,
            Title = title,
            Service = service.Name,
            Region = service.Region,
            Description = description
        });

        while (_events.Count > 10)
        {
            _events.RemoveAt(_events.Count - 1);
        }
    }

    private AggregateState AggregateLocked()
    {
        var totalRequestRate = _services.Sum(service => service.RequestRate);
        var weightedLatency = _services.Sum(service => service.LatencyP95 * service.RequestRate) / totalRequestRate;
        var weightedErrorRate = _services.Sum(service => service.ErrorRate * service.RequestRate) / totalRequestRate;
        var activeAlerts = _services.Count(service => !string.Equals(service.Status, "healthy", StringComparison.Ordinal));
        var errorBudgetRemaining = _services.Average(service => service.ErrorBudgetRemaining);

        return new AggregateState(
            Round(totalRequestRate, 0),
            Round(weightedLatency, 0),
            Round(weightedErrorRate, 2),
            activeAlerts,
            Round(errorBudgetRemaining, 2));
    }

    private static string ResolveHealth(double latencyP95, double errorRate, double queueDepth, double saturation)
    {
        if (latencyP95 > 500d || errorRate > 2.2d || queueDepth > 120d || saturation > 92d)
        {
            return "critical";
        }

        if (latencyP95 > 320d || errorRate > 1.1d || queueDepth > 70d || saturation > 78d)
        {
            return "degraded";
        }

        return "healthy";
    }

    private static double Clamp(double value, double min, double max) => Math.Min(max, Math.Max(min, value));

    private static double Round(double value, int digits)
    {
        var factor = Math.Pow(10, digits);
        return Math.Round(value * factor, MidpointRounding.AwayFromZero) / factor;
    }

    private static string FormatNumber(double value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    private static string FormatLabels(params (string Name, string Value)[] labels)
    {
        return "{" + string.Join(",", labels.Select(label => $"{label.Name}=\"{EscapeLabelValue(label.Value)}\"")) + "}";
    }

    private static string EscapeLabelValue(string value)
    {
        return value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal);
    }

    private sealed class MonitoredServiceState(
        string id,
        string name,
        string region,
        string tier,
        string owner,
        int baseLatency,
        int baseTraffic,
        double latencyP95,
        double requestRate,
        double errorRate,
        double queueDepth,
        double errorBudgetRemaining,
        double saturation,
        string status)
    {
        public string Id { get; } = id;
        public string Name { get; } = name;
        public string Region { get; } = region;
        public string Tier { get; } = tier;
        public string Owner { get; } = owner;
        public int BaseLatency { get; } = baseLatency;
        public int BaseTraffic { get; } = baseTraffic;
        public double LatencyP95 { get; set; } = latencyP95;
        public double RequestRate { get; set; } = requestRate;
        public double ErrorRate { get; set; } = errorRate;
        public double QueueDepth { get; set; } = queueDepth;
        public double ErrorBudgetRemaining { get; set; } = errorBudgetRemaining;
        public double Saturation { get; set; } = saturation;
        public string Status { get; set; } = status;

        public double HealthScore => Status switch
        {
            "critical" => 0.2d,
            "degraded" => 0.6d,
            _ => 1d
        };

        public ServiceSnapshotDto ToDto()
        {
            return new ServiceSnapshotDto
            {
                Id = Id,
                Name = Name,
                Region = Region,
                Tier = Tier,
                Owner = Owner,
                BaseLatency = BaseLatency,
                BaseTraffic = BaseTraffic,
                Status = Status,
                LatencyP95 = LatencyP95,
                RequestRate = RequestRate,
                ErrorRate = ErrorRate,
                QueueDepth = QueueDepth,
                ErrorBudgetRemaining = ErrorBudgetRemaining,
                Saturation = Saturation
            };
        }
    }

    private sealed record AggregateState(
        double TotalRequestRate,
        double LatencyP95,
        double ErrorRate,
        int ActiveAlerts,
        double ErrorBudgetRemaining);

    private sealed record ApiRequestKey(string Route, string Method, string StatusCode);
    private sealed record ServiceRequestKey(string Service, string StatusCode);
}

public sealed class SimulationWorker(MonitoringState state) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        state.Initialize();

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            state.AdvanceSimulation();
        }
    }
}
