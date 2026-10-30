/* =====================================================================
   Objeto   : dbo.SP_Payments_GetMethodsAndWindow
   Version  : 1.0.0
   Cambio   : Primera versión: qué ofrece el depósito para la fecha de entrega elegida y cuándo vence
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una sola fila. La tarjeta no se decide aquí: depende de las credenciales del proveedor, que solo conoce
              el backend. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_GetMethodsAndWindow
  @IDUser       INT,
  @DeliveryDate DATE,
  @Now          DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDUser IS NULL OR @DeliveryDate IS NULL
    THROW 50400, 'IDUser and DeliveryDate are required.', 1;

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

  SELECT LeadTimeDays = @LeadDays,
         EarliestDeliveryDate = DATEADD(DAY, @LeadDays, @LocalToday),
         DeliveryDateAllowed = CAST(CASE WHEN @DeliveryDate >= DATEADD(DAY, @LeadDays, @LocalToday) THEN 1 ELSE 0 END AS BIT),
         DepositDeadlineAt = w.DeadlineAt,
         w.MinutesAvailable,
         MinDepositHours = @MinDepositHours,
         DepositAvailable = CAST(CASE WHEN @DeliveryDate >= DATEADD(DAY, @LeadDays, @LocalToday)
                                       AND w.MinutesAvailable >= @MinDepositHours * 60 THEN 1 ELSE 0 END AS BIT)
  FROM dbo.FU_Payments_DepositWindow(@DeliveryDate, @LeadDays, @Now) AS w;
END;
GO
