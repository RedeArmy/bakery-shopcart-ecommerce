# ADR-0028: Branches, pickup and a delivery date defined by the system

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The checkout asked the customer for a delivery address and a delivery date. The owner decided that an order can also be **picked up in a branch**, that an administrator maintains the branches (adds and removes them), and that the customer **no longer chooses the date**: the system defines it and the screens say that it is an estimate that can move a few days either way.

Two constraints from the brief shape the answer. A record that other records cite is not deleted physically (RF-02 says it for products, and the same reasoning holds for branches: past orders cite them). And the date was also what limited the deposit (`FU_Payments_DepositWindow`): a same-day delivery leaves no time to pay by deposit, so a date "defined by the system" cannot simply be today.

## Decision

- **Branches are a table maintained through stored procedures** (`SP_Branches_List/Create/Update/Deactivate`, migration V0015), with the same shape as the categories: only an active administrator writes, the audit log records the previous and the new value, and "removing" is deactivating.
- **A branch with orders still waiting cannot be deactivated** (`BRANCH_HAS_OPEN_ORDERS`): closing it would leave paid orders without a place to be collected. A deactivated branch frees its name, through a filtered unique index.
- **An order is a delivery or a pickup, never both.** `Orders.FulfilmentType` with `CK_Orders_Fulfilment`: a delivery has the complete address and no branch; a pickup has its branch and no address. The five address columns become nullable. The order keeps a frozen copy of the branch (name and address), like it does with the address.
- **The date is defined by the system**: `FU_Checkout_EstimatedDeliveryDate` returns the first date that respects the lead time of the most demanding product of the cart and leaves time to pay by deposit. The checkout stops sending a date; `SP_Orders_CreateOrder` and `SP_Payments_GetMethodsAndWindow` take it as optional and compute the same estimate, so the price, the stock and the date are all decided in the database. A date sent by an older caller is still validated against the lead time.
- **The checkout offers the choice as a dropdown**: "Home delivery" or "Pick up at <branch>". A pickup asks for no address; a delivery shows the address section as before. The address and the personalisation are collapsible sections.

## Consequences

- One migration, five new procedures (four for branches and a function) and changes to three existing ones; the existing callers keep working because every new parameter has a default.
- The estimate is a promise of nothing: the screens say so. The business can move it by changing the configuration (`MinDepositHours`, the lead time of the products) without touching the clients.
- Pickup orders use the same stock, payment and cancellation flows; only the place changes.
- There is no opening-hours logic: the hours are free text for the customer.

## Alternatives considered

- **Delete a branch physically.** Rejected: past orders cite it, and the brief asks to keep what has sales.
- **Let the customer still pick a date and only suggest one.** Rejected by the owner: the kitchen decides when the order is ready.
- **Keep the date in the client and send it.** Rejected: the client would have to know the lead times and the deposit window, which are business rules.
