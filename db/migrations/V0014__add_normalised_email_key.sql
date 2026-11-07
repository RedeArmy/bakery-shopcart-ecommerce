/* =====================================================================
   Migración : V0014__add_normalised_email_key
   Cambio    : Clave normalizada del correo (Users.EmailKey). Una promoción de un uso por cliente no debe poder repetirse
               con otra cuenta cuyo correo es el mismo con otro aspecto: mayúsculas, la etiqueta +algo o los puntos de Gmail.
   Forward   : Solo agrega una columna calculada y un índice; no cambia datos ni la unicidad del correo (cada persona puede
               registrar sus alias, pero un cupón los cuenta como una sola).
   ===================================================================== */

-- Reglas de la clave, de menor a mayor alcance:
--   1. Minúsculas.
--   2. Se quita la etiqueta `+algo` de la parte local (todos los proveedores la entregan a la misma bandeja). Un `+` al
--      inicio no es una etiqueta y se conserva.
--   3. En gmail.com y googlemail.com se quitan además los puntos de la parte local y el dominio queda gmail.com, porque Gmail
--      los ignora. En el resto de dominios los puntos cuentan: `a.b@x.com` y `ab@x.com` pueden ser personas distintas.
-- Es una columna calculada y persistida con funciones deterministas: se mantiene sola y admite un índice.
-- cspell:disable-next-line
ALTER TABLE dbo.Users ADD EmailKey AS (
  LOWER(
    CASE
      WHEN CHARINDEX(N'@', Email) < 2 THEN Email
      -- cspell:disable-next-line
      WHEN LOWER(SUBSTRING(Email, CHARINDEX(N'@', Email) + 1, 255)) IN (N'gmail.com', N'googlemail.com')
        THEN REPLACE(
               ISNULL(LEFT(LEFT(Email, CHARINDEX(N'@', Email) - 1),
                            NULLIF(CHARINDEX(N'+', LEFT(Email, CHARINDEX(N'@', Email) - 1), 2), 0) - 1),
                      LEFT(Email, CHARINDEX(N'@', Email) - 1)),
               N'.', N'') + N'@gmail.com'
      ELSE ISNULL(LEFT(LEFT(Email, CHARINDEX(N'@', Email) - 1),
                       NULLIF(CHARINDEX(N'+', LEFT(Email, CHARINDEX(N'@', Email) - 1), 2), 0) - 1),
                  LEFT(Email, CHARINDEX(N'@', Email) - 1))
           + SUBSTRING(Email, CHARINDEX(N'@', Email), 255)
    END
  )
) PERSISTED;
GO

-- El límite de cupones por cliente busca las cuentas que comparten la clave
CREATE INDEX IX_Users_EmailKey ON dbo.Users (EmailKey);
GO
