/* =====================================================================
   Migración : V0019__add_packaging_units
   Cambio    : Los empaques de un producto comparten una sola existencia medida en unidades. Cada variante dice cuántas unidades
               trae (UnitsPerPack: 1 una pieza, 6 una bolsa de 6, 12 una docena) y de qué variante toma la existencia
               (IDStockVariant; NULL si la guarda ella misma). Los paquetes disponibles son las unidades libres entre las
               unidades por paquete, hacia abajo: con 54 unidades hay 9 bolsas de 6 y 4 docenas; con 50, 8 bolsas y sobran 2.
   Forward   : Solo agrega columnas con valores que no cambian el comportamiento: cada variante existente queda con UnitsPerPack = 1
               y sin IDStockVariant, es decir, guarda su propia existencia como hasta ahora. No se mueve ni se borra ningún dato.
   ===================================================================== */

ALTER TABLE dbo.Variants ADD
  UnitsPerPack   INT NOT NULL CONSTRAINT DF_Variants_UnitsPerPack DEFAULT 1,
  IDStockVariant INT NULL;
GO

ALTER TABLE dbo.Variants ADD CONSTRAINT CK_Variants_UnitsPerPack CHECK (UnitsPerPack BETWEEN 1 AND 1000);
ALTER TABLE dbo.Variants ADD CONSTRAINT FK_Variants_StockVariant FOREIGN KEY (IDStockVariant) REFERENCES dbo.Variants (IDVariant);
-- Una variante no toma la existencia de sí misma, y la que toma la de otra no guarda existencias ni reservas propias: todo está
-- en la variante que guarda la existencia (que además tiene que guardar la suya; SP_Variants_Create lo exige)
ALTER TABLE dbo.Variants ADD CONSTRAINT CK_Variants_StockVariantNotSelf CHECK (IDStockVariant IS NULL OR IDStockVariant <> IDVariant);
ALTER TABLE dbo.Variants ADD CONSTRAINT CK_Variants_SharedHoldsNoStock
  CHECK (IDStockVariant IS NULL OR (OnHandStock = 0 AND ReservedStock = 0));
GO

-- La variante que guarda la existencia de esta (ella misma si no toma de otra), calculada una vez para no repetir el COALESCE
-- en cada procedimiento y poder indexarla
ALTER TABLE dbo.Variants ADD IDStockHolder AS COALESCE(IDStockVariant, IDVariant) PERSISTED;
GO

CREATE INDEX IX_Variants_StockHolder ON dbo.Variants (IDStockHolder) INCLUDE (UnitsPerPack);
CREATE INDEX IX_Variants_StockVariant ON dbo.Variants (IDStockVariant) WHERE IDStockVariant IS NOT NULL;
GO
