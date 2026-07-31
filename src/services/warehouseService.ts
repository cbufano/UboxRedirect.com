/**
 * warehouseService — operação física do galpão (Fase 7.1): geração da grade
 * de localizações, sugestão de posição livre, mapa de ocupação e movimentação
 * de pacotes. Espelha as convenções de adminService (currentUserId local,
 * mapeamento para camelCase, `throw new Error(error.message)`).
 *
 * Quem decide autorização é o banco: generate_warehouse_locations checa
 * admin DENTRO da função; next_free_location e a view warehouse_occupancy
 * dependem de private.is_staff; updates passam pela RLS de
 * warehouse_locations/packages. Mutações usam `.select()` e tratam 0 linhas
 * afetadas como erro — nunca sucesso otimista silencioso (lição da Fase 5).
 */
import { supabase } from '../lib/supabase'

export interface WarehouseLocation {
  id: string
  code: string
  zone: string
  aisle: string
  rack: string
  level: string
  bin: string
  active: boolean
}

export interface OccupancySlot extends WarehouseLocation {
  packageId: string | null
  packageStatus: string | null
  suiteNumber: string | null
}

interface OccupancyRow {
  id: string
  code: string
  zone: string
  aisle: string
  rack: string
  level: string
  bin: string
  active: boolean
  package_id: string | null
  package_status: string | null
  suite_number: string | null
}

function mapOccupancySlot(row: OccupancyRow): OccupancySlot {
  return {
    id: row.id,
    code: row.code,
    zone: row.zone,
    aisle: row.aisle,
    rack: row.rack,
    level: row.level,
    bin: row.bin,
    active: row.active,
    packageId: row.package_id,
    packageStatus: row.package_status,
    suiteNumber: row.suite_number,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const warehouseService = {
  /**
   * Cria a grade de posições (admin-only — a função do banco valida o papel).
   * Retorna quantas posições a função reportou ter processado.
   */
  async generateGrid(zone: string, aisles: string[], racks: number, levels: number, bins: number): Promise<number> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('generate_warehouse_locations', {
      _zone: zone,
      _aisles: aisles,
      _racks: racks,
      _levels: levels,
      _bins: bins,
    })
    if (error) throw new Error(error.message)
    return (data as number | null) ?? 0
  },

  /**
   * Menor código ativo sem pacote "vivo". `null` quando o galpão está cheio
   * (ou sem grade gerada) — o recebimento continua, só sem posição sugerida.
   */
  async nextFreeLocation(): Promise<{ id: string; code: string } | null> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('next_free_location')
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as { id: string; code: string }[]
    const first = rows[0]
    return first ? { id: first.id, code: first.code } : null
  },

  async getOccupancy(): Promise<OccupancySlot[]> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('warehouse_occupancy')
      .select('id, code, zone, aisle, rack, level, bin, active, package_id, package_status, suite_number')
      .order('code', { ascending: true })
    if (error) throw new Error(error.message)
    return (data as OccupancyRow[]).map(mapOccupancySlot)
  },

  async setLocationActive(id: string, active: boolean): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase.from('warehouse_locations').update({ active }).eq('id', id).select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Location not found or update not permitted')
  },

  /**
   * Move o pacote para outra posição (ou tira de posição com `null`). O
   * histórico é gravado pelo trigger packages_log_location_change — nada a
   * inserir manualmente aqui.
   */
  async movePackage(packageId: string, toLocationId: string | null): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('packages')
      .update({ location_id: toLocationId })
      .eq('id', packageId)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Package not found or update not permitted')
  },
}
