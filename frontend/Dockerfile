# syntax=docker/dockerfile:1
# El contexto de construcción es la raíz del repositorio: el lockfile y los workspaces viven allí.

# --- Etapa 1: compilación de la aplicación estática ------------------------------------------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY db/runner/package.json db/runner/
COPY tools/scripts/package.json tools/scripts/
COPY tools/recurrente-simulator/package.json tools/recurrente-simulator/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY frontend frontend
RUN npm run build --workspace=frontend

# --- Etapa 2: servidor estático sin privilegios ------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
