export type FamiliaMacro = {
  codigo: number                      // 100, 200, 300, ...
  nombre: string                      // "MATERIALES", "MANO DE OBRA", ...
  nombreOriginal: string              // "Materiales (M)" — texto raw del Excel
  letra: string                       // "M", "O", "S", "G", "E", "P", "C", "V", "I"
  color: string                       // color de marca por familia
}

export type CuentaCosto = {
  codigo: number                      // 101, 308, 504, ...
  descripcion: string                 // "Aridos, Bases, Rellenos"
  familiaCodigo: number               // 100, 200, ... (FK a FamiliaMacro.codigo)
  letra: string                       // derivada de la familia
}

export type PlanCuentas = {
  version: string                     // ISO date del archivo origen
  cargadoEn: string                   // ISO date de carga
  origen: 'bundled' | 'uploaded'
  familias: FamiliaMacro[]            // 9 familias
  cuentas: CuentaCosto[]              // 188 subcuentas
}

export type ProductoMaestro = {
  codigo: string                      // "M10100001" — clave única
  descripcion: string
  unidadMedida: string
  ctaCto: number                      // FK a CuentaCosto.codigo
  letra: string                       // primera letra del código
}

export type MaestroProductos = {
  version: string
  cargadoEn: string
  origen: 'bundled' | 'uploaded'
  productos: ProductoMaestro[]
}
