/* =====================================================================
   Objeto   : Test_AllowedActions (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : dbo.FU_Orders_AllowedActions: qué puede hacer cada rol con un pedido en cada estado, y que coincida con el grafo de
              transiciones de la semilla
   Autor    : Equipo ShopCart   Fecha: 2026-11-09
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). Las transiciones son las de la semilla S0002, sin FakeTable:
              lo que se comprueba es justamente que la función y la semilla no se contradicen.
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_AllowedActions';
GO

-- Las acciones que puede tomar el rol, en orden y separadas por coma («Cancel,Prepare»); vacío si ninguna
CREATE FUNCTION Test_AllowedActions.Allowed (@Status TINYINT, @Fulfilment NVARCHAR(10), @Role TINYINT) RETURNS NVARCHAR(100)
AS
BEGIN
    RETURN ISNULL((SELECT STRING_AGG(Action, N',') WITHIN GROUP (ORDER BY Action)
                   FROM dbo.FU_Orders_AllowedActions(@Status, @Fulfilment, @Role) WHERE Allowed = 1), N'');
END;
GO

-- Las que el estado permite pero el rol no puede por estar reservadas al operador
CREATE FUNCTION Test_AllowedActions.Reserved (@Status TINYINT, @Fulfilment NVARCHAR(10), @Role TINYINT) RETURNS NVARCHAR(100)
AS
BEGIN
    RETURN ISNULL((SELECT STRING_AGG(Action, N',') WITHIN GROUP (ORDER BY Action)
                   FROM dbo.FU_Orders_AllowedActions(@Status, @Fulfilment, @Role) WHERE Allowed = 0 AND OperatorOnly = 1), N'');
END;
GO

CREATE PROCEDURE Test_AllowedActions.[test an order waiting for payment can only be cancelled, by its customer or by the staff]
AS
BEGIN
    DECLARE @Customer NVARCHAR(100) = Test_AllowedActions.Allowed(1, N'Delivery', 1);
    DECLARE @Operator NVARCHAR(100) = Test_AllowedActions.Allowed(1, N'Pickup', 2);
    DECLARE @Administrator NVARCHAR(100) = Test_AllowedActions.Allowed(1, N'Delivery', 3);
    EXEC tSQLt.AssertEqualsString @Expected = N'Cancel', @Actual = @Customer;
    EXEC tSQLt.AssertEqualsString @Expected = N'Cancel', @Actual = @Operator;
    EXEC tSQLt.AssertEqualsString @Expected = N'Cancel', @Actual = @Administrator;
END;
GO

CREATE PROCEDURE Test_AllowedActions.[test a paid order is prepared by the staff, and cancelled by them or by its customer]
AS
BEGIN
    DECLARE @Customer NVARCHAR(100) = Test_AllowedActions.Allowed(2, N'Delivery', 1);
    DECLARE @Operator NVARCHAR(100) = Test_AllowedActions.Allowed(2, N'Delivery', 2);
    DECLARE @Administrator NVARCHAR(100) = Test_AllowedActions.Allowed(2, N'Pickup', 3);
    EXEC tSQLt.AssertEqualsString @Expected = N'Cancel', @Actual = @Customer;
    EXEC tSQLt.AssertEqualsString @Expected = N'Cancel,Prepare', @Actual = @Operator;
    EXEC tSQLt.AssertEqualsString @Expected = N'Cancel,Prepare', @Actual = @Administrator;
END;
GO

CREATE PROCEDURE Test_AllowedActions.[test an order in preparation is dispatched when it goes to a home and delivered when it is collected]
AS
BEGIN
    DECLARE @Delivery NVARCHAR(100) = Test_AllowedActions.Allowed(3, N'Delivery', 2);
    DECLARE @Pickup NVARCHAR(100) = Test_AllowedActions.Allowed(3, N'Pickup', 2);
    DECLARE @PickupByAdministrator NVARCHAR(100) = Test_AllowedActions.Allowed(3, N'Pickup', 3);
    DECLARE @DeliveryByAdministrator NVARCHAR(100) = Test_AllowedActions.Allowed(3, N'Delivery', 3);
    -- A domicilio se despacha antes de entregar; en sucursal no hay despacho y entregar es el paso siguiente
    EXEC tSQLt.AssertEqualsString @Expected = N'Cancel,Dispatch', @Actual = @Delivery;
    EXEC tSQLt.AssertEqualsString @Expected = N'Cancel,Deliver', @Actual = @Pickup;
    -- Y en sucursal el administrador da el mismo paso que el operador; a domicilio despacha igual
    EXEC tSQLt.AssertEqualsString @Expected = N'Cancel,Deliver', @Actual = @PickupByAdministrator;
    EXEC tSQLt.AssertEqualsString @Expected = N'Cancel,Dispatch', @Actual = @DeliveryByAdministrator;
END;
GO

CREATE PROCEDURE Test_AllowedActions.[test only an operator delivers a dispatched home delivery order and the administrator is told why not]
AS
BEGIN
    DECLARE @Operator NVARCHAR(100) = Test_AllowedActions.Allowed(4, N'Delivery', 2);
    DECLARE @Administrator NVARCHAR(100) = Test_AllowedActions.Allowed(4, N'Delivery', 3);
    DECLARE @ReservedForAdministrator NVARCHAR(100) = Test_AllowedActions.Reserved(4, N'Delivery', 3);
    DECLARE @ReservedForOperator NVARCHAR(100) = Test_AllowedActions.Reserved(4, N'Delivery', 2);
    EXEC tSQLt.AssertEqualsString @Expected = N'Deliver', @Actual = @Operator;
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @Administrator;
    -- La acción existe pero es del operador: la pantalla puede explicarlo en lugar de esconderla
    EXEC tSQLt.AssertEqualsString @Expected = N'Deliver', @Actual = @ReservedForAdministrator;
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @ReservedForOperator;
END;
GO

CREATE PROCEDURE Test_AllowedActions.[test a dispatched order can no longer be cancelled and a pickup order is never dispatched]
AS
BEGIN
    DECLARE @Dispatched NVARCHAR(100) = Test_AllowedActions.Allowed(4, N'Delivery', 2);
    DECLARE @PickupDispatched NVARCHAR(100) = Test_AllowedActions.Allowed(4, N'Pickup', 2);
    DECLARE @CustomerDispatched NVARCHAR(100) = Test_AllowedActions.Allowed(4, N'Delivery', 1);
    EXEC tSQLt.AssertEqualsString @Expected = N'Deliver', @Actual = @Dispatched;
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @PickupDispatched;
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @CustomerDispatched;
END;
GO

CREATE PROCEDURE Test_AllowedActions.[test a delivered or partly returned order is returned by the staff and never by a customer]
AS
BEGIN
    DECLARE @Delivered NVARCHAR(100) = Test_AllowedActions.Allowed(5, N'Delivery', 2);
    DECLARE @DeliveredByAdministrator NVARCHAR(100) = Test_AllowedActions.Allowed(5, N'Pickup', 3);
    DECLARE @Partly NVARCHAR(100) = Test_AllowedActions.Allowed(7, N'Delivery', 3);
    DECLARE @Customer NVARCHAR(100) = Test_AllowedActions.Allowed(5, N'Delivery', 1);
    EXEC tSQLt.AssertEqualsString @Expected = N'Return', @Actual = @Delivered;
    EXEC tSQLt.AssertEqualsString @Expected = N'Return', @Actual = @DeliveredByAdministrator;
    EXEC tSQLt.AssertEqualsString @Expected = N'Return', @Actual = @Partly;
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @Customer;
END;
GO

CREATE PROCEDURE Test_AllowedActions.[test a cancelled or fully returned order has nothing left to do]
AS
BEGIN
    DECLARE @Rows INT = (SELECT COUNT(*) FROM (VALUES (6), (8)) AS s (Status)
                         CROSS JOIN (VALUES (N'Delivery'), (N'Pickup')) AS f (Fulfilment)
                         CROSS JOIN (VALUES (1), (2), (3)) AS r (Role)
                         CROSS APPLY dbo.FU_Orders_AllowedActions(s.Status, f.Fulfilment, r.Role) AS a);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_AllowedActions.[test an unknown role or an unknown fulfilment is allowed nothing]
AS
BEGIN
    DECLARE @UnknownRole NVARCHAR(100) = Test_AllowedActions.Allowed(2, N'Delivery', 9);
    DECLARE @UnknownFulfilment INT = (SELECT COUNT(*) FROM dbo.FU_Orders_AllowedActions(3, N'Teleport', 2) WHERE Action IN (N'Dispatch', N'Deliver'));
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @UnknownRole;
    -- Sin saber cómo se recibe, ni despachar ni entregar: solo lo que no depende de ello
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @UnknownFulfilment;
END;
GO

-- La función y la semilla no se contradicen ---------------------------------------------------------------------------------

CREATE PROCEDURE Test_AllowedActions.[test every action that the function offers is an edge of the transition graph]
AS
BEGIN
    DECLARE @Offered INT = (SELECT COUNT(*) FROM (VALUES (1), (2), (3), (4), (5), (6), (7), (8)) AS s (Status)
                            CROSS JOIN (VALUES (N'Delivery'), (N'Pickup')) AS f (Fulfilment)
                            CROSS APPLY dbo.FU_Orders_AllowedActions(s.Status, f.Fulfilment, 2) AS a
                            WHERE a.Action IN (N'Prepare', N'Dispatch', N'Deliver', N'Cancel'));
    -- Cada acción, vista como el cambio de estado que provoca: Prepare →3, Dispatch →4, Deliver →5, Cancel →6
    DECLARE @NotInGraph INT = (SELECT COUNT(*) FROM (VALUES (1), (2), (3), (4), (5), (6), (7), (8)) AS s (Status)
                               CROSS JOIN (VALUES (N'Delivery'), (N'Pickup')) AS f (Fulfilment)
                               CROSS APPLY dbo.FU_Orders_AllowedActions(s.Status, f.Fulfilment, 2) AS a
                               WHERE a.Action IN (N'Prepare', N'Dispatch', N'Deliver', N'Cancel')
                                 AND NOT EXISTS (SELECT 1 FROM dbo.OrderStatusTransitions AS t
                                                 WHERE t.IDFromStatus = s.Status
                                                   AND t.IDToStatus = CASE a.Action WHEN N'Prepare' THEN 3 WHEN N'Dispatch' THEN 4
                                                                                    WHEN N'Deliver' THEN 5 ELSE 6 END));
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @NotInGraph;
    DECLARE @Some INT = CASE WHEN @Offered > 0 THEN 1 ELSE 0 END;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Some;
END;
GO

CREATE PROCEDURE Test_AllowedActions.[test a return is only offered from the states that can go to a returned one]
AS
BEGIN
    DECLARE @NotInGraph INT = (SELECT COUNT(*) FROM (VALUES (1), (2), (3), (4), (5), (6), (7), (8)) AS s (Status)
                               CROSS APPLY dbo.FU_Orders_AllowedActions(s.Status, N'Delivery', 2) AS a
                               WHERE a.Action = N'Return'
                                 AND NOT EXISTS (SELECT 1 FROM dbo.OrderStatusTransitions AS t WHERE t.IDFromStatus = s.Status AND t.IDToStatus IN (7, 8)));
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @NotInGraph;
END;
GO

CREATE PROCEDURE Test_AllowedActions.[test every step that the graph allows is offered by the function to some order]
AS
BEGIN
    -- Prepare 2→3, Dispatch 3→4, Deliver 3→5 (sucursal) y Deliver 4→5 (domicilio): ninguna arista de la semilla queda sin dueño
    DECLARE @Dead INT = (SELECT COUNT(*) FROM dbo.OrderStatusTransitions AS t
                         WHERE t.IDToStatus IN (3, 4, 5)
                           AND NOT EXISTS (SELECT 1 FROM (VALUES (N'Delivery'), (N'Pickup')) AS f (Fulfilment)
                                           CROSS APPLY dbo.FU_Orders_AllowedActions(t.IDFromStatus, f.Fulfilment, 2) AS a
                                           WHERE a.Action = CASE t.IDToStatus WHEN 3 THEN N'Prepare' WHEN 4 THEN N'Dispatch' ELSE N'Deliver' END));
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Dead;
END;
GO
