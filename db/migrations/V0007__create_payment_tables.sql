/* =====================================================================
   Migración : V0007 · Pagos, depósitos, comprobantes, devoluciones y libro de dinero
   Contenido : PaymentMethods, PaymentStatuses, PaymentStatusTransitions, BankAccounts, Payments,
               PaymentStatusHistory, PaymentDeposits, PaymentProofs, ReceivedWebhooks,
               Returns, ReturnLines, Refunds, FinancialMovements
   ===================================================================== */
SET NOCOUNT ON;

-- 1 Card (CARD), 2 BankDeposit (BANK_DEPOSIT)
CREATE TABLE dbo.PaymentMethods (
  IDPaymentMethod TINYINT      NOT NULL CONSTRAINT PK_PaymentMethods PRIMARY KEY,
  Code            NVARCHAR(30) NOT NULL CONSTRAINT UQ_PaymentMethods_Code UNIQUE,
  Name            NVARCHAR(60) NOT NULL
);

-- 1 Pending, 2 UnderReview, 3 Approved, 4 Rejected, 5 Failed, 6 Expired, 7 Refunded, 8 Cancelled
-- El estado del pago está separado del estado del pedido (ADR-0015)
CREATE TABLE dbo.PaymentStatuses (
  IDPaymentStatus TINYINT      NOT NULL CONSTRAINT PK_PaymentStatuses PRIMARY KEY,
  Name            NVARCHAR(30) NOT NULL CONSTRAINT UQ_PaymentStatuses_Name UNIQUE
);

CREATE TABLE dbo.PaymentStatusTransitions (
  IDFromStatus TINYINT NOT NULL CONSTRAINT FK_PaymentStatusTransitions_From REFERENCES dbo.PaymentStatuses (IDPaymentStatus),
  IDToStatus   TINYINT NOT NULL CONSTRAINT FK_PaymentStatusTransitions_To REFERENCES dbo.PaymentStatuses (IDPaymentStatus),
  CONSTRAINT PK_PaymentStatusTransitions PRIMARY KEY (IDFromStatus, IDToStatus)
);

CREATE TABLE dbo.BankAccounts (
  IDBankAccount INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BankAccounts PRIMARY KEY,
  BankName      NVARCHAR(80)      NOT NULL,
  AccountType   NVARCHAR(12)      NOT NULL CONSTRAINT CK_BankAccounts_AccountType CHECK (AccountType IN ('Checking', 'Savings')),
  AccountNumber NVARCHAR(30)      NOT NULL,
  HolderName    NVARCHAR(120)     NOT NULL,
  Currency      CHAR(3)           NOT NULL CONSTRAINT DF_BankAccounts_Currency DEFAULT 'GTQ'
                                  CONSTRAINT CK_BankAccounts_Currency CHECK (Currency = 'GTQ'),
  Instructions  NVARCHAR(300)     NULL,
  IsActive      BIT               NOT NULL CONSTRAINT DF_BankAccounts_IsActive DEFAULT 1,
  CONSTRAINT UQ_BankAccounts_Number UNIQUE (BankName, AccountNumber)
);

CREATE TABLE dbo.Payments (
  IDPayment          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Payments PRIMARY KEY,
  IDOrder            INT               NOT NULL CONSTRAINT FK_Payments_Orders REFERENCES dbo.Orders (IDOrder),
  IDPaymentMethod    TINYINT           NOT NULL CONSTRAINT FK_Payments_PaymentMethods REFERENCES dbo.PaymentMethods (IDPaymentMethod),
  IDPaymentStatus    TINYINT           NOT NULL CONSTRAINT FK_Payments_PaymentStatuses REFERENCES dbo.PaymentStatuses (IDPaymentStatus),
  Amount             DECIMAL(18,2)     NOT NULL CONSTRAINT CK_Payments_Amount CHECK (Amount > 0),
  Currency           CHAR(3)           NOT NULL CONSTRAINT DF_Payments_Currency DEFAULT 'GTQ'
                                       CONSTRAINT CK_Payments_Currency CHECK (Currency = 'GTQ'),
  IdempotencyKey     NVARCHAR(64)      NOT NULL CONSTRAINT UQ_Payments_IdempotencyKey UNIQUE,
  -- Identificador del checkout alojado del proveedor (ch_...) y su URL; solo existen para tarjeta
  ExternalReference  NVARCHAR(80)      NULL,
  ExternalPaymentUrl NVARCHAR(500)     NULL,
  ProviderFee        DECIMAL(18,2)     NULL CONSTRAINT CK_Payments_ProviderFee CHECK (ProviderFee IS NULL OR ProviderFee >= 0),
  ExpiresAt          DATETIME2(3)      NOT NULL,
  CreatedAt          DATETIME2(3)      NOT NULL CONSTRAINT DF_Payments_CreatedAt DEFAULT SYSUTCDATETIME(),
  ResolvedAt         DATETIME2(3)      NULL,
  CONSTRAINT CK_Payments_ExternalOnlyForCard CHECK (IDPaymentMethod = 1 OR (ExternalReference IS NULL AND ExternalPaymentUrl IS NULL))
);
-- Un solo intento abierto por pedido (estados 1 y 2)
CREATE UNIQUE INDEX UX_Payments_OneOpenAttempt ON dbo.Payments (IDOrder) WHERE IDPaymentStatus IN (1, 2);
-- Un solo pago aprobado por pedido (estado 3): el doble cobro queda bloqueado en los datos (ADR-0004)
CREATE UNIQUE INDEX UX_Payments_OneApproved ON dbo.Payments (IDOrder) WHERE IDPaymentStatus = 3;
CREATE UNIQUE INDEX UX_Payments_ExternalReference ON dbo.Payments (ExternalReference) WHERE ExternalReference IS NOT NULL;
CREATE INDEX IX_Payments_Status_Expiry ON dbo.Payments (IDPaymentStatus, ExpiresAt) INCLUDE (IDOrder, IDPaymentMethod);

CREATE TABLE dbo.PaymentStatusHistory (
  IDPaymentStatusHistory BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PaymentStatusHistory PRIMARY KEY,
  IDPayment              INT                  NOT NULL CONSTRAINT FK_PaymentStatusHistory_Payments REFERENCES dbo.Payments (IDPayment),
  IDPreviousStatus       TINYINT              NULL CONSTRAINT FK_PaymentStatusHistory_Previous REFERENCES dbo.PaymentStatuses (IDPaymentStatus),
  IDNewStatus            TINYINT              NOT NULL CONSTRAINT FK_PaymentStatusHistory_New REFERENCES dbo.PaymentStatuses (IDPaymentStatus),
  -- NULL cuando lo hace el sistema (webhook, job)
  IDUser                 INT                  NULL CONSTRAINT FK_PaymentStatusHistory_Users REFERENCES dbo.Users (IDUser),
  Source                 NVARCHAR(20)         NOT NULL CONSTRAINT CK_PaymentStatusHistory_Source
                                              CHECK (Source IN ('Customer', 'Operator', 'Webhook', 'Reconciliation', 'Job')),
  CreatedAt              DATETIME2(3)         NOT NULL CONSTRAINT DF_PaymentStatusHistory_CreatedAt DEFAULT SYSUTCDATETIME(),
  Comment                NVARCHAR(250)        NULL
);
CREATE INDEX IX_PaymentStatusHistory_Payment ON dbo.PaymentStatusHistory (IDPayment, CreatedAt);

CREATE TABLE dbo.PaymentDeposits (
  IDPayment        INT           NOT NULL CONSTRAINT PK_PaymentDeposits PRIMARY KEY
                                 CONSTRAINT FK_PaymentDeposits_Payments REFERENCES dbo.Payments (IDPayment),
  IDBankAccount    INT           NOT NULL CONSTRAINT FK_PaymentDeposits_BankAccounts REFERENCES dbo.BankAccounts (IDBankAccount),
  -- Número de boleta o de transacción que da el banco
  ReferenceNumber  NVARCHAR(40)  NULL,
  DepositDate      DATE          NULL,
  DepositedAmount  DECIMAL(18,2) NULL CONSTRAINT CK_PaymentDeposits_DepositedAmount CHECK (DepositedAmount IS NULL OR DepositedAmount > 0),
  -- 0 al rechazarse: libera la referencia para que el cliente pueda corregirla
  IsCurrent        BIT           NOT NULL CONSTRAINT DF_PaymentDeposits_IsCurrent DEFAULT 1,
  RejectionReason  NVARCHAR(250) NULL,
  IDReviewerUser   INT           NULL CONSTRAINT FK_PaymentDeposits_Reviewer REFERENCES dbo.Users (IDUser),
  ReviewedAt       DATETIME2(3)  NULL
);
-- La misma boleta no puede respaldar dos pagos vigentes
CREATE UNIQUE INDEX UX_PaymentDeposits_Reference ON dbo.PaymentDeposits (IDBankAccount, ReferenceNumber)
  WHERE IsCurrent = 1 AND ReferenceNumber IS NOT NULL;

CREATE TABLE dbo.PaymentProofs (
  IDPaymentProof   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PaymentProofs PRIMARY KEY,
  IDPayment        INT               NOT NULL CONSTRAINT FK_PaymentProofs_Payments REFERENCES dbo.Payments (IDPayment),
  OriginalFileName NVARCHAR(255)     NOT NULL,
  -- UUID opaco: el nombre que eligió el cliente nunca llega al disco (ADR-0018)
  StorageKey       NVARCHAR(100)     NOT NULL CONSTRAINT UQ_PaymentProofs_StorageKey UNIQUE,
  MimeType         NVARCHAR(50)      NOT NULL CONSTRAINT CK_PaymentProofs_MimeType CHECK (MimeType IN ('image/jpeg', 'image/png', 'application/pdf')),
  SizeBytes        INT               NOT NULL CONSTRAINT CK_PaymentProofs_SizeBytes CHECK (SizeBytes BETWEEN 1 AND 5242880),
  Sha256Hash       CHAR(64)          NOT NULL,
  IDUser           INT               NOT NULL CONSTRAINT FK_PaymentProofs_Users REFERENCES dbo.Users (IDUser),
  UploadedAt       DATETIME2(3)      NOT NULL CONSTRAINT DF_PaymentProofs_UploadedAt DEFAULT SYSUTCDATETIME()
);
-- Detecta el mismo archivo subido para pagos distintos
CREATE INDEX IX_PaymentProofs_Hash ON dbo.PaymentProofs (Sha256Hash);
CREATE INDEX IX_PaymentProofs_Payment ON dbo.PaymentProofs (IDPayment);

-- Fase 2: deduplicación y auditoría de los webhooks del proveedor de tarjeta
CREATE TABLE dbo.ReceivedWebhooks (
  IDReceivedWebhook BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ReceivedWebhooks PRIMARY KEY,
  Provider          NVARCHAR(20)         NOT NULL CONSTRAINT CK_ReceivedWebhooks_Provider CHECK (Provider IN ('Recurrente')),
  MessageId         NVARCHAR(100)        NOT NULL,
  EventType         NVARCHAR(60)         NOT NULL,
  Payload           NVARCHAR(MAX)        NOT NULL CONSTRAINT CK_ReceivedWebhooks_Payload CHECK (ISJSON(Payload) = 1),
  Result            NVARCHAR(80)         NULL,
  ReceivedAt        DATETIME2(3)         NOT NULL CONSTRAINT DF_ReceivedWebhooks_ReceivedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_ReceivedWebhooks_Message UNIQUE (Provider, MessageId)
);

CREATE TABLE dbo.Returns (
  IDReturn     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Returns PRIMARY KEY,
  IDOrder      INT               NOT NULL CONSTRAINT FK_Returns_Orders REFERENCES dbo.Orders (IDOrder),
  Type         NVARCHAR(8)       NOT NULL CONSTRAINT CK_Returns_Type CHECK (Type IN ('Full', 'Partial')),
  Reason       NVARCHAR(250)     NOT NULL,
  RefundAmount DECIMAL(18,2)     NOT NULL CONSTRAINT CK_Returns_RefundAmount CHECK (RefundAmount > 0),
  IDUser       INT               NOT NULL CONSTRAINT FK_Returns_Users REFERENCES dbo.Users (IDUser),
  CreatedAt    DATETIME2(3)      NOT NULL CONSTRAINT DF_Returns_CreatedAt DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Returns_Order ON dbo.Returns (IDOrder);

CREATE TABLE dbo.ReturnLines (
  IDReturn     INT           NOT NULL CONSTRAINT FK_ReturnLines_Returns REFERENCES dbo.Returns (IDReturn),
  IDOrderLine  INT           NOT NULL CONSTRAINT FK_ReturnLines_OrderLines REFERENCES dbo.OrderLines (IDOrderLine),
  Quantity     INT           NOT NULL CONSTRAINT CK_ReturnLines_Quantity CHECK (Quantity > 0),
  RefundAmount DECIMAL(18,2) NOT NULL CONSTRAINT CK_ReturnLines_RefundAmount CHECK (RefundAmount > 0),
  CONSTRAINT PK_ReturnLines PRIMARY KEY (IDReturn, IDOrderLine)
);

CREATE TABLE dbo.Refunds (
  IDRefund          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Refunds PRIMARY KEY,
  IDPayment         INT               NOT NULL CONSTRAINT FK_Refunds_Payments REFERENCES dbo.Payments (IDPayment),
  IDReturn          INT               NULL CONSTRAINT FK_Refunds_Returns REFERENCES dbo.Returns (IDReturn),
  Amount            DECIMAL(18,2)     NOT NULL CONSTRAINT CK_Refunds_Amount CHECK (Amount > 0),
  -- Incluye los reembolsos automáticos por pago tardío sobre un pedido cancelado y por doble pago detectado
  Reason            NVARCHAR(250)     NOT NULL,
  Status            NVARCHAR(12)      NOT NULL CONSTRAINT CK_Refunds_Status CHECK (Status IN ('Pending', 'Processed', 'Failed')),
  -- Identificador del reembolso en el proveedor, o número de la transferencia manual
  ExternalReference NVARCHAR(80)      NULL,
  CreatedAt         DATETIME2(3)      NOT NULL CONSTRAINT DF_Refunds_CreatedAt DEFAULT SYSUTCDATETIME(),
  ProcessedAt       DATETIME2(3)      NULL
);
CREATE INDEX IX_Refunds_Payment ON dbo.Refunds (IDPayment);

-- Libro de dinero: el "kardex" del dinero. Solo se anexa; nunca se edita ni se borra (ADR-0021)
CREATE TABLE dbo.FinancialMovements (
  IDFinancialMovement BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FinancialMovements PRIMARY KEY,
  IDOrder             INT                  NOT NULL CONSTRAINT FK_FinancialMovements_Orders REFERENCES dbo.Orders (IDOrder),
  IDPayment           INT                  NULL CONSTRAINT FK_FinancialMovements_Payments REFERENCES dbo.Payments (IDPayment),
  IDRefund            INT                  NULL CONSTRAINT FK_FinancialMovements_Refunds REFERENCES dbo.Refunds (IDRefund),
  Type                NVARCHAR(12)         NOT NULL CONSTRAINT CK_FinancialMovements_Type CHECK (Type IN ('Charge', 'Refund', 'Fee')),
  -- Con signo: el cobro suma; el reembolso y la comisión restan
  Amount              DECIMAL(18,2)        NOT NULL,
  Currency            CHAR(3)              NOT NULL CONSTRAINT DF_FinancialMovements_Currency DEFAULT 'GTQ'
                                           CONSTRAINT CK_FinancialMovements_Currency CHECK (Currency = 'GTQ'),
  IDUser              INT                  NULL CONSTRAINT FK_FinancialMovements_Users REFERENCES dbo.Users (IDUser),
  CreatedAt           DATETIME2(3)         NOT NULL CONSTRAINT DF_FinancialMovements_CreatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_FinancialMovements_Sign CHECK ((Type = 'Charge' AND Amount > 0) OR (Type IN ('Refund', 'Fee') AND Amount < 0))
);
-- Un solo cobro por pago
CREATE UNIQUE INDEX UX_FinancialMovements_OneChargePerPayment ON dbo.FinancialMovements (IDPayment) WHERE Type = 'Charge';
CREATE INDEX IX_FinancialMovements_Order ON dbo.FinancialMovements (IDOrder) INCLUDE (Type, Amount);
