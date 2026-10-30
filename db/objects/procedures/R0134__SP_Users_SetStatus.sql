/* =====================================================================
   Objeto   : dbo.SP_Users_SetStatus
   Version  : 1.0.0
   Cambio   : Primera versión: activa o desactiva una cuenta (una cuenta nunca se borra)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404 cuenta inexistente, 50422 actor sin permiso o autodesactivación.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_SetStatus
  @IDActor  INT,
  @IDUser   INT,
  @IsActive BIT,
  @Now      DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDActor IS NULL OR @IDUser IS NULL OR @IsActive IS NULL
    THROW 50400, 'IDActor, IDUser and IsActive are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- El control de roles es del middleware, pero un cambio de estado es demasiado delicado para depender solo de él
  IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE IDUser = @IDActor AND IDRole = 3 AND IsActive = 1)
    THROW 50422, 'Only an active administrator can change the status of an account.', 1;

  DECLARE @CurrentlyActive BIT = (SELECT IsActive FROM dbo.Users WITH (UPDLOCK, ROWLOCK) WHERE IDUser = @IDUser);
  IF @CurrentlyActive IS NULL
    THROW 50404, 'User not found.', 1;

  -- Un administrador que se desactiva a sí mismo dejaría el sistema sin quien pueda reactivarlo
  IF @IDActor = @IDUser AND @IsActive = 0
    THROW 50422, 'You cannot deactivate your own account.', 1;

  IF @CurrentlyActive <> @IsActive
  BEGIN
    -- Al reactivar se limpia el bloqueo; al desactivar se revocan todas las sesiones, porque un token de refresco
    -- vigente permitiría seguir operando con una cuenta que ya no debe poder entrar
    UPDATE dbo.Users
    SET IsActive = @IsActive,
        FailedAttempts = CASE WHEN @IsActive = 1 THEN 0 ELSE FailedAttempts END,
        LockedUntil = CASE WHEN @IsActive = 1 THEN NULL ELSE LockedUntil END
    WHERE IDUser = @IDUser;

    IF @IsActive = 0
      UPDATE dbo.RefreshTokens SET RevokedAt = @Now WHERE IDUser = @IDUser AND RevokedAt IS NULL;

    DECLARE @Previous NVARCHAR(100) = CONCAT(N'{"IsActive":', CASE WHEN @CurrentlyActive = 1 THEN N'true' ELSE N'false' END, N'}');
    DECLARE @New NVARCHAR(100) = CONCAT(N'{"IsActive":', CASE WHEN @IsActive = 1 THEN N'true' ELSE N'false' END, N'}');
    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDUser AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Users', @EntityName = N'User', @EntityKey = @EntityKey, @Action = N'StatusChange',
         @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
