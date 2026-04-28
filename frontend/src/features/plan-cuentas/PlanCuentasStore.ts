import { create } from 'zustand'
import { api } from '../../api/client'
import type { PlanCuentas, MaestroProductos, FamiliaMacro, CuentaCosto } from './types'
import { planCuentasBundled, maestroProductosBundled } from './bundled/seed'

interface PlanCuentasState {
  plan: PlanCuentas
  maestro: MaestroProductos
  loading: boolean
  error: string | null

  // Lookups
  getCuenta: (codigo: number) => CuentaCosto | undefined
  getFamilia: (codigo: number) => FamiliaMacro | undefined
  getFamiliaPorLetra: (letra: string) => FamiliaMacro | undefined
  getFamiliaPorCuenta: (cuentaCodigo: number) => FamiliaMacro | undefined

  // Actions (async — server)
  fetch: () => Promise<void>
  uploadPlan: (plan: PlanCuentas) => Promise<void>
  uploadMaestro: (maestro: MaestroProductos) => Promise<void>
  restaurarBundled: () => Promise<void>
}

export const usePlanCuentasStore = create<PlanCuentasState>((set, get) => ({
  plan: planCuentasBundled,
  maestro: maestroProductosBundled,
  loading: false,
  error: null,

  getCuenta: (codigo) => get().plan.cuentas.find(c => c.codigo === codigo),
  getFamilia: (codigo) => get().plan.familias.find(f => f.codigo === codigo),
  getFamiliaPorLetra: (letra) => get().plan.familias.find(f => f.letra === letra.toUpperCase()),
  getFamiliaPorCuenta: (cuentaCodigo) => {
    const famCode = Math.floor(cuentaCodigo / 100) * 100
    return get().plan.familias.find(f => f.codigo === famCode)
  },

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const { plan, maestro } = await api.get<{ plan: PlanCuentas | null; maestro: MaestroProductos | null }>('/plan-cuentas')
      set({
        plan: plan ?? planCuentasBundled,
        maestro: maestro ?? maestroProductosBundled,
        loading: false,
      })
    } catch (e: any) {
      // Si falla el backend, mantener bundled como fallback
      set({ error: e.message ?? 'Error cargando plan', loading: false })
    }
  },

  uploadPlan: async (plan) => {
    const updated = await api.post<PlanCuentas>('/plan-cuentas', {
      version: plan.version,
      familias: plan.familias,
      cuentas: plan.cuentas,
    })
    set({ plan: updated })
  },

  uploadMaestro: async (maestro) => {
    const updated = await api.post<MaestroProductos>('/plan-cuentas/maestro', {
      version: maestro.version,
      productos: maestro.productos,
    })
    set({ maestro: updated })
  },

  restaurarBundled: async () => {
    await api.delete('/plan-cuentas')
    set({ plan: planCuentasBundled, maestro: maestroProductosBundled })
  },
}))

// Hidratar al cargar
usePlanCuentasStore.getState().fetch()
