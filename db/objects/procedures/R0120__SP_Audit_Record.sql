/* =====================================================================
   Objeto   : dbo.SP_Audit_Record
   Version  : 1.0.0
   Cambio   : Primera versión: única vía para escribir en AuditLog (uso interno de otros procedimientos)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400 parámetro inválido. Debe llamarse dentro de la transacción del cambio auditado.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Audit_Record
  @Module        NVARCHAR(30),
  @EntityName    NVARCHAR(50),
  @EntityKey     NVARCHAR(40),
  @Action        NVARCHAR(20),
  @PreviousValue NVARCHAR(MAX)    = NULL,
  @NewValue      NVARCHAR(MAX)    = NULL,
  @IDUser        INT              = NULL,
  @IDCorrelation UNIQUEIDENTIFIER = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  -- Se valida aquí y no se deja a las restricciones de la tabla: así el llamador recibe el mismo código 50400 que en el
  -- resto de procedimientos y no un error 547 que habría que interpretar
  IF ISNULL(LTRIM(RTRIM(@Module)), N'') = N'' OR ISNULL(LTRIM(RTRIM(@EntityName)), N'') = N'' OR ISNULL(LTRIM(RTRIM(@EntityKey)), N'') = N''
    THROW 50400, 'Module, EntityName and EntityKey are required.', 1;

  IF @Action IS NULL OR @Action NOT IN (N'Create', N'Update', N'Deactivate', N'StatusChange')
    THROW 50400, 'Action must be Create, Update, Deactivate or StatusChange.', 1;

  IF (@PreviousValue IS NOT NULL AND ISJSON(@PreviousValue) = 0) OR (@NewValue IS NOT NULL AND ISJSON(@NewValue) = 0)
    THROW 50400, 'PreviousValue and NewValue must be valid JSON.', 1;

  INSERT INTO dbo.AuditLog (Module, EntityName, EntityKey, Action, PreviousValue, NewValue, IDUser, IDCorrelation)
  VALUES (@Module, @EntityName, @EntityKey, @Action, @PreviousValue, @NewValue, @IDUser, @IDCorrelation);
END;
GO
