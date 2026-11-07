/* =====================================================================
   Objeto   : dbo.SP_Branches_Deactivate
   Version  : 1.0.0
   Cambio   : Primera versión: "elimina" una sucursal desactivándola (nunca se borra, los pedidos la citan)
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Nueva. Idempotente. Errores: 50400, 50404, 50422 actor sin permiso o BRANCH_HAS_OPEN_ORDERS.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Branches_Deactivate
  @IDActor  INT,
  @IDBranch INT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDActor IS NULL OR @IDBranch IS NULL
    THROW 50400, 'IDActor and IDBranch are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the branches.', 1;

  DECLARE @IsActive BIT = (SELECT IsActive FROM dbo.Branches WITH (UPDLOCK, ROWLOCK) WHERE IDBranch = @IDBranch);
  IF @IsActive IS NULL
    THROW 50404, 'Branch not found.', 1;

  -- Desactivar es idempotente: repetirlo no es un error ni deja otra entrada en la bitácora
  IF @IsActive = 1
  BEGIN
    -- Cerrarla con clientes esperando recoger dejaría pedidos pagados sin dónde entregarse
    IF EXISTS (SELECT 1 FROM dbo.Orders WHERE IDBranch = @IDBranch AND IDOrderStatus IN (1, 2, 3, 4))
      THROW 50422, 'BRANCH_HAS_OPEN_ORDERS: The branch still has orders waiting to be picked up.', 1;

    UPDATE dbo.Branches SET IsActive = 0, UpdatedAt = SYSUTCDATETIME() WHERE IDBranch = @IDBranch;

    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDBranch AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Branches', @EntityName = N'Branch', @EntityKey = @EntityKey, @Action = N'Deactivate',
         @PreviousValue = N'{"IsActive":true}', @NewValue = N'{"IsActive":false}', @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
