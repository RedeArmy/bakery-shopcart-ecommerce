# Application layer of orders

**Responsibility:** Use cases (one folder each under use-cases/), ports (inbound and outbound) and DTOs.

**May contain:** Orchestration that depends on ports and on the domain.

**Must not contain:** Imports from infrastructure or presentation, and any direct database or HTTP code.

**Governing ADR:** [0001](../../../../../docs/adr/0001-modular-monolith-with-vertical-slices.md)
