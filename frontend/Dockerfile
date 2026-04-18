FROM node:20-alpine AS build

WORKDIR /app
ARG VITE_API_BASE_URL=/api
ARG VITE_GRAFANA_URL=http://localhost:3001
ARG VITE_PROMETHEUS_URL=http://localhost:9090
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_GRAFANA_URL=${VITE_GRAFANA_URL}
ENV VITE_PROMETHEUS_URL=${VITE_PROMETHEUS_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
