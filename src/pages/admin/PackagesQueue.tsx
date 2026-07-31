import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Boxes, MapPin, PackagePlus } from 'lucide-react'
import { adminService, type PackageNeedingReview, type CustomerLookup, type ReceivePackageInput } from '../../services/adminService'
import { warehouseService } from '../../services/warehouseService'
import type { ExpectedPackage } from '../../services/packageService'
import { StockLabel, type StockLabelData } from '../../components/admin/StockLabel'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

type CustomerMatch = CustomerLookup | 'not_found' | null

interface LocationOption {
  id: string
  code: string
}

const packageStatusClasses: Record<PackageNeedingReview['status'], string> = {
  received: 'bg-slate/10 text-slate',
  in_review: 'bg-amber-500/10 text-amber-600',
}

export default function PackagesQueue() {
  const { t } = useTranslation()
  const [queue, setQueue] = useState<PackageNeedingReview[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [markError, setMarkError] = useState(false)

  const [customerMatch, setCustomerMatch] = useState<CustomerMatch>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [formError, setFormError] = useState(false)
  const [formSuccess, setFormSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Pré-alertas pendentes do cliente encontrado. Carregam em paralelo ao
  // formulário e NUNCA bloqueiam o recebimento (padrão anti-bloqueio das
  // telas admin): erro aqui só mostra um aviso e segue sem match.
  const [preAlerts, setPreAlerts] = useState<ExpectedPackage[]>([])
  const [preAlertsLoading, setPreAlertsLoading] = useState(false)
  const [preAlertsError, setPreAlertsError] = useState(false)
  const [selectedPreAlert, setSelectedPreAlert] = useState<ExpectedPackage | null>(null)

  // Posição sugerida no galpão + posições livres para troca manual. Também
  // carregam sem bloquear: sem grade (ou galpão cheio) o pacote é recebido
  // sem posição, com aviso claro.
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState(false)
  const [locationChoice, setLocationChoice] = useState<LocationOption | null>(null)
  const [freeSlots, setFreeSlots] = useState<LocationOption[]>([])

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoKey, setPhotoKey] = useState(0)
  const [photoWarning, setPhotoWarning] = useState(false)

  const [labelData, setLabelData] = useState<StockLabelData | null>(null)

  useEffect(() => {
    let active = true
    adminService
      .getPackagesNeedingReview()
      .then((data) => {
        if (active) setQueue(data)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const handleMarkReady = async (id: string) => {
    setMarkError(false)
    setMarkingId(id)
    try {
      await adminService.markPackageReady(id)
      setQueue((prev) => prev.filter((pkg) => pkg.id !== id))
    } catch {
      setMarkError(true)
    } finally {
      setMarkingId(null)
    }
  }

  const suiteRequiredMessage = t('admin.packages.receiveForm.errors.suiteRequired')
  const storeRequiredMessage = t('admin.packages.receiveForm.errors.storeRequired')
  const descriptionRequiredMessage = t('admin.packages.receiveForm.errors.descriptionRequired')
  const weightPositiveMessage = t('admin.packages.receiveForm.errors.weightPositive')
  const dimensionPositiveMessage = t('admin.packages.receiveForm.errors.dimensionPositive')
  const valueNonNegativeMessage = t('admin.packages.receiveForm.errors.valueNonNegative')

  // Campos numéricos opcionais: input vazio vira undefined (em vez de 0, que
  // z.coerce produziria) para o INSERT nem enviar a coluna.
  const optionalPositive = z.preprocess(
    (value) => (value === '' || value == null ? undefined : value),
    z.coerce.number().positive({ message: dimensionPositiveMessage }).optional(),
  )

  const schema = z.object({
    suiteNumber: z.string().min(1, { message: suiteRequiredMessage }),
    store: z.string().min(1, { message: storeRequiredMessage }),
    description: z.string().min(1, { message: descriptionRequiredMessage }),
    weightKg: z.coerce.number().positive({ message: weightPositiveMessage }),
    lengthCm: optionalPositive,
    widthCm: optionalPositive,
    heightCm: optionalPositive,
    declaredValueUsd: z.preprocess(
      (value) => (value === '' || value == null ? undefined : value),
      z.coerce.number().min(0, { message: valueNonNegativeMessage }).optional(),
    ),
  })

  type FormInput = z.input<typeof schema>
  type FormOutput = z.output<typeof schema>

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      suiteNumber: '',
      store: '',
      description: '',
      weightKg: undefined,
      lengthCm: '',
      widthCm: '',
      heightCm: '',
      declaredValueUsd: '',
    },
  })

  const suiteNumberValue = watch('suiteNumber')

  // Se o número da suite mudar depois de uma busca, invalida o match — a
  // equipe precisa buscar de novo antes de conseguir enviar o formulário.
  useEffect(() => {
    setCustomerMatch(null)
    setPreAlerts([])
    setPreAlertsError(false)
    setSelectedPreAlert(null)
    setLocationChoice(null)
    setLocationError(false)
    setFreeSlots([])
  }, [suiteNumberValue])

  const loadPreAlerts = (userId: string) => {
    setPreAlertsLoading(true)
    setPreAlertsError(false)
    adminService
      .getPendingPreAlerts(userId)
      .then((data) => setPreAlerts(data))
      .catch(() => setPreAlertsError(true))
      .finally(() => setPreAlertsLoading(false))
  }

  const loadLocation = () => {
    setLocationLoading(true)
    setLocationError(false)
    warehouseService
      .nextFreeLocation()
      .then((location) => setLocationChoice(location))
      .catch(() => setLocationError(true))
      .finally(() => setLocationLoading(false))
    warehouseService
      .getOccupancy()
      .then((slots) =>
        setFreeSlots(
          slots
            .filter((slot) => slot.packageId === null && slot.active)
            .map((slot) => ({ id: slot.id, code: slot.code })),
        ),
      )
      .catch(() => {
        // Sem o mapa de ocupação o operador só perde a troca manual — a
        // sugestão (ou o aviso de "sem posição") continua valendo.
        setFreeSlots([])
      })
  }

  const handleLookup = async () => {
    const suiteNumber = getValues('suiteNumber').trim()
    if (!suiteNumber) return
    setFormError(false)
    setFormSuccess(false)
    setPhotoWarning(false)
    setLookupLoading(true)
    try {
      const match = await adminService.findUserBySuite(suiteNumber)
      setCustomerMatch(match ?? 'not_found')
      if (match) {
        // Disparados sem await de propósito: o formulário fica utilizável
        // imediatamente mesmo que essas leituras auxiliares demorem.
        loadPreAlerts(match.userId)
        loadLocation()
      }
    } catch {
      setFormError(true)
    } finally {
      setLookupLoading(false)
    }
  }

  const handlePreAlertClick = (preAlert: ExpectedPackage) => {
    if (selectedPreAlert?.id === preAlert.id) {
      setSelectedPreAlert(null)
      return
    }
    setSelectedPreAlert(preAlert)
    setValue('store', preAlert.store)
    setValue('description', preAlert.description)
    setValue('declaredValueUsd', preAlert.declaredValueUsd)
  }

  const handleLocationChange = (locationId: string) => {
    if (!locationId) {
      setLocationChoice(null)
      return
    }
    const slot = freeSlots.find((candidate) => candidate.id === locationId)
    if (slot) setLocationChoice(slot)
  }

  const onValid: SubmitHandler<FormOutput> = async (values) => {
    if (!customerMatch || customerMatch === 'not_found') return
    setFormError(false)
    setFormSuccess(false)
    setPhotoWarning(false)
    setSubmitting(true)
    try {
      const input: ReceivePackageInput = {
        userId: customerMatch.userId,
        store: values.store,
        description: values.description,
        weightKg: values.weightKg,
      }
      if (selectedPreAlert) input.expectedPackageId = selectedPreAlert.id
      if (values.lengthCm != null) input.lengthCm = values.lengthCm
      if (values.widthCm != null) input.widthCm = values.widthCm
      if (values.heightCm != null) input.heightCm = values.heightCm
      if (values.declaredValueUsd != null) input.declaredValueUsd = values.declaredValueUsd
      if (locationChoice) input.locationId = locationChoice.id

      const packageId = await adminService.receivePackage(input)

      // Falha de upload NÃO desfaz o recebimento: o pacote já existe no
      // banco; a foto pode ser anexada depois pela ficha do pacote.
      if (photoFile) {
        try {
          await adminService.uploadPackagePhoto(packageId, photoFile)
        } catch {
          setPhotoWarning(true)
        }
      }

      setLabelData({
        packageId,
        suite: getValues('suiteNumber').trim(),
        locationCode: locationChoice?.code ?? null,
        receivedAt: new Date().toISOString(),
        weightKg: values.weightKg,
      })
      setFormSuccess(true)
      reset()
      setCustomerMatch(null)
      setPhotoFile(null)
      setPhotoKey((prev) => prev + 1)
      const refreshed = await adminService.getPackagesNeedingReview()
      setQueue(refreshed)
    } catch {
      setFormError(true)
    } finally {
      setSubmitting(false)
    }
  }

  const matchFound = customerMatch && customerMatch !== 'not_found' ? customerMatch : null

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('admin.packages.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.packages.subtitle')}</p>

      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5 text-brand" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-navy">{t('admin.packages.receiveForm.title')}</h2>
        </div>

        <form onSubmit={handleSubmit(onValid)} noValidate className="mt-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label={t('admin.packages.receiveForm.suiteLabel')}
              id="suiteNumber"
              type="text"
              placeholder={t('admin.packages.receiveForm.suitePlaceholder')}
              error={errors.suiteNumber?.message}
              {...register('suiteNumber')}
            />
            <Button type="button" variant="secondary" onClick={handleLookup} disabled={lookupLoading}>
              {lookupLoading ? t('admin.packages.receiveForm.looking') : t('admin.packages.receiveForm.lookup')}
            </Button>
          </div>

          {customerMatch === 'not_found' && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {t('admin.packages.receiveForm.notFound')}
            </p>
          )}
          {matchFound && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p role="status" className="text-sm font-medium text-success">
                  {t('admin.packages.receiveForm.found', {
                    name: matchFound.name,
                    suite: getValues('suiteNumber'),
                  })}
                </p>
                {/* Compliance (KYC/OFAC) agora vive no perfil do cliente. */}
                <Link
                  to={`/admin/customers/${matchFound.userId}`}
                  className="text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {t('admin.packages.receiveForm.viewCustomer')}
                </Link>
              </div>

              <div className="mt-3 rounded-lg border border-slate/10 p-4">
                <h3 className="text-sm font-semibold text-navy">{t('admin.packages.preAlerts.title')}</h3>
                {preAlertsLoading ? (
                  <p className="mt-2 text-xs text-slate/60">{t('admin.packages.preAlerts.loading')}</p>
                ) : preAlertsError ? (
                  <p role="alert" className="mt-2 text-xs text-red-600">
                    {t('admin.packages.preAlerts.loadError')}
                  </p>
                ) : preAlerts.length === 0 ? (
                  <p className="mt-2 text-xs text-slate/60">{t('admin.packages.preAlerts.empty')}</p>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-slate/60">{t('admin.packages.preAlerts.hint')}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {preAlerts.map((preAlert) => {
                        const selected = selectedPreAlert?.id === preAlert.id
                        return (
                          <button
                            type="button"
                            key={preAlert.id}
                            onClick={() => handlePreAlertClick(preAlert)}
                            aria-pressed={selected}
                            className={`rounded-lg border p-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                              selected ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-slate/20 hover:border-brand/50'
                            }`}
                          >
                            <span className="block font-semibold text-navy">{preAlert.store}</span>
                            <span className="block text-xs text-slate/60">{preAlert.trackingNumber}</span>
                            <span className="mt-1 block text-slate">{preAlert.description}</span>
                            <span className="mt-1 block text-xs font-medium text-slate/70">
                              {t('admin.packages.preAlerts.declaredValue', {
                                value: preAlert.declaredValueUsd.toFixed(2),
                              })}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {selectedPreAlert && (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <p role="status" className="text-xs font-medium text-success">
                          {t('admin.packages.preAlerts.selected', {
                            store: selectedPreAlert.store,
                            tracking: selectedPreAlert.trackingNumber,
                          })}
                        </p>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedPreAlert(null)}>
                          {t('admin.packages.preAlerts.clear')}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="mt-3 rounded-lg border border-slate/10 p-4">
                <h3 className="text-sm font-semibold text-navy">{t('admin.packages.position.title')}</h3>
                {locationLoading ? (
                  <p className="mt-2 text-xs text-slate/60">{t('admin.packages.position.loading')}</p>
                ) : locationError ? (
                  <p role="alert" className="mt-2 text-xs text-red-600">
                    {t('admin.packages.position.loadError')}
                  </p>
                ) : locationChoice ? (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    {locationChoice.code}
                  </span>
                ) : (
                  <p role="status" className="mt-2 text-xs font-medium text-amber-600">
                    {t('admin.packages.position.none')}
                  </p>
                )}
                {freeSlots.length > 0 && (
                  <label htmlFor="locationId" className="mt-3 block text-sm text-navy">
                    {t('admin.packages.position.changeLabel')}
                    <select
                      id="locationId"
                      value={locationChoice?.id ?? ''}
                      onChange={(event) => handleLocationChange(event.target.value)}
                      className="mt-1 w-full max-w-xs rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <option value="">{t('admin.packages.position.noneOption')}</option>
                      {freeSlots.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {slot.code}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Input
              label={t('admin.packages.receiveForm.storeLabel')}
              id="store"
              type="text"
              error={errors.store?.message}
              {...register('store')}
            />
            <Input
              label={t('admin.packages.receiveForm.descriptionLabel')}
              id="description"
              type="text"
              error={errors.description?.message}
              {...register('description')}
            />
            <Input
              label={t('admin.packages.receiveForm.weightLabel')}
              id="weightKg"
              type="number"
              step="0.01"
              error={errors.weightKg?.message}
              {...register('weightKg')}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Input
              label={t('admin.packages.receiveForm.lengthLabel')}
              id="lengthCm"
              type="number"
              step="0.1"
              error={errors.lengthCm?.message}
              {...register('lengthCm')}
            />
            <Input
              label={t('admin.packages.receiveForm.widthLabel')}
              id="widthCm"
              type="number"
              step="0.1"
              error={errors.widthCm?.message}
              {...register('widthCm')}
            />
            <Input
              label={t('admin.packages.receiveForm.heightLabel')}
              id="heightCm"
              type="number"
              step="0.1"
              error={errors.heightCm?.message}
              {...register('heightCm')}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label={t('admin.packages.receiveForm.declaredValueLabel')}
              id="declaredValueUsd"
              type="number"
              step="0.01"
              error={errors.declaredValueUsd?.message}
              {...register('declaredValueUsd')}
            />
            <label htmlFor="photo" className="block text-navy">
              {t('admin.packages.receiveForm.photoLabel')}
              <input
                key={photoKey}
                id="photo"
                type="file"
                accept="image/*"
                onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-navy/5 file:px-3 file:py-1 file:text-sm file:font-medium file:text-navy"
              />
            </label>
          </div>

          {formError && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {t('admin.packages.receiveForm.error')}
            </p>
          )}
          {formSuccess && (
            <p role="status" className="mt-3 text-sm font-medium text-success">
              {t('admin.packages.receiveForm.success')}
            </p>
          )}
          {photoWarning && (
            <p role="alert" className="mt-3 text-sm font-medium text-amber-600">
              {t('admin.packages.receiveForm.photoFailed')}
            </p>
          )}

          <div className="mt-4">
            <Button type="submit" disabled={!matchFound || submitting}>
              {submitting ? t('admin.packages.receiveForm.submitting') : t('admin.packages.receiveForm.submit')}
            </Button>
          </div>
        </form>
      </Card>

      {labelData && <StockLabel {...labelData} onClose={() => setLabelData(null)} />}

      {loading ? (
        <p className="mt-6 text-sm text-slate/60">{t('dashboard.loading')}</p>
      ) : loadError ? (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {t('admin.packages.loadError')}
        </p>
      ) : queue.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
          <Boxes className="h-10 w-10 text-slate/40" aria-hidden="true" />
          <p className="text-sm text-slate/70">{t('admin.packages.empty')}</p>
        </Card>
      ) : (
        <>
          <Card className="mt-6 overflow-x-auto p-0">
            {markError && (
              <p role="alert" className="px-4 pt-4 text-sm font-medium text-red-600">
                {t('admin.packages.markReadyError')}
              </p>
            )}
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                  <th scope="col" className="px-4 py-3">
                    {t('admin.packages.table.store')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.packages.table.description')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.packages.table.weight')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.packages.table.customer')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.packages.table.status')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">{t('admin.packages.table.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate/10">
                {queue.map((pkg) => (
                  <tr key={pkg.id}>
                    <td className="px-4 py-3 font-medium text-navy">{pkg.store}</td>
                    <td className="px-4 py-3 text-slate">{pkg.description}</td>
                    <td className="px-4 py-3 text-slate">{pkg.weightKg} kg</td>
                    <td className="px-4 py-3 text-slate">
                      {pkg.customerName}
                      {pkg.customerSuite && <span className="block text-xs text-slate/50">{pkg.customerSuite}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${packageStatusClasses[pkg.status]}`}
                      >
                        {t(`admin.packages.status.${pkg.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        disabled={markingId === pkg.id}
                        onClick={() => handleMarkReady(pkg.id)}
                      >
                        {markingId === pkg.id ? t('admin.packages.markingReady') : t('admin.packages.markReady')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
