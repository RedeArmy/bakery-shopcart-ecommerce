# Infrastructure layer of checkout

**Responsibility:** Adapters that implement the ports: stored-procedure repositories, gateways and storage.

**May contain:** The only code in the module that calls platform/db/execute-procedure.ts.

**Must not contain:** Business rules (they belong in the domain or in the stored procedures).

**Governing ADR:** [0002](../../../../../docs/adr/0002-critical-rules-in-stored-procedures-and-checks.md)
