import { useEffect, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Boxes, PackagePlus } from 'lucide-react'
import { adminService, type PackageNeedingReview } from '../../services/adminService'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

type CustomerMatch = { userId: string; name: string } | 'not_found' | null

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

  const schema = z.object({
    suiteNumber: z.string().min(1, { message: suiteRequiredMessage }),
    store: z.string().min(1, { message: storeRequiredMessage }),
    description: z.string().min(1, { message: descriptionRequiredMessage }),
    weightKg: z.coerce.number().positive({ message: weightPositiveMessage }),
  })

  type FormInput = z.input<typeof schema>
  type FormOutput = z.output<typeof schema>

  const {
    register,
    handleSubmit,
    getValues,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { suiteNumber: '', store: '', description: '', weightKg: undefined },
  })

  const suiteNumberValue = watch('suiteNumber')

  // Se o número da suite mudar depois de uma busca, invalida o match — a
  // equipe precisa buscar de novo antes de conseguir enviar o formulário.
  useEffect(() => {
    setCustomerMatch(null)
  }, [suiteNumberValue])

  const handleLookup = async () => {
    const suiteNumber = getValues('suiteNumber').trim()
    if (!suiteNumber) return
    setFormError(false)
    setFormSuccess(false)
    setLookupLoading(true)
    try {
      const match = await adminService.findUserBySuite(suiteNumber)
      setCustomerMatch(match ?? 'not_found')
    } catch {
      setFormError(true)
    } finally {
      setLookupLoading(false)
    }
  }

  const onValid: SubmitHandler<FormOutput> = async (values) => {
    if (!customerMatch || customerMatch === 'not_found') return
    setFormError(false)
    setFormSuccess(false)
    setSubmitting(true)
    try {
      await adminService.receivePackage({
        userId: customerMatch.userId,
        store: values.store,
        description: values.description,
        weightKg: values.weightKg,
      })
      setFormSuccess(true)
      reset()
      setCustomerMatch(null)
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
            <p role="status" className="mt-2 text-sm font-medium text-success">
              {t('admin.packages.receiveForm.found', {
                name: matchFound.name,
                suite: getValues('suiteNumber'),
              })}
            </p>
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

          <div className="mt-4">
            <Button type="submit" disabled={!matchFound || submitting}>
              {submitting ? t('admin.packages.receiveForm.submitting') : t('admin.packages.receiveForm.submit')}
            </Button>
          </div>
        </form>
      </Card>

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
