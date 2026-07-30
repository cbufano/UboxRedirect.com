/**
 * currencyService — moeda de EXIBIÇÃO (Fase 7.2). USD é a única moeda real do
 * sistema; aqui só convertemos para o cliente ter noção do valor local, com a
 * última cotação diária gravada pela Edge Function refresh-exchange-rates.
 *
 * Client-safe e PÚBLICO: currencies e exchange_rates têm SELECT liberado para
 * anon (currencies_select_public / exchange_rates_select_public), então não
 * há checagem de sessão aqui — nada de currentUserId.
 */
import { supabase } from '../lib/supabase'

export interface DisplayRate {
  code: string
  symbol: string
  ratePerUsd: number
  quotedAt: string
}

/** País do perfil → moeda de exibição. Fora do mapa: sem conversão. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  BR: 'BRL',
  US: 'USD',
  PT: 'EUR',
  ES: 'EUR',
  MX: 'MXN',
  AR: 'ARS',
  GB: 'GBP',
}

interface CurrencyRow {
  code: string
  symbol: string
}

interface ExchangeRateRow {
  currency_code: string
  rate_per_usd: number
  quoted_at: string
}

export const currencyService = {
  /**
   * Última cotação por moeda ativa. Uma query em exchange_rates ordenada por
   * quoted_at desc, reduzida no código para a primeira (mais recente) de
   * cada moeda — o volume é minúsculo (1 linha/moeda/dia). Moedas ativas sem
   * cotação gravada ficam de fora — o chamador simplesmente não mostra a
   * conversão (nunca quebra).
   */
  async getLatestRates(): Promise<DisplayRate[]> {
    const [currenciesResult, ratesResult] = await Promise.all([
      supabase.from('currencies').select('code, symbol').eq('active', true),
      supabase
        .from('exchange_rates')
        .select('currency_code, rate_per_usd, quoted_at')
        .order('quoted_at', { ascending: false }),
    ])
    if (currenciesResult.error) throw new Error(currenciesResult.error.message)
    if (ratesResult.error) throw new Error(ratesResult.error.message)

    const latestByCode = new Map<string, ExchangeRateRow>()
    for (const rate of (ratesResult.data ?? []) as ExchangeRateRow[]) {
      if (!latestByCode.has(rate.currency_code)) latestByCode.set(rate.currency_code, rate)
    }

    return ((currenciesResult.data ?? []) as CurrencyRow[]).flatMap((currency): DisplayRate[] => {
      const rate = latestByCode.get(currency.code)
      if (!rate) return []
      return [
        {
          code: currency.code,
          symbol: currency.symbol,
          ratePerUsd: rate.rate_per_usd,
          quotedAt: rate.quoted_at,
        },
      ]
    })
  },

  /** Conversão aproximada de exibição, arredondada a 2 casas. Helper puro. */
  approximate(amountUsd: number, ratePerUsd: number): number {
    return Math.round(amountUsd * ratePerUsd * 100) / 100
  },
}
