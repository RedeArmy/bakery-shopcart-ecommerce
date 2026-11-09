/* =====================================================================
   Objeto   : dbo.SP_Payments_ListCash
   Version  : 1.0.0
   Cambio   : Primera versión: los pagos en efectivo, para que quien atiende en la sucursal encuentre el pedido que el cliente viene a pagar y
              confirme el cobro (SP_Payments_ConfirmCash)
   Autor    : Equipo ShopCart   Fecha: 2026-11-08
   Compat   : Nueva. Por defecto lista los pendientes (estado 1), los que vencen antes primero; con otro estado sirve de historial, del más
              reciente al más antiguo. @Search es texto literal (CHARINDEX, no un patrón) y busca en el número de pedido y en el nombre y el
              correo del cliente. Errores: 50400 paginación inválida.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_ListCash
  @IDPaymentStatus TINYINT       = 1,
  @Search          NVARCHAR(100) = NULL,
  @PageNumber      INT           = 1,
  @PageSize        INT           = 20
AS
BEGIN
  SET NOCOUNT ON;

  IF @PageNumber < 1 OR @PageSize < 1 OR @PageSize > 100
    THROW 50400, 'PageNumber must be at least 1 and PageSize between 1 and 100.', 1;

  SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');

  -- La página se guarda aparte y el total se cuenta una vez, como en la cola de depósitos. Los pendientes se atienden por vencimiento
  -- (lo que caduca antes, primero) y entran por el índice (estado, vencimiento) de los pagos; el historial, del más reciente. El efectivo
  -- se reconoce por la clase del método, no por su identificador.
  DECLARE @Page TABLE (Position INT IDENTITY(1,1) PRIMARY KEY, IDPayment INT NOT NULL);
  DECLARE @Total INT;

  IF @Search IS NULL
  BEGIN
    SELECT @Total = COUNT(*)
    FROM dbo.Payments AS p
    WHERE p.IDPaymentStatus = @IDPaymentStatus
      AND p.IDPaymentMethod IN (SELECT IDPaymentMethod FROM dbo.PaymentMethods WHERE Kind = N'Cash');

    INSERT INTO @Page (IDPayment)
    SELECT p.IDPayment
    FROM dbo.Payments AS p
    WHERE p.IDPaymentStatus = @IDPaymentStatus
      AND p.IDPaymentMethod IN (SELECT IDPaymentMethod FROM dbo.PaymentMethods WHERE Kind = N'Cash')
    ORDER BY CASE WHEN @IDPaymentStatus = 1 THEN p.ExpiresAt END ASC,
             CASE WHEN @IDPaymentStatus <> 1 THEN p.IDPayment END DESC,
             p.IDPayment ASC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
  END
  ELSE
  BEGIN
    -- Buscar texto obliga a mirar el pedido y el cliente de cada pago del estado; el JOIN por hash los lee una vez cada uno en lugar de
    -- buscar el pedido de cada pago por separado (como en SP_Orders_List y en la cola de depósitos)
    SELECT @Total = COUNT(*)
    FROM dbo.Payments AS p
    JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
    JOIN dbo.Users AS u ON u.IDUser = o.IDUser
    WHERE p.IDPaymentStatus = @IDPaymentStatus
      AND p.IDPaymentMethod IN (SELECT IDPaymentMethod FROM dbo.PaymentMethods WHERE Kind = N'Cash')
      AND (CHARINDEX(@Search, o.OrderNumber) > 0 OR CHARINDEX(@Search, u.Email) > 0 OR CHARINDEX(@Search, u.FullName) > 0)
    OPTION (RECOMPILE, HASH JOIN);

    INSERT INTO @Page (IDPayment)
    SELECT p.IDPayment
    FROM dbo.Payments AS p
    JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
    JOIN dbo.Users AS u ON u.IDUser = o.IDUser
    WHERE p.IDPaymentStatus = @IDPaymentStatus
      AND p.IDPaymentMethod IN (SELECT IDPaymentMethod FROM dbo.PaymentMethods WHERE Kind = N'Cash')
      AND (CHARINDEX(@Search, o.OrderNumber) > 0 OR CHARINDEX(@Search, u.Email) > 0 OR CHARINDEX(@Search, u.FullName) > 0)
    ORDER BY CASE WHEN @IDPaymentStatus = 1 THEN p.ExpiresAt END ASC,
             CASE WHEN @IDPaymentStatus <> 1 THEN p.IDPayment END DESC,
             p.IDPayment ASC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY
    OPTION (RECOMPILE, HASH JOIN);
  END;

  SELECT p.IDPayment, p.IDOrder, o.OrderNumber, CustomerName = u.FullName, CustomerEmail = u.Email,
         Amount = CAST(p.Amount AS VARCHAR(25)), p.IDPaymentStatus, StatusName = s.Name,
         o.PickupBranchName, o.RequestedDeliveryDate, p.ExpiresAt, p.CreatedAt,
         TotalCount = @Total
  FROM @Page AS pg
  JOIN dbo.Payments AS p ON p.IDPayment = pg.IDPayment
  JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
  JOIN dbo.Users AS u ON u.IDUser = o.IDUser
  JOIN dbo.PaymentStatuses AS s ON s.IDPaymentStatus = p.IDPaymentStatus
  ORDER BY pg.Position;
END;
GO
