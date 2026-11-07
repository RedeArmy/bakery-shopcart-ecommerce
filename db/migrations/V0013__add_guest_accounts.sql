/* =====================================================================
   Migración : V0013__add_guest_accounts
   Cambio    : Cuentas de invitado. Quien compra sin registrarse recibe una cuenta sin contraseña (IsGuest = 1) que existe
               para que el carrito, la reserva, el pedido, el pago y la dirección sigan colgando de un IDUser: así toda la
               seguridad por propietario (el cliente solo ve lo suyo) funciona igual para un invitado que para un cliente.
   Forward   : Solo agrega columnas e índices y cambia la unicidad del correo; no borra datos.
   ===================================================================== */

ALTER TABLE dbo.Users ADD
  -- 1 = cuenta de invitado: sin contraseña, no inicia sesión por correo y su sesión nace con el carrito o el checkout
  IsGuest           BIT      NOT NULL CONSTRAINT DF_Users_IsGuest DEFAULT 0,
  -- SHA-256 en hexadecimal del código de recuperación del invitado; el código solo se muestra una vez y nunca se guarda
  GuestRecoveryHash CHAR(64) NULL;
GO

-- Un invitado solo puede ser cliente: los roles de personal no se crean sin contraseña
ALTER TABLE dbo.Users ADD CONSTRAINT CK_Users_GuestIsCustomer CHECK (IsGuest = 0 OR IDRole = 1);
GO

-- El correo deja de ser único para todos: sigue siéndolo entre las cuentas reales, pero varios invitados pueden comprar con
-- el mismo correo (cada compra sin registro es una cuenta de invitado aparte) y un cliente puede registrarse después con el
-- correo que usó como invitado.
ALTER TABLE dbo.Users DROP CONSTRAINT UQ_Users_Email;
GO

CREATE UNIQUE INDEX UX_Users_Email_Accounts ON dbo.Users (Email) WHERE IsGuest = 0;
GO

-- La recuperación del pedido y el límite de cupones por correo buscan invitados por su correo
CREATE INDEX IX_Users_Email_Guests ON dbo.Users (Email) WHERE IsGuest = 1;
GO
