# Presentation layer of inventory

**Responsibility:** Routes, controllers, zod request schemas and response mappers.

**May contain:** Thin HTTP adapters that call use cases.

**Must not contain:** Business logic and any import from infrastructure.

**Governing ADR:** [0001](../../../../../docs/adr/0001-modular-monolith-with-vertical-slices.md)
