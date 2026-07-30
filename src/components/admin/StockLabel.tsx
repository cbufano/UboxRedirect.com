/**
 * StockLabel — etiqueta de estoque 4×6" (impressora térmica Zebra) exibida em
 * modal após o recebimento. QR gerado 100% client-side (lib `qrcode`)
 * apontando para a ficha do pacote (/admin/packages/:id); o CSS de impressão
 * esconde tudo fora da etiqueta e fixa a página em 4in × 6in sem margem, então
 * "Print label" sai pronto para a Zebra sem ajuste manual.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { Button } from '../ui/Button'

export interface StockLabelData {
  packageId: string
  suite: string
  locationCode: string | null
  receivedAt: string
  weightKg: number
}

interface StockLabelProps extends StockLabelData {
  onClose: () => void
}

const PRINT_CSS = `
@media print {
  @page { size: 4in 6in; margin: 0; }
  body * { visibility: hidden; }
  #stock-label-print-area, #stock-label-print-area * { visibility: visible; }
  #stock-label-print-area { position: fixed; left: 0; top: 0; margin: 0; border: none; }
}
`

export function StockLabel({ packageId, suite, locationCode, receivedAt, weightKg, onClose }: StockLabelProps) {
  const { t, i18n } = useTranslation()
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    QRCode.toDataURL(`${window.location.origin}/admin/packages/${packageId}`, { width: 512, margin: 1 })
      .then((url) => {
        if (active) setQrDataUrl(url)
      })
      .catch(() => {
        // Sem QR a etiqueta ainda é utilizável (suite + posição legíveis) —
        // não bloqueia a impressão.
        if (active) setQrDataUrl(null)
      })
    return () => {
      active = false
    }
  }, [packageId])

  const receivedDate = new Date(receivedAt).toLocaleDateString(i18n.language)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('admin.packages.label.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4"
    >
      <style>{PRINT_CSS}</style>
      <div className="max-h-full overflow-auto rounded-xl bg-white p-4 shadow-xl">
        <div
          id="stock-label-print-area"
          style={{ width: '4in', height: '6in' }}
          className="flex flex-col items-center justify-between border border-slate/20 bg-white p-4 text-black"
        >
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={t('admin.packages.label.qrAlt')}
              style={{ width: '3in', height: '3in' }}
            />
          ) : (
            <div style={{ width: '3in', height: '3in' }} aria-hidden="true" />
          )}
          <p className="text-5xl font-black tracking-tight">{suite}</p>
          <p className="border-2 border-black px-4 py-1 font-mono text-3xl font-bold">
            {locationCode ?? t('admin.packages.label.noLocation')}
          </p>
          <div className="flex w-full items-center justify-between text-lg font-semibold">
            <span>{receivedDate}</span>
            <span>{weightKg} kg</span>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('admin.packages.label.close')}
          </Button>
          <Button type="button" onClick={() => window.print()}>
            {t('admin.packages.label.print')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
