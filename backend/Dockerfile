FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build

WORKDIR /src
COPY SignalDeck.Backend.csproj ./
RUN dotnet restore

COPY . ./
RUN dotnet publish SignalDeck.Backend.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime

WORKDIR /app
ENV ASPNETCORE_URLS=http://+:4000
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish ./

EXPOSE 4000
CMD ["dotnet", "SignalDeck.Backend.dll"]
