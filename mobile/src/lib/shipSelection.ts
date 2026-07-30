/**
 * Lógica pura da tela Ship — extraída para ser testável via Jest puro, sem
 * depender de renderizar o componente RN (`@testing-library/react-native`
 * está fora de escopo desta fase, ver cabeçalho do plano de Fase 6). Espelha
 * as regras de `src/pages/dashboard/Ship.tsx` (site), com uma adaptação: aqui
 * os pacotes selecionados chegam como uma string JSON via params de rota do
 * expo-router (`useLocalSearchParams()`), em vez de `location.state`.
 */
import type { ReceivedPackage } from '../services/packageService'
import type { RateOption } from '../services/rateService'

/**
 * Faz o parse defensivo do param `ids` recebido via rota. Qualquer entrada
 * ausente, vazia ou malformada resulta em `[]` — o mesmo efeito prático de
 * `selected.length === 0` no site (mostra o estado "nenhum pacote
 * selecionado" em vez de quebrar).
 */
export function parseSelectedIds(raw: string | string[] | undefined): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    return []
  }
}

/** Filtra a lista completa de pacotes recebidos para só os ids selecionados. */
export function selectPackages(packages: ReceivedPackage[], ids: string[]): ReceivedPackage[] {
  if (ids.length === 0) return []
  return packages.filter((pkg) => ids.includes(pkg.id))
}

/** Soma o peso real (não o peso cobrável, que vem do rateService) dos pacotes selecionados. */
export function computeTotalWeightKg(packages: ReceivedPackage[]): number {
  return Math.round(packages.reduce((sum, pkg) => sum + pkg.weightKg, 0) * 100) / 100
}

/**
 * A transportadora "escolhida" é a selecionada manualmente pelo usuário, ou a
 * primeira opção retornada pela estimativa como default — mesma regra do
 * site (`chosenCarrierName`/`chosenOption` em `Ship.tsx`).
 */
export function resolveChosenOption(
  options: RateOption[] | undefined,
  selectedCarrier: string | null,
): RateOption | null {
  if (!options || options.length === 0) return null
  const carrierName = selectedCarrier ?? options[0].carrier
  return options.find((option) => option.carrier === carrierName) ?? null
}
