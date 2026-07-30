/**
 * Lógica pura de seleção múltipla da tela Inbox — extraída para ser testável
 * via Jest puro (sem `@testing-library/react-native`, fora de escopo desta
 * fase, ver cabeçalho do plano de Fase 6). Espelha as regras de
 * `src/pages/dashboard/Inbox.tsx` (site): só pacotes com `status === 'ready'`
 * podem ser selecionados para consolidação.
 */
import type { ReceivedPackage } from '../services/packageService'

export function isSelectable(pkg: Pick<ReceivedPackage, 'status'>): boolean {
  return pkg.status === 'ready'
}

/**
 * Alterna a seleção de um pacote. Um pacote que não está `ready` nunca pode
 * ser adicionado à seleção (no-op se ele ainda não estava selecionado) — mas
 * se por algum motivo ele já estava selecionado (ex.: status mudou entre a
 * seleção e um refresh que ainda não rodou), permitimos removê-lo.
 */
export function toggleSelection(selectedIds: Set<string>, pkg: ReceivedPackage): Set<string> {
  const alreadySelected = selectedIds.has(pkg.id)
  if (!isSelectable(pkg) && !alreadySelected) {
    return selectedIds
  }
  const next = new Set(selectedIds)
  if (alreadySelected) {
    next.delete(pkg.id)
  } else {
    next.add(pkg.id)
  }
  return next
}

/**
 * Remove da seleção qualquer id que não corresponda mais a um pacote
 * selecionável — usado depois de um refresh da lista (ex.: outro dispositivo
 * já consolidou o pacote e o status mudou de `ready` para `consolidating`).
 * Retorna a MESMA instância de `Set` quando nada muda, para permitir usar o
 * retorno diretamente como novo estado sem re-renders desnecessários.
 */
export function pruneSelection(selectedIds: Set<string>, packages: ReceivedPackage[]): Set<string> {
  if (selectedIds.size === 0) return selectedIds
  const selectableIds = new Set(packages.filter(isSelectable).map((pkg) => pkg.id))
  const pruned = [...selectedIds].filter((id) => selectableIds.has(id))
  if (pruned.length === selectedIds.size) return selectedIds
  return new Set(pruned)
}
