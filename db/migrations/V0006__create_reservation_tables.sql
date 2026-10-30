/* =====================================================================
   Migración : V0006 · Reservas de existencias
   Contenido : Reservations, ReservationLines
   ===================================================================== */
SET NOCOUNT ON;

-- La reserva retiene existencias con vencimiento, sin tocar el libro de inventario (ADR-0007)
CREATE TABLE dbo.Reservations (
  IDReservation INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Reservations PRIMARY KEY,
  IDCart        INT               NOT NULL CONSTRAINT FK_Reservations_Carts REFERENCES dbo.Carts (IDCart),
  IDUser        INT               NOT NULL CONSTRAINT FK_Reservations_Users REFERENCES dbo.Users (IDUser),
  -- Se liga al pedido cuando el checkout se confirma
  IDOrder       INT               NULL CONSTRAINT FK_Reservations_Orders REFERENCES dbo.Orders (IDOrder),
  Status        NVARCHAR(12)      NOT NULL CONSTRAINT CK_Reservations_Status CHECK (Status IN ('Active', 'Consumed', 'Released', 'Expired')),
  CreatedAt     DATETIME2(3)      NOT NULL CONSTRAINT DF_Reservations_CreatedAt DEFAULT SYSUTCDATETIME(),
  ExpiresAt     DATETIME2(3)      NOT NULL
);
-- El job de expiración busca por estado y vencimiento cada 60 segundos
CREATE INDEX IX_Reservations_Expiry ON dbo.Reservations (Status, ExpiresAt);
CREATE INDEX IX_Reservations_Order ON dbo.Reservations (IDOrder) WHERE IDOrder IS NOT NULL;

CREATE TABLE dbo.ReservationLines (
  IDReservation INT NOT NULL CONSTRAINT FK_ReservationLines_Reservations REFERENCES dbo.Reservations (IDReservation),
  IDVariant     INT NOT NULL CONSTRAINT FK_ReservationLines_Variants REFERENCES dbo.Variants (IDVariant),
  Quantity      INT NOT NULL CONSTRAINT CK_ReservationLines_Quantity CHECK (Quantity > 0),
  CONSTRAINT PK_ReservationLines PRIMARY KEY (IDReservation, IDVariant)
);
