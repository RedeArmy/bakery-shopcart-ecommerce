# C4 · Backend components

```mermaid
flowchart TB
  subgraph platform["platform"]
    http["http<br/>app, request id, errors, health"]
    idem["idempotency<br/>middleware + port"]
    rate["rate-limit<br/>policies + port"]
    dbp["db<br/>pool, execute-procedure, error mapping"]
    jobs["jobs<br/>expiry, purges, reconciliation"]
    storage["storage<br/>FileStoragePort + local disk"]
  end
  subgraph modules["modules (each: presentation, application, domain, infrastructure)"]
    auth
    catalogue
    cart
    checkout
    inventory
    coupons
    orders
    payments
    dashboard
    audit
    users
  end
  kernel["shared-kernel<br/>Money, rounding, Result, AppError, Clock"]
  root["composition-root.ts<br/>wires concrete classes"]

  http --> idem
  http --> rate
  modules -->|infrastructure only| dbp
  payments --> storage
  jobs --> payments
  jobs --> inventory
  modules --> kernel
  platform --> kernel
  root --> modules
  root --> platform
```

Modules communicate only through each other's `index.ts`. For example `checkout` uses the public surface of `inventory`, `coupons` and `payments`.
