# syntax=docker/dockerfile:1
# El contexto de construcción es la raíz del repositorio: el lockfile y los workspaces viven allí.

# --- Etapa 1: compilación (incluye dependencias de desarrollo) -------------------------------
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY db/runner/package.json db/runner/
COPY db/tests/scripts/package.json db/tests/scripts/
COPY tools/scripts/package.json tools/scripts/
COPY tools/recurrente-simulator/package.json tools/recurrente-simulator/
# --ignore-scripts evita ejecutar "husky" (no hay .git dentro de la imagen)
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY db/runner db/runner
RUN npm run build --workspace=db/runner

# --- Etapa 2: ejecución (solo dependencias de producción, usuario no root) -------------------
FROM node:26-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY db/runner/package.json db/runner/
COPY db/tests/scripts/package.json db/tests/scripts/
COPY tools/scripts/package.json tools/scripts/
COPY tools/recurrente-simulator/package.json tools/recurrente-simulator/
RUN npm ci --omit=dev --workspace=db/runner --ignore-scripts && npm cache clean --force
COPY --from=build /app/db/runner/dist db/runner/dist
# Solo los scripts SQL: el runner los lee desde db/ a tres niveles de su propio archivo (igual que en el repositorio)
COPY db/migrations db/migrations
COPY db/objects db/objects
COPY db/seed db/seed
USER node
# Aplica lo pendiente y termina: compose espera a que acabe antes de arrancar el backend (es idempotente)
CMD ["node", "db/runner/dist/cli.js", "migrate"]
