/* =====================================================================
   Objeto   : Test_Money (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Redondeo half-even y separación del IVA incluido: propiedades y casos del diseño
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). Los vectores se comparan con el oráculo de TypeScript
              en backend/tests/unit/rounding.test.ts, que lee este mismo archivo.
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Money';
GO

-- Una fila por línea, entre los marcadores: backend/tests/unit/rounding.test.ts las lee para probar la versión en TypeScript
CREATE PROCEDURE Test_Money.[test half-even division gives the agreed result for every vector]
AS
BEGIN
    CREATE TABLE #Vectors (N BIGINT, D BIGINT, Expected BIGINT);
    -- vectors:begin
    INSERT INTO #Vectors VALUES
    (0, 5, 0),
    (1, 2, 0),
    (3, 2, 2),
    (5, 2, 2),
    (15, 2, 8),
    (25, 10, 2),
    (35, 10, 4),
    (1, 3, 0),
    (2, 3, 1),
    (7, 3, 2),
    (10, 4, 2),
    (14, 4, 4),
    (125, 100, 1),
    (135, 100, 1),
    (10000, 3, 3333),
    (24545000, 10000, 2454),
    (295092, 112, 2635),
    (999999999999999999, 2, 500000000000000000),
    (9223372036854775807, 1, 9223372036854775807),
    (9223372036854775806, 2, 4611686018427387903),
    (5, 1, 5),
    (1, 1000000, 0),
    (9223372036854775806, 9223372036854775807, 1),
    (4611686018427387903, 9223372036854775807, 0);
    -- vectors:end

    DECLARE @Wrong INT =
        (SELECT COUNT(*)
         FROM #Vectors AS v
         CROSS APPLY dbo.FU_Money_HalfEvenDivision(v.N, v.D) AS h
         WHERE h.Result IS NULL OR h.Result <> v.Expected);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Wrong;
END;
GO

-- El ejemplo del diseño: 10 % de Q245.45 es 2454,5 centavos y se queda en 2454 (half-up daría 2455)
CREATE PROCEDURE Test_Money.[test an exact tie rounds to the even cent]
AS
BEGIN
    DECLARE @Down BIGINT = (SELECT Result FROM dbo.FU_Money_HalfEvenDivision(24545 * 1000, 10000));
    DECLARE @Up BIGINT = (SELECT Result FROM dbo.FU_Money_HalfEvenDivision(15, 2));

    EXEC tSQLt.AssertEquals @Expected = 2454, @Actual = @Down;
    EXEC tSQLt.AssertEquals @Expected = 8, @Actual = @Up;
END;
GO

-- Propiedad: el resultado nunca se aleja más de medio entero del cociente exacto (|2 * r * d - 2 * n| <= d)
CREATE PROCEDURE Test_Money.[test the result is never more than half a unit from the exact quotient]
AS
BEGIN
    DECLARE @TooFar INT =
        (SELECT COUNT(*)
         FROM GENERATE_SERIES(0, 3000) AS n
         CROSS APPLY GENERATE_SERIES(1, 40) AS d
         CROSS APPLY dbo.FU_Money_HalfEvenDivision(n.value, d.value) AS h
         WHERE ABS(2 * CAST(h.Result AS BIGINT) * d.value - 2 * CAST(n.value AS BIGINT)) > d.value);

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @TooFar;
END;
GO

-- Propiedad: con empate exacto el resultado es siempre par
CREATE PROCEDURE Test_Money.[test every exact tie yields an even number]
AS
BEGIN
    DECLARE @Odd INT =
        (SELECT COUNT(*)
         FROM GENERATE_SERIES(0, 2000) AS k
         CROSS APPLY dbo.FU_Money_HalfEvenDivision(2 * CAST(k.value AS BIGINT) + 1, 2) AS h
         WHERE h.Result % 2 <> 0);

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Odd;
END;
GO

-- Fuera del dominio el resultado es NULL y no un importe inventado
CREATE PROCEDURE Test_Money.[test a negative numerator or a non-positive divisor gives NULL]
AS
BEGIN
    DECLARE @Negative BIGINT = (SELECT Result FROM dbo.FU_Money_HalfEvenDivision(-1, 2));
    DECLARE @Zero BIGINT = (SELECT Result FROM dbo.FU_Money_HalfEvenDivision(1, 0));
    DECLARE @NegativeDivisor BIGINT = (SELECT Result FROM dbo.FU_Money_HalfEvenDivision(1, -2));

    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = @Negative;
    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = @Zero;
    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = @NegativeDivisor;
END;
GO

-- Ejemplo del diseño: total Q245.91 con IVA del 12 % incluido
CREATE PROCEDURE Test_Money.[test the VAT of the worked example is 2635 cents and the base 21956]
AS
BEGIN
    DECLARE @Vat BIGINT, @Base BIGINT;
    SELECT @Vat = VatCents, @Base = BaseCents FROM dbo.FU_Money_VatIncluded(24591, 12);

    EXEC tSQLt.AssertEquals @Expected = 2635, @Actual = @Vat;
    EXEC tSQLt.AssertEquals @Expected = 21956, @Actual = @Base;
END;
GO

-- Conservación: ni un centavo se pierde ni se crea al separar el IVA, en todo el rango de totales probado
CREATE PROCEDURE Test_Money.[test base plus VAT always equals the total]
AS
BEGIN
    DECLARE @Broken INT =
        (SELECT COUNT(*)
         FROM GENERATE_SERIES(0, 50000) AS t
         CROSS APPLY dbo.FU_Money_VatIncluded(t.value, 12) AS v
         WHERE v.VatCents + v.BaseCents <> t.value OR v.VatCents < 0 OR v.BaseCents < 0);

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Broken;
END;
GO

CREATE PROCEDURE Test_Money.[test a total of zero has no VAT and a rate outside 0 to 100 gives NULL]
AS
BEGIN
    DECLARE @Vat BIGINT = (SELECT VatCents FROM dbo.FU_Money_VatIncluded(0, 12));
    DECLARE @BadRate BIGINT = (SELECT VatCents FROM dbo.FU_Money_VatIncluded(1000, 101));

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Vat;
    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = @BadRate;
END;
GO
