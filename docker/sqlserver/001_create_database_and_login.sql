/* =====================================================================
   Inicialización del contenedor SQL Server (Etapa 0).
   Crea la base de datos y el login de la aplicación. Es idempotente: se ejecuta en cada arranque.
   Variables de sqlcmd: $(DbName), $(AppUser), $(AppPassword).
   La Etapa 2 la sustituye por el runner de migraciones (db/runner).
   ===================================================================== */
SET NOCOUNT ON;

IF DB_ID(N'$(DbName)') IS NULL
  CREATE DATABASE [$(DbName)];
GO

-- El login vive a nivel de servidor; la contraseña solo se fija al crearlo
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$(AppUser)')
  CREATE LOGIN [$(AppUser)] WITH PASSWORD = N'$(AppPassword)', CHECK_POLICY = OFF;
GO

USE [$(DbName)];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$(AppUser)')
  CREATE USER [$(AppUser)] FOR LOGIN [$(AppUser)];
GO

-- La aplicación solo ejecuta procedimientos almacenados (ADR-0002): ningún acceso directo a tablas
GRANT EXECUTE ON SCHEMA::dbo TO [$(AppUser)];
DENY SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [$(AppUser)];
GO

PRINT N'ShopCart database ready.';
GO
