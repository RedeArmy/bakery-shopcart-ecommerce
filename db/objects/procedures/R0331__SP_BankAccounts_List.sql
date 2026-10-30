/* =====================================================================
   Objeto   : dbo.SP_BankAccounts_List
   Version  : 1.0.0
   Cambio   : Primera versión: cuentas bancarias donde el cliente puede depositar
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva (el borrador del catálogo la llamaba SP_BankAccounts_ListActive). Por defecto solo las activas.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_BankAccounts_List
  @IncludeInactive BIT = 0
AS
BEGIN
  SET NOCOUNT ON;

  SELECT IDBankAccount, BankName, AccountType, AccountNumber, HolderName, Currency, Instructions, IsActive
  FROM dbo.BankAccounts
  WHERE IsActive = 1 OR ISNULL(@IncludeInactive, 0) = 1
  ORDER BY BankName, IDBankAccount;
END;
GO
