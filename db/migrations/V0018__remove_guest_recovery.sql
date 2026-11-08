/* =====================================================================
   Migración : V0018__remove_guest_recovery
   Cambio    : Se retira la recuperación de pedidos del invitado con correo y código. Ya no hay a quién servir: el checkout dejó
               de emitir el código y cualquier persona, con o sin cuenta, consulta su pedido con el número y el correo
               (SP_Orders_Track). Se quitan los dos procedimientos y la columna que guardaba el hash del código.
   Forward   : Borra la columna Users.GuestRecoveryHash y con ella los hashes que hubiera; no son un dato de negocio (un hash
               de un código que ya nadie puede presentar) y los pedidos, los invitados y sus correos no cambian.
   ===================================================================== */

DROP PROCEDURE IF EXISTS dbo.SP_Users_SetRecoveryCode;
GO

DROP PROCEDURE IF EXISTS dbo.SP_Users_FindGuestsByEmail;
GO

ALTER TABLE dbo.Users DROP COLUMN GuestRecoveryHash;
GO

-- El runner lleva el registro de los objetos programables vigentes: al retirar los dos procedimientos dejan de estar vigentes,
-- si no `db:verify` los daría por faltantes. El historial de sus versiones se conserva.
UPDATE dbo.ObjectVersions
SET IsCurrent = 0
WHERE ObjectName IN (N'dbo.SP_Users_SetRecoveryCode', N'dbo.SP_Users_FindGuestsByEmail') AND IsCurrent = 1;
GO
