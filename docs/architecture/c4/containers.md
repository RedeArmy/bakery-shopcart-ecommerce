# C4 · Containers

```mermaid
flowchart TB
  browser["Browser<br/>React 18 SPA"]
  subgraph compose["Docker Compose"]
    nginx["nginx edge<br/>limit_req, security headers, routing"]
    frontend["frontend<br/>static files (nginx-unprivileged)"]
    backend["backend<br/>Node 26 + Express"]
    migrate["db-migrate<br/>runner V/R/S"]
    db[("db<br/>SQL Server 2022")]
    proofs[("payment-proofs volume")]
  end
  recurrente[["Recurrente"]]

  browser -->|HTTPS| nginx
  nginx -->|/| frontend
  nginx -->|/api, /webhooks, /health| backend
  backend -->|typed stored procedures| db
  backend -->|reads and writes proofs| proofs
  migrate -->|migrations, objects, seeds| db
  backend -.->|REST + webhooks| recurrente
```

Compose profiles: default (`db`, `db-migrate`, `backend`, `frontend`, `nginx`), `payments-sandbox` (Recurrente simulator), `quality` (SonarQube) and `observability` (OpenTelemetry collector).
