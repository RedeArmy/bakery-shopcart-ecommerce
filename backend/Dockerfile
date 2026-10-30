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
COPY backend backend
RUN npm run build --workspace=backend

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
RUN npm ci --omit=dev --workspace=backend --ignore-scripts && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
# Directorio privado de comprobantes con el propietario correcto para el usuario no root
RUN mkdir -p /data/payment-proofs && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=6 CMD node -e "fetch('http://127.0.0.1:3000/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "backend/dist/main.js"]
