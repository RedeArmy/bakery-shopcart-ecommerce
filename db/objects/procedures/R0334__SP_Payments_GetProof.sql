/* =====================================================================
   Objeto   : dbo.SP_Payments_GetProof
   Version  : 1.0.0
   Cambio   : Primera versión: ubicación y tipo de un comprobante para descargarlo
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una fila con la clave de almacenamiento; el archivo vive fuera de la base de datos (ADR-0018). El
              comprobante de otra persona responde igual que uno inexistente. Errores: 50400, 50404.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_GetProof
  @IDActor        INT,
  @AsStaff        BIT = 0,
  @IDPayment      INT,
  @IDPaymentProof INT
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDActor IS NULL OR @IDPayment IS NULL OR @IDPaymentProof IS NULL
    THROW 50400, 'IDActor, IDPayment and IDPaymentProof are required.', 1;

  -- La pertenencia se comprueba en la misma consulta que lee el comprobante, y este debe ser del pago de la ruta
  IF NOT EXISTS (
    SELECT 1
    FROM dbo.PaymentProofs AS pr
    JOIN dbo.Payments AS p ON p.IDPayment = pr.IDPayment
    JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
    WHERE pr.IDPaymentProof = @IDPaymentProof AND pr.IDPayment = @IDPayment AND (@AsStaff = 1 OR o.IDUser = @IDActor))
    THROW 50404, 'Proof not found.', 1;

  SELECT pr.IDPaymentProof, pr.StorageKey, pr.MimeType, pr.OriginalFileName, pr.SizeBytes
  FROM dbo.PaymentProofs AS pr
  WHERE pr.IDPaymentProof = @IDPaymentProof;
END;
GO
