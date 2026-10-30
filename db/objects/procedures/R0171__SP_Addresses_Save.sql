/* =====================================================================
   Objeto   : dbo.SP_Addresses_Save
   Version  : 1.0.0
   Cambio   : Primera versión: crea o edita una dirección del cliente; IsActive = 0 la retira sin borrarla
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404 dirección inexistente o de otra persona.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Addresses_Save
  @IDUser         INT,
  @IDAddress      INT           = NULL,
  @Label          NVARCHAR(40),
  @Recipient      NVARCHAR(120),
  @Phone          NVARCHAR(20),
  @Line1          NVARCHAR(200),
  @Line2          NVARCHAR(200) = NULL,
  @Municipality   NVARCHAR(80),
  @Department     NVARCHAR(80),
  @Reference      NVARCHAR(200) = NULL,
  @IsActive       BIT           = 1,
  @IDSavedAddress INT           OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Label = LTRIM(RTRIM(@Label));
  SET @Recipient = LTRIM(RTRIM(@Recipient));
  SET @Phone = LTRIM(RTRIM(@Phone));
  SET @Line1 = LTRIM(RTRIM(@Line1));
  SET @Line2 = NULLIF(LTRIM(RTRIM(@Line2)), N'');
  SET @Municipality = LTRIM(RTRIM(@Municipality));
  SET @Department = LTRIM(RTRIM(@Department));
  SET @Reference = NULLIF(LTRIM(RTRIM(@Reference)), N'');
  SET @IsActive = ISNULL(@IsActive, 1);

  IF @IDUser IS NULL OR ISNULL(@Label, N'') = N'' OR ISNULL(@Recipient, N'') = N'' OR ISNULL(@Phone, N'') = N''
     OR ISNULL(@Line1, N'') = N'' OR ISNULL(@Municipality, N'') = N'' OR ISNULL(@Department, N'') = N''
    THROW 50400, 'IDUser, Label, Recipient, Phone, Line1, Municipality and Department are required.', 1;

  IF @IDAddress IS NULL
  BEGIN
    IF @IsActive = 0
      THROW 50400, 'A new address cannot be created inactive.', 1;

    INSERT INTO dbo.Addresses (IDUser, Label, Recipient, Phone, Line1, Line2, Municipality, Department, Reference)
    VALUES (@IDUser, @Label, @Recipient, @Phone, @Line1, @Line2, @Municipality, @Department, @Reference);
    SET @IDSavedAddress = SCOPE_IDENTITY();
  END
  ELSE
  BEGIN
    -- Anti-IDOR dentro de la base de datos: la condición de pertenencia va en el propio UPDATE. Una dirección ajena y una
    -- inexistente responden igual (404) y la ajena no se modifica ni siquiera por una condición de carrera.
    UPDATE dbo.Addresses
    SET Label = @Label, Recipient = @Recipient, Phone = @Phone, Line1 = @Line1, Line2 = @Line2,
        Municipality = @Municipality, Department = @Department, Reference = @Reference, IsActive = @IsActive
    WHERE IDAddress = @IDAddress AND IDUser = @IDUser;

    IF @@ROWCOUNT = 0
      THROW 50404, 'Address not found.', 1;
    SET @IDSavedAddress = @IDAddress;
  END;
END;
GO
