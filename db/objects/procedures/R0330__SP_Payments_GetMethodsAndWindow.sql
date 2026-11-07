/* =====================================================================
   Objeto   : dbo.SP_Payments_GetMethodsAndWindow
   Version  : 1.1.0
   Cambio   : Primera versión: qué ofrece el depósito para la fecha de entrega elegida y cuándo vence
   Cambio 1.1.0: la fecha ya no la elige el cliente. Sin @DeliveryDate se evalúa la fecha estimada que define el sistema
              (FU_Checkout_EstimatedDeliveryDate) y se devuelve como EstimatedDeliveryDate.
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Con @DeliveryDate se comporta como en 1.0.0 (más la columna EstimatedDeliveryDate). Una sola fila. La tarjeta no se decide aquí: depende de las credenciales del proveedor, que solo conoce
              el backend. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_GetMethodsAndWindow
  @IDUser       INT,
  @DeliveryDate DATE         = NULL,
  @Now          DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDUser IS NULL
    THROW 50400, 'IDUser is required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  -- La anticipación la marca el producto que más tiempo necesita del carrito activo de la persona
  DECLARE @LeadDays TINYINT = ISNULL((
    SELECT MAX(p.LeadTimeDays)
    FROM dbo.Carts AS c
    JOIN dbo.CartItems AS ci ON ci.IDCart = c.IDCart
    JOIN dbo.Variants AS v ON v.IDVariant = ci.IDVariant
    JOIN dbo.Products AS p ON p.IDProduct = v.IDProduct
    WHERE c.IDUser = @IDUser AND c.Status = N'Active'), 0);
  DECLARE @LocalToday DATE = CAST(((@Now AT TIME ZONE 'UTC') AT TIME ZONE 'Central America Standard Time') AS DATE);
  DECLARE @MinDepositHours INT = ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'MinDepositHours'), 2);

  -- La fecha de entrega o recogida la define el sistema: la primera que respeta la anticipación y deja tiempo para pagar
  DECLARE @Estimated DATE = ISNULL((SELECT EstimatedDate FROM dbo.FU_Checkout_EstimatedDeliveryDate(@LeadDays, @Now)),
                                   DATEADD(DAY, @LeadDays, @LocalToday));
  DECLARE @Evaluated DATE = ISNULL(@DeliveryDate, @Estimated);

  SELECT LeadTimeDays = @LeadDays,
         DeliveryDate = @Evaluated,
         EstimatedDeliveryDate = @Estimated,
         EarliestDeliveryDate = DATEADD(DAY, @LeadDays, @LocalToday),
         DeliveryDateAllowed = CAST(CASE WHEN @Evaluated >= DATEADD(DAY, @LeadDays, @LocalToday) THEN 1 ELSE 0 END AS BIT),
         DepositDeadlineAt = w.DeadlineAt,
         w.MinutesAvailable,
         MinDepositHours = @MinDepositHours,
         DepositAvailable = CAST(CASE WHEN @Evaluated >= DATEADD(DAY, @LeadDays, @LocalToday)
                                       AND w.MinutesAvailable >= @MinDepositHours * 60 THEN 1 ELSE 0 END AS BIT)
  FROM dbo.FU_Payments_DepositWindow(@Evaluated, @LeadDays, @Now) AS w;
END;
GO
