-- La Quebrada: monto de contrato y plazo según ficha de Jocelyn (31-jul-2026)
-- y consolidado del 28-oct. Antes: 285390.9 UF / 21 meses.
BEGIN;
UPDATE "Project"
   SET "montoContratoUF" = 282990.89, "plazoMeses" = 22
 WHERE id = '08eb36d7-ae8e-473a-bb53-b0a6b184d99c'
   AND nombre = 'LA QUEBRADA'
   AND "montoContratoUF" = 285390.9 AND "plazoMeses" = 21;
-- Debe decir UPDATE 1. Si dice 0, los valores ya cambiaron: revisar antes de seguir.
SELECT id, nombre, "montoContratoUF", "plazoMeses" FROM "Project" WHERE id = '08eb36d7-ae8e-473a-bb53-b0a6b184d99c';
COMMIT;
-- Reversa:
-- UPDATE "Project" SET "montoContratoUF" = 285390.9, "plazoMeses" = 21 WHERE id = '08eb36d7-ae8e-473a-bb53-b0a6b184d99c';
