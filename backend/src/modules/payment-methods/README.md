# Module: payment methods

**Responsibility:** administrator maintenance of the payment methods offered at the checkout (deposit or cash, and for which way of receiving the order). Light treatment: controller to repository, the rules live in the `SP_PaymentMethods_*` procedures.

**May contain:** The four layer folders and the module public surface (index.ts).

**Must not contain:** Imports of other modules except through their index.ts.

**Governing ADR:** [0001](../../../../docs/adr/0001-modular-monolith-with-vertical-slices.md)
