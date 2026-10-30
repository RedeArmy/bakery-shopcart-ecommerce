/* =====================================================================
   Objeto   : dbo.FU_Coupons_Rejection
   Version  : 1.0.0
   Cambio   : Primera versión: error de negocio que corresponde a cada motivo por el que un cupón no se aplica
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Cero filas cuando el motivo es Valid. El mensaje empieza por el código estable de la API.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Coupons_Rejection (@Reason VARCHAR(20))
RETURNS TABLE
AS
RETURN
  -- El mapeo vive aquí, en un solo lugar, porque lo usan el carrito y la creación del pedido. El mensaje empieza por el
  -- código estable (COUPON_EXPIRED...) y el backend lo traduce a su texto en español; el número ya trae el estado HTTP.
  SELECT ErrorNumber = m.ErrorNumber, Message = m.Message
  FROM (VALUES
    ('NotFound',         50404, N'COUPON_NOT_FOUND: The coupon does not exist.'),
    ('Inactive',         50422, N'COUPON_INACTIVE: The coupon is not active.'),
    ('NotStarted',       50422, N'COUPON_NOT_STARTED: The coupon is not valid yet.'),
    ('Expired',          50422, N'COUPON_EXPIRED: The coupon has expired.'),
    ('Exhausted',        50409, N'COUPON_EXHAUSTED: The coupon has reached its usage limit.'),
    ('PerCustomerLimit', 50422, N'COUPON_ALREADY_USED: You have already used this coupon.'),
    ('NoEligibleItems',  50422, N'COUPON_NOT_APPLICABLE: No item of the cart is covered by this coupon.'),
    ('BelowMinimum',     50422, N'COUPON_MINIMUM_NOT_MET: The cart is below the minimum amount of this coupon.')
  ) AS m (Reason, ErrorNumber, Message)
  WHERE m.Reason = @Reason;
GO
