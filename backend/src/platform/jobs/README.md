# Platform: jobs

**Responsibility:** Scheduled jobs (payment expiry, purges, reconciliation), each guarded by sp_getapplock.

**May contain:** Job definitions that call use cases.

**Must not contain:** Direct SQL.

**Governing ADR:** [0001](../../../../docs/adr/0001-modular-monolith-with-vertical-slices.md)
