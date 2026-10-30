/* =====================================================================
   Migración : V0009 · Triggers y permisos
   Contenido : Inmutabilidad (solo inserción), transiciones de estado válidas, montos congelados,
               captura de DDL y permisos del login de la aplicación.
   Nota      : Son la segunda línea de defensa (ADR-0002): ni un procedimiento defectuoso puede
               saltarse estas reglas. Los mensajes usan el código 50422 (regla de negocio).
   ===================================================================== */
SET NOCOUNT ON;
GO

-- Tablas de solo inserción: se corrige con un registro nuevo, nunca editando el anterior
CREATE TRIGGER dbo.TR_AuditLog_Immutable ON dbo.AuditLog INSTEAD OF UPDATE, DELETE AS
BEGIN
  THROW 50422, 'The audit log cannot be modified or deleted.', 1;
END;
GO

CREATE TRIGGER dbo.TR_FinancialMovements_Immutable ON dbo.FinancialMovements INSTEAD OF UPDATE, DELETE AS
BEGIN
  THROW 50422, 'The financial ledger is append-only; use a compensating movement.', 1;
END;
GO

CREATE TRIGGER dbo.TR_InventoryMovements_Immutable ON dbo.InventoryMovements INSTEAD OF UPDATE, DELETE AS
BEGIN
  THROW 50422, 'The inventory ledger is append-only; use a compensating movement.', 1;
END;
GO

CREATE TRIGGER dbo.TR_OrderStatusHistory_Immutable ON dbo.OrderStatusHistory INSTEAD OF UPDATE, DELETE AS
BEGIN
  THROW 50422, 'The order status history cannot be modified or deleted.', 1;
END;
GO

CREATE TRIGGER dbo.TR_PaymentStatusHistory_Immutable ON dbo.PaymentStatusHistory INSTEAD OF UPDATE, DELETE AS
BEGIN
  THROW 50422, 'The payment status history cannot be modified or deleted.', 1;
END;
GO

-- Una transición de estado solo es válida si existe en la tabla de transiciones
CREATE TRIGGER dbo.TR_Orders_ValidateTransition ON dbo.Orders AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  IF UPDATE(IDOrderStatus) AND EXISTS (
      SELECT 1
      FROM inserted AS i
      JOIN deleted AS d ON d.IDOrder = i.IDOrder
      WHERE i.IDOrderStatus <> d.IDOrderStatus
        AND NOT EXISTS (SELECT 1 FROM dbo.OrderStatusTransitions AS t
                        WHERE t.IDFromStatus = d.IDOrderStatus AND t.IDToStatus = i.IDOrderStatus))
    THROW 50422, 'The order status transition is not allowed.', 1;
END;
GO

CREATE TRIGGER dbo.TR_Payments_ValidateTransition ON dbo.Payments AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  IF UPDATE(IDPaymentStatus) AND EXISTS (
      SELECT 1
      FROM inserted AS i
      JOIN deleted AS d ON d.IDPayment = i.IDPayment
      WHERE i.IDPaymentStatus <> d.IDPaymentStatus
        AND NOT EXISTS (SELECT 1 FROM dbo.PaymentStatusTransitions AS t
                        WHERE t.IDFromStatus = d.IDPaymentStatus AND t.IDToStatus = i.IDPaymentStatus))
    THROW 50422, 'The payment status transition is not allowed.', 1;
END;
GO

-- Montos congelados: las correcciones van por devolución o reembolso, no editando el pedido
CREATE TRIGGER dbo.TR_Orders_AmountsImmutable ON dbo.Orders AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  IF UPDATE(Subtotal) OR UPDATE(Discount) OR UPDATE(Shipping) OR UPDATE(Total) OR UPDATE(TaxableBase) OR UPDATE(Vat)
    THROW 50422, 'The amounts of an order are immutable; use a return or a refund.', 1;
END;
GO

-- De una línea solo puede cambiar ReturnedQuantity
CREATE TRIGGER dbo.TR_OrderLines_PricesImmutable ON dbo.OrderLines AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  IF UPDATE(UnitPrice) OR UPDATE(Quantity) OR UPDATE(LineDiscount) OR UPDATE(LineTotal)
    THROW 50422, 'The lines of an order are immutable.', 1;
END;
GO

CREATE TRIGGER dbo.TR_Payments_AmountImmutable ON dbo.Payments AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  IF UPDATE(Amount) OR UPDATE(Currency)
    THROW 50422, 'The amount of a payment is immutable.', 1;
END;
GO

-- Captura de DDL. Se limita al esquema dbo para no registrar los objetos temporales de tSQLt en el CI.
CREATE TRIGGER TR_Database_CaptureDdl ON DATABASE FOR
  CREATE_PROCEDURE, ALTER_PROCEDURE, DROP_PROCEDURE,
  CREATE_VIEW, ALTER_VIEW, DROP_VIEW,
  CREATE_FUNCTION, ALTER_FUNCTION, DROP_FUNCTION
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @event XML = EVENTDATA();
  IF @event.value('(/EVENT_INSTANCE/SchemaName)[1]', 'SYSNAME') = N'dbo'
    INSERT INTO dbo.DdlHistory (EventName, ObjectName, Definition, UserName)
    VALUES (
      @event.value('(/EVENT_INSTANCE/EventType)[1]', 'NVARCHAR(60)'),
      @event.value('(/EVENT_INSTANCE/ObjectName)[1]', 'SYSNAME'),
      @event.value('(/EVENT_INSTANCE/TSQLCommand/CommandText)[1]', 'NVARCHAR(MAX)'),
      @event.value('(/EVENT_INSTANCE/LoginName)[1]', 'SYSNAME'));
END;
GO

-- Permisos de la aplicación (ADR-0002): solo ejecuta procedimientos, ninguna tabla es accesible directamente.
-- El login lo crea la inicialización del contenedor; en el CI no existe y no hay nada que conceder.
IF DATABASE_PRINCIPAL_ID(N'shopcart_app') IS NOT NULL
BEGIN
  GRANT EXECUTE ON SCHEMA::dbo TO shopcart_app;
  DENY SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO shopcart_app;
END;
GO
