# ADR-0031: Packagings share one stock measured in units

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Every variant kept its own stock. A bakery sells the same pieces in several packagings: the champurradas by the dozen and, now, by the bag of 6. With one stock per variant, the dozen and the bag were two independent piles that nobody could convert into each other, and nothing said how many pieces a dozen holds. The owner asked for three things:

- add a packaging (a bag of 6) to a product that is sold by the dozen, and stop selling one (only the bag of 6 from now on);
- show the stock in units and in packs: 54 units are 9 bags of 6, and 50 units are 8 bags because the rest does not make a whole pack;
- keep working with everything built on top of the stock: carts, reservations, orders, payments, returns, the ledger and the reconciliation.

The stock is the most sensitive data of the shop: the reservation is atomic and lock-ordered to avoid both overselling and deadlocks (ADR-0007), and a view proves that counters, ledger and reservations agree. Any change has to keep those guarantees.

## Decision

We will measure the stock in **units** and let several variants of a product **draw from the same stock**, instead of moving the stock out of `Variants`.

- **Two columns on `Variants`** (migration V0019). `UnitsPerPack` (1 to 1000, default 1) is how many units one pack of the variant holds. `IDStockVariant` points to the variant of the same product that **holds** the stock this one draws from, or is NULL when the variant holds its own. A computed, persisted and indexed column, `IDStockHolder = COALESCE(IDStockVariant, IDVariant)`, gives every procedure the same join. A variant that draws from another holds no stock or reservation of its own (`CK_Variants_SharedHoldsNoStock`).
- **Existing data is untouched.** Every variant that existed has `UnitsPerPack = 1` and holds its own stock, so it behaves as before and the 651 earlier database tests pass unchanged.
- **Quantities of the lines are packs; the stock is units.** A cart line, a reservation line and an order line count packs of a variant. Reserving, paying, cancelling and returning multiply the packs by `UnitsPerPack` and act on the **holder**, so a bag of 6 and a dozen in the same cart add their units before they are compared with what there is. The ledger, the entries and the counts are of the holder and in units; the API accepts any variant of the product to say which stock it means.
- **Packs are derived, never stored.** The packs of a variant are the free units divided by `UnitsPerPack`, rounded down; the rest is "loose units" that do not make a whole pack. `FU_Cart_AvailableStock`, the cart, the product detail and the catalogue search all use that one formula. The detail also says the packs on hand (`onHandPacks`) and the loose units (`looseUnits`). Searching a product reports the most packs of one of its active variants, not the sum, because they share their units.
- **The locks stay ordered.** Every procedure that locks stock now locks the **holder** rows in ascending identifier order, the same order as before, so two carts cannot wait for each other in a circle.
- **Adding and removing a packaging need no new operation.** Adding is `POST /admin/variants` with `unitsPerPack` and `stockVariantId`; the holder must be a variant of the same product that holds its own stock (a packaging cannot draw from another packaging). Removing is deactivating the variant, which never touches the stock: even the holder can stop being sold and keep holding the units for the other packagings. `UnitsPerPack` cannot be edited afterwards, because reservations already counted in units with the old size; a different size is a new packaging.
- **The administration shows what the shop sells.** The inventory screen groups the variants that share a stock, says the units and the packs of each (with the loose units when there are some), adds a packaging with its units, stops and resumes selling one, and the product dialog can create a product whose packagings share one stock from the start. The product page says how many units a pack holds and counts packs.

## Consequences

- The reservation, the payment, the cancellation and the return are the only places where units and packs meet, and they are covered by 24 new tSQLt tests (pool sharing, 54 and 50 units, mixed packs in one cart, expired and released reservations, a paid order, a cancellation, a return, the reconciliation) and an HTTP flow. The real-concurrency suite still holds.
- `onHandStock` of a variant is now the shared stock in units, and `available` is packs; both are documented in the OpenAPI contract. A client written before this decision keeps working for every variant that does not share stock.
- A product can end with an inactive variant that holds the stock for the active ones. It is deliberate (the units must stay somewhere) and the screens hide it behind "stock shared by its packagings".
- Mixing units with other kinds of measure (weight, volume) is not covered: the unit is a piece. The demo shop now sells the champurradas, and the other bread by the bag of 6 and the dozen, from one stock each.
