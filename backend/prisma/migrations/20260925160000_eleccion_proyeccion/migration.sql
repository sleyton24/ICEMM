-- Elección de proyección por cuenta en el informe de costos.
--
-- Aditiva y sin destructivos: tabla nueva. Los proyectos e informes que ya
-- existen no tienen filas, y el informe sigue usando el proyectado Presto.
--
-- fuente: "presto" | "modelo"
-- curva:  "tipica" | "reanclada" (solo cuando fuente = modelo)
-- pasado*: quién llevó la curva desde la pestaña Proyección, y cuándo
-- elegido*: quién eligió Presto o el modelo en el informe, y cuándo

CREATE TABLE "EleccionProyeccion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "codigoCuenta" TEXT NOT NULL,
    "fuente" TEXT NOT NULL DEFAULT 'presto',
    "curva" TEXT,
    "cierreTipica" DOUBLE PRECISION,
    "cierreReanclada" DOUBLE PRECISION,
    "serie" JSONB,
    "obrasReferencia" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pasadoPor" TEXT,
    "pasadoEn" TIMESTAMP(3),
    "elegidoPor" TEXT,
    "elegidoEn" TIMESTAMP(3),

    CONSTRAINT "EleccionProyeccion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EleccionProyeccion_projectId_codigoCuenta_key"
    ON "EleccionProyeccion"("projectId", "codigoCuenta");

CREATE INDEX "EleccionProyeccion_projectId_idx"
    ON "EleccionProyeccion"("projectId");

ALTER TABLE "EleccionProyeccion"
    ADD CONSTRAINT "EleccionProyeccion_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
