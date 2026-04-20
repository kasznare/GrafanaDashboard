namespace SignalDeck.Backend;

public sealed class ServiceSnapshotDto
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Region { get; init; } = string.Empty;
    public string Tier { get; init; } = string.Empty;
    public string Owner { get; init; } = string.Empty;
    public int BaseLatency { get; init; }
    public int BaseTraffic { get; init; }
    public string Status { get; init; } = string.Empty;
    public double LatencyP95 { get; init; }
    public double RequestRate { get; init; }
    public double ErrorRate { get; init; }
    public double QueueDepth { get; init; }
    public double ErrorBudgetRemaining { get; init; }
    public double Saturation { get; init; }
}

public sealed class EventItemDto
{
    public string Id { get; init; } = string.Empty;
    public DateTimeOffset Time { get; init; }
    public string Severity { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public string Service { get; init; } = string.Empty;
    public string Region { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
}

public sealed class TrendPointDto
{
    public DateTimeOffset Timestamp { get; init; }
    public double RequestRate { get; init; }
    public double LatencyP95 { get; init; }
    public double ErrorRate { get; init; }
    public int ActiveAlerts { get; init; }
}

public sealed class OverviewSummaryDto
{
    public int TotalServices { get; init; }
    public int HealthyServices { get; init; }
    public int DegradedServices { get; init; }
    public int CriticalServices { get; init; }
    public double TotalRequestRate { get; init; }
    public double LatencyP95 { get; init; }
    public double ErrorRate { get; init; }
    public int ActiveAlerts { get; init; }
    public double ErrorBudgetRemaining { get; init; }
}

public sealed class OverviewResponseDto
{
    public DateTimeOffset AsOf { get; init; }
    public OverviewSummaryDto Summary { get; init; } = new();
    public IReadOnlyList<ServiceSnapshotDto> Services { get; init; } = Array.Empty<ServiceSnapshotDto>();
    public IReadOnlyList<EventItemDto> Events { get; init; } = Array.Empty<EventItemDto>();
}

public sealed class TrendsResponseDto
{
    public DateTimeOffset GeneratedAt { get; init; }
    public IReadOnlyList<TrendPointDto> Points { get; init; } = Array.Empty<TrendPointDto>();
}
