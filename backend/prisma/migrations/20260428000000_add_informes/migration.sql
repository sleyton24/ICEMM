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

-- CreateIndex
CREATE INDEX "Informe_projectId_idx" ON "Informe"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Informe_projectId_numero_key" ON "Informe"("projectId", "numero");

-- AddForeignKey
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
