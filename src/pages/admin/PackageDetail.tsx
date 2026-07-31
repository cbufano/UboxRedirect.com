/**
 * PackageDetail — ficha do pacote, destino do QR da etiqueta de estoque
 * (/admin/packages/:id). Mostra os dados completos + cliente/suite, fotos
 * (signed URLs), posição atual com movimentação para outra posição livre,
 * trilha de movimentação (gravada por trigger no banco) e as ações de status
 * permitidas (in_review → ready/discarded). Acessada via QR/link — não tem
 * entrada no menu do AdminLayout de propósito.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ImageOff, MapPin, Printer } from 'lucide-react'
import { adminService, type PackageDetail as PackageDetailData } from '../../services/adminService'
import { warehouseService } from '../../services/warehouseService'
import { StockLabel } from '../../components/admin/StockLabel'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'

interface LocationOption {
  id: string
  code: string
}

// Mesmas cores por status já usadas em Inbox (6 status) e na fila admin
// (in_review em âmbar, sinalizando "precisa de ação do staff").
const packageStatusClasses: Record<PackageDetailData['status'], string> = {
  received: 'bg-slate/10 text-slate',
  in_review: 'bg-amber-500/10 text-amber-600',
  ready: 'bg-success/10 text-success',
  consolidating: 'bg-amber-500/10 text-amber-600',
  shipped: 'bg-brand/10 text-brand',
  discarded: 'bg-red-50 text-red-600',
}

export default function PackageDetail() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()

  const [detail, setDetail] = useState<PackageDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Painel "Mover": posições livres carregam só quando o painel abre.
  const [movePanelOpen, setMovePanelOpen] = useState(false)
  const [freeSlots, setFreeSlots] = useState<LocationOption[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState(false)
  const [targetLocationId, setTargetLocationId] = useState('')
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState(false)
  const [moveSuccess, setMoveSuccess] = useState(false)

  const [actionWorking, setActionWorking] = useState<'ready' | 'discard' | null>(null)
  const [actionError, setActionError] = useState(false)
  const [actionSuccess, setActionSuccess] = useState(false)

  const [labelOpen, setLabelOpen] = useState(false)

  useEffect(() => {
    let active = true
    if (!id) {
      setLoading(false)
      setLoadError(true)
      return
    }
    adminService
      .getPackageDetail(id)
      .then((data) => {
        if (active) setDetail(data)
      })
      .catch(() => {
        // Cobre também o caso "não encontrado": .single() falha quando o id
        // não existe — a mensagem de erro já explica as duas possibilidades.
        if (active) setLoadError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  const refresh = async () => {
    if (!id) return
    const data = await adminService.getPackageDetail(id)
    setDetail(data)
  }

  const handleOpenMove = () => {
    setMovePanelOpen(true)
    setMoveError(false)
    setMoveSuccess(false)
    setTargetLocationId('')
    setSlotsLoading(true)
    setSlotsError(false)
    warehouseService
      .getOccupancy()
      .then((slots) =>
        setFreeSlots(
          slots
            .filter((slot) => slot.packageId === null && slot.active)
            .map((slot) => ({ id: slot.id, code: slot.code })),
        ),
      )
      .catch(() => setSlotsError(true))
      .finally(() => setSlotsLoading(false))
  }

  const handleConfirmMove = async () => {
    if (!id || !targetLocationId) return
    setMoving(true)
    setMoveError(false)
    setMoveSuccess(false)
    try {
      // O histórico é gravado pelo trigger do banco — só mover e recarregar.
      await warehouseService.movePackage(id, targetLocationId)
      await refresh()
      setMoveSuccess(true)
      setMovePanelOpen(false)
      setTargetLocationId('')
    } catch {
      setMoveError(true)
    } finally {
      setMoving(false)
    }
  }

  const handleStatusAction = async (action: 'ready' | 'discard') => {
    if (!id) return
    setActionWorking(action)
    setActionError(false)
    setActionSuccess(false)
    try {
      if (action === 'ready') await adminService.markPackageReady(id)
      else await adminService.discardPackage(id)
      await refresh()
      setActionSuccess(true)
    } catch {
      setActionError(true)
    } finally {
      setActionWorking(null)
    }
  }

  if (loading) {
    return <p className="mt-6 text-sm text-slate/60">{t('dashboard.loading')}</p>
  }

  if (loadError || !detail) {
    return (
      <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {t('admin.packageDetail.loadError')}
      </p>
    )
  }

  const hasDimensions = detail.lengthCm != null && detail.widthCm != null && detail.heightCm != null
  const dimensions = hasDimensions ? `${detail.lengthCm} × ${detail.widthCm} × ${detail.heightCm} cm` : '—'
  const receivedDate = new Date(detail.receivedAt).toLocaleDateString(i18n.language)

  const fields: { label: string; value: string }[] = [
    { label: t('admin.packageDetail.fields.store'), value: detail.store },
    { label: t('admin.packageDetail.fields.description'), value: detail.description },
    { label: t('admin.packageDetail.fields.weight'), value: `${detail.weightKg} kg` },
    { label: t('admin.packageDetail.fields.dimensions'), value: dimensions },
    { label: t('admin.packageDetail.fields.declaredValue'), value: `$${detail.declaredValueUsd.toFixed(2)}` },
    {
      label: t('admin.packageDetail.fields.customer'),
      value: detail.customerSuite ? `${detail.customerName} — ${detail.customerSuite}` : detail.customerName,
    },
    { label: t('admin.packageDetail.fields.receivedAt'), value: receivedDate },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">{t('admin.packageDetail.title')}</h1>
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${packageStatusClasses[detail.status]}`}
        >
          {t(`admin.packageDetail.status.${detail.status}`)}
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.packageDetail.subtitle')}</p>

      <Card className="mt-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate/50">{field.label}</dt>
              <dd className="mt-1 text-sm font-medium text-navy">{field.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          {detail.status === 'in_review' && (
            <>
              <Button
                type="button"
                disabled={actionWorking !== null}
                onClick={() => handleStatusAction('ready')}
              >
                {actionWorking === 'ready'
                  ? t('admin.packageDetail.actions.working')
                  : t('admin.packageDetail.actions.markReady')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={actionWorking !== null}
                onClick={() => handleStatusAction('discard')}
              >
                {actionWorking === 'discard'
                  ? t('admin.packageDetail.actions.working')
                  : t('admin.packageDetail.actions.discard')}
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" onClick={() => setLabelOpen(true)}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('admin.packageDetail.actions.reprint')}
          </Button>
        </div>
        {actionError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {t('admin.packageDetail.actions.error')}
          </p>
        )}
        {actionSuccess && (
          <p role="status" className="mt-3 text-sm font-medium text-success">
            {t('admin.packageDetail.actions.success')}
          </p>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-navy">{t('admin.packageDetail.position.title')}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {detail.locationCode ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {detail.locationCode}
            </span>
          ) : (
            <p className="text-sm text-slate/60">{t('admin.packageDetail.position.none')}</p>
          )}
          {!movePanelOpen && (
            <Button type="button" variant="secondary" size="sm" onClick={handleOpenMove}>
              {t('admin.packageDetail.position.move')}
            </Button>
          )}
        </div>

        {movePanelOpen && (
          <div className="mt-4 rounded-lg border border-slate/10 p-4">
            {slotsLoading ? (
              <p className="text-xs text-slate/60">{t('admin.packageDetail.position.slotsLoading')}</p>
            ) : slotsError ? (
              <p role="alert" className="text-xs text-red-600">
                {t('admin.packageDetail.position.slotsError')}
              </p>
            ) : freeSlots.length === 0 ? (
              <p role="status" className="text-xs font-medium text-amber-600">
                {t('admin.packageDetail.position.noFreeSlots')}
              </p>
            ) : (
              <label htmlFor="targetLocationId" className="block text-sm text-navy">
                {t('admin.packageDetail.position.selectLabel')}
                <select
                  id="targetLocationId"
                  value={targetLocationId}
                  onChange={(event) => setTargetLocationId(event.target.value)}
                  className="mt-1 w-full max-w-xs rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <option value="">—</option>
                  {freeSlots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.code}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!targetLocationId || moving}
                onClick={handleConfirmMove}
              >
                {moving ? t('admin.packageDetail.position.moving') : t('admin.packageDetail.position.confirm')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMovePanelOpen(false)}>
                {t('admin.packageDetail.position.cancel')}
              </Button>
            </div>
          </div>
        )}

        {moveError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {t('admin.packageDetail.position.moveError')}
          </p>
        )}
        {moveSuccess && (
          <p role="status" className="mt-3 text-sm font-medium text-success">
            {t('admin.packageDetail.position.moveSuccess')}
          </p>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-navy">{t('admin.packageDetail.photos.title')}</h2>
        {detail.photos.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate/60">
            <ImageOff className="h-4 w-4" aria-hidden="true" />
            {t('admin.packageDetail.photos.empty')}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {detail.photos.map((photo, index) => (
              <img
                key={photo.id}
                src={photo.url}
                alt={t('admin.packageDetail.photos.alt', { index: index + 1 })}
                className="aspect-square w-full rounded-lg border border-slate/10 object-cover"
              />
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6 overflow-x-auto p-0">
        <h2 className="px-4 pt-4 text-lg font-semibold text-navy">{t('admin.packageDetail.history.title')}</h2>
        {detail.history.length === 0 ? (
          <p className="px-4 pb-4 pt-2 text-sm text-slate/60">{t('admin.packageDetail.history.empty')}</p>
        ) : (
          <table className="mt-2 w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                <th scope="col" className="px-4 py-3">
                  {t('admin.packageDetail.history.from')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.packageDetail.history.to')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.packageDetail.history.by')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.packageDetail.history.when')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10">
              {detail.history.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 font-mono text-navy">{entry.fromCode ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-navy">{entry.toCode ?? '—'}</td>
                  <td className="px-4 py-3 text-slate">{entry.movedByName}</td>
                  <td className="px-4 py-3 text-slate">{new Date(entry.movedAt).toLocaleString(i18n.language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {labelOpen && (
        <StockLabel
          packageId={detail.id}
          suite={detail.customerSuite ?? ''}
          locationCode={detail.locationCode}
          receivedAt={detail.receivedAt}
          weightKg={detail.weightKg}
          onClose={() => setLabelOpen(false)}
        />
      )}
    </div>
  )
}
