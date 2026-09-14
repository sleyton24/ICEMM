-- Ficha de obra: entradas del predictor de curvas de costo.
--
-- Aditiva y sin destructivos: cuatro columnas nullable. Los proyectos que ya
-- existen quedan con NULL y el predictor los reporta como incompletos en vez
-- de suponer valores.
--
-- montoContratoUF NO es el total del itemizado: en La Quebrada el presupuesto
-- inicial son 285.390,41 UF y el contrato 282.990,89 UF. El modelo calcula
-- total = contrato x factor_ejecucion, asi que confundirlos corre el nivel de
-- toda la proyeccion.

ALTER TABLE "Project" ADD COLUMN "tipoObra" TEXT;
ALTER TABLE "Project" ADD COLUMN "m2" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "plazoMeses" INTEGER;
ALTER TABLE "Project" ADD COLUMN "montoContratoUF" DOUBLE PRECISION;
