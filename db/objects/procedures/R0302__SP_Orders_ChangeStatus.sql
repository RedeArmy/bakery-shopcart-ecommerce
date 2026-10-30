/* =====================================================================
   Objeto   : dbo.SP_Orders_ChangeStatus
   Version  : 1.0.0
   Cambio   : Primera versión: el operador avanza el pedido por la preparación, el despacho y la entrega
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Solo mueve a InPreparation (3), Dispatched (4) o Delivered (5). El pago, la cancelación y las devoluciones
              tienen su propio procedimiento porque llevan efectos sobre dinero y existencias. Errores: 50400, 50404,
              50422 actor sin permiso o INVALID_STATE_TRANSITION.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Orders_ChangeStatus
  @IDActor   INT,
  @IDOrder   INT,
  @NewStatus TINYINT,
  @Comment   NVARCHAR(250) = NULL,
  @Now       DATETIME2(3)  = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDActor IS NULL OR @IDOrder IS NULL OR @NewStatus IS NULL
    THROW 50400, 'IDActor, IDOrder and NewStatus are required.', 1;
  -- Los demás estados tienen efectos que este procedimiento no sabe aplicar: llegar a ellos por aquí dejaría el dinero o el stock sin mover
  IF @NewStatus NOT IN (3, 4, 5)
    THROW 50422, 'INVALID_STATE_TRANSITION: Only InPreparation, Dispatched and Delivered are set here; payment, cancellation and returns have their own procedures.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SET @Comment = LEFT(LTRIM(RTRIM(@Comment)), 250);

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE IDUser = @IDActor AND IDRole IN (2, 3) AND IsActive = 1)
    THROW 50422, 'Only an active operator or administrator can change the status of an order.', 1;

  -- El bloqueo serializa a dos operadores sobre el mismo pedido: el segundo ve el estado ya cambiado y su transición deja de ser válida
  DECLARE @Current TINYINT;
  SELECT @Current = IDOrderStatus FROM dbo.Orders WITH (UPDLOCK, ROWLOCK) WHERE IDOrder = @IDOrder;
  IF @Current IS NULL
    THROW 50404, 'Order not found.', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.OrderStatusTransitions WHERE IDFromStatus = @Current AND IDToStatus = @NewStatus)
    THROW 50422, 'INVALID_STATE_TRANSITION: The order cannot move from its current status to the requested one.', 1;

  UPDATE dbo.Orders SET IDOrderStatus = @NewStatus WHERE IDOrder = @IDOrder;
  INSERT INTO dbo.OrderStatusHistory (IDOrder, IDPreviousStatus, IDNewStatus, IDUser, CreatedAt, Comment)
  VALUES (@IDOrder, @Current, @NewStatus, @IDActor, @Now, @Comment);

  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDOrder AS NVARCHAR(40));
  DECLARE @Previous NVARCHAR(MAX) = CONCAT(N'{"IDOrderStatus":', @Current, N'}');
  DECLARE @New NVARCHAR(MAX) = CONCAT(N'{"IDOrderStatus":', @NewStatus, N'}');
  EXEC dbo.SP_Audit_Record @Module = N'Orders', @EntityName = N'Order', @EntityKey = @EntityKey, @Action = N'StatusChange',
       @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
