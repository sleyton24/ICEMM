-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'viewer',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProject" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fechaAsignacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProject_pkey" PRIMARY KEY ("userId","projectId")
);

-- CreateTable
CREATE TABLE "PlanCuentas" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "familias" JSONB NOT NULL,
    "cuentas" JSONB NOT NULL,
    "cargadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlanCuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaestroProductos" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "productos" JSONB NOT NULL,
    "cargadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MaestroProductos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidadNegocioCodigo" INTEGER,
    "cutoffMesReal" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comentario" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "codigoPartida" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "autorEmail" TEXT NOT NULL,
    "autorNombre" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Informe" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'aprobado',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaAprobacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprobadoPor" TEXT NOT NULL,
    "comentario" TEXT,
    "snapshotProyecto" JSONB NOT NULL,

    CONSTRAINT "Informe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchivoCargado" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "fechaCarga" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partidas" JSONB NOT NULL,
    "subtotalesFamilia" JSONB NOT NULL,
    "totalGeneral" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ArchivoCargado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargaERP" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "unidadNegocioCodigo" INTEGER NOT NULL,
    "unidadNegocioDescripcion" TEXT NOT NULL,
    "totalUF" DOUBLE PRECISION NOT NULL,
    "numTransacciones" INTEGER NOT NULL,
    "rangoFechaDesde" TIMESTAMP(3) NOT NULL,
    "rangoFechaHasta" TIMESTAMP(3) NOT NULL,
    "agregadoPorCcosto" JSONB NOT NULL,
    "agregadoPorCcostoPorMes" JSONB NOT NULL,
    "mesesDisponibles" TEXT[],
    "transaccionesPorCcosto" JSONB NOT NULL,
    "fechaCarga" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CargaERP_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserProject_projectId_idx" ON "UserProject"("projectId");

-- CreateIndex
CREATE INDEX "Comentario_projectId_codigoPartida_idx" ON "Comentario"("projectId", "codigoPartida");

-- CreateIndex
CREATE INDEX "Informe_projectId_idx" ON "Informe"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Informe_projectId_numero_key" ON "Informe"("projectId", "numero");

-- CreateIndex
CREATE INDEX "ArchivoCargado_projectId_idx" ON "ArchivoCargado"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivoCargado_projectId_slot_key" ON "ArchivoCargado"("projectId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "CargaERP_projectId_key" ON "CargaERP"("projectId");

-- AddForeignKey
ALTER TABLE "UserProject" ADD CONSTRAINT "UserProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProject" ADD CONSTRAINT "UserProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivoCargado" ADD CONSTRAINT "ArchivoCargado_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargaERP" ADD CONSTRAINT "CargaERP_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

