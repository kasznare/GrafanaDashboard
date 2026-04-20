using SignalDeck.Backend;

var builder = WebApplication.CreateBuilder(args);
var port = Environment.GetEnvironmentVariable("PORT") ?? "4000";

builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
builder.Services.AddSingleton<MonitoringState>();
builder.Services.AddHostedService<SimulationWorker>();

var app = builder.Build();

app.UseCors();

app.Use(async (context, next) =>
{
    var startedAt = DateTimeOffset.UtcNow;

    await next();

    var duration = DateTimeOffset.UtcNow - startedAt;
    var state = context.RequestServices.GetRequiredService<MonitoringState>();
    state.RecordApiRequest(context.Request.Path.Value ?? "/", context.Request.Method, context.Response.StatusCode, duration.TotalSeconds);
});

app.MapGet("/api/overview", (MonitoringState state) => Results.Ok(state.GetOverview()));
app.MapGet("/api/trends", (MonitoringState state) => Results.Ok(state.GetTrends()));
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/metrics", (MonitoringState state) => Results.Text(state.RenderPrometheusMetrics(), "text/plain; version=0.0.4; charset=utf-8"));

app.Run();
