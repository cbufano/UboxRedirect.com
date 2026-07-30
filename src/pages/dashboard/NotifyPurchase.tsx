import { useEffect, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { PackageSearch } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { packageService, type ExpectedPackage } from '../../services/packageService'

const statusClasses: Record<ExpectedPackage['status'], string> = {
  pending: 'bg-slate/10 text-slate',
  matched: 'bg-success/10 text-success',
  cancelled: 'bg-red-50 text-red-600',
}

export default function NotifyPurchase() {
  const { t } = useTranslation()
  const [items, setItems] = useState<ExpectedPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [cancelError, setCancelError] = useState(false)
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    packageService
      .getMyExpectedPackages()
      .then((data) => {
        if (active) setItems(data)
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

  const schema = z.object({
    store: z.string().min(1, t('dashboard.notify.form.errors.store')),
    trackingNumber: z.string().optional(),
    description: z.string().min(3, t('dashboard.notify.form.errors.description')),
    declaredValueUsd: z.coerce
      .number()
      .positive({ message: t('dashboard.notify.form.errors.declaredValue') }),
  })

  type FormInput = z.input<typeof schema>
  type FormOutput = z.output<typeof schema>

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { store: '', trackingNumber: '', description: '', declaredValueUsd: undefined },
  })

  const refreshList = async () => {
    try {
      const data = await packageService.getMyExpectedPackages()
      setItems(data)
    } catch {
      // Não interrompe o fluxo — a lista fica desatualizada até o próximo
      // refresh, mas o formulário e a ação já concluída não são afetados.
    }
  }

  const onValid: SubmitHandler<FormOutput> = async (values) => {
    setSubmitError(false)
    try {
      await packageService.createExpectedPackage({
        store: values.store,
        trackingNumber: values.trackingNumber ?? '',
        description: values.description,
        declaredValueUsd: values.declaredValueUsd,
      })
      setSubmitSuccess(true)
      reset()
      await refreshList()
    } catch {
      setSubmitError(true)
    }
  }

  const handleCancel = async (id: string) => {
    setCancelError(false)
    setCancelingId(id)
    try {
      await packageService.cancelExpectedPackage(id)
      await refreshList()
    } catch {
      setCancelError(true)
    } finally {
      setCancelingId(null)
    }
  }

  if (loading) return <p className="text-sm text-slate/60">{t('dashboard.loading')}</p>

  if (loadError) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {t('dashboard.notify.loadError')}
      </p>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.notify.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('dashboard.notify.subtitle')}</p>

      <form onSubmit={handleSubmit(onValid)} noValidate onChange={() => setSubmitSuccess(false)}>
        <Card className="mt-6 max-w-xl">
          <div className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-navy">{t('dashboard.notify.form.title')}</h2>
          </div>

          <div className="mt-4 space-y-4">
            <Input
              label={t('dashboard.notify.form.store')}
              id="store"
              type="text"
              error={errors.store?.message}
              {...register('store')}
            />

            <div>
              <Input
                label={t('dashboard.notify.form.trackingNumber')}
                id="trackingNumber"
                type="text"
                error={errors.trackingNumber?.message}
                {...register('trackingNumber')}
              />
              <p className="mt-1 text-xs text-slate/60">{t('dashboard.notify.form.trackingNumberHint')}</p>
            </div>

            <Input
              label={t('dashboard.notify.form.description')}
              id="description"
              type="text"
              error={errors.description?.message}
              {...register('description')}
            />

            <Input
              label={t('dashboard.notify.form.declaredValue')}
              id="declaredValueUsd"
              type="number"
              step="0.01"
              error={errors.declaredValueUsd?.message}
              {...register('declaredValueUsd')}
            />
          </div>

          <div className="mt-6">
            <Button type="submit" variant="primary" size="lg">
              {t('dashboard.notify.form.submit')}
            </Button>
          </div>
        </Card>
      </form>

      {submitSuccess && (
        <Card className="mt-6 max-w-xl" role="status">
          <p className="text-sm text-navy">{t('dashboard.notify.form.success')}</p>
        </Card>
      )}

      {submitError && (
        <Card className="mt-6 max-w-xl" role="alert">
          <p className="text-sm text-red-600">{t('dashboard.notify.form.error')}</p>
        </Card>
      )}

      {cancelError && (
        <Card className="mt-6 max-w-xl" role="alert">
          <p className="text-sm text-red-600">{t('dashboard.notify.cancelError')}</p>
        </Card>
      )}

      <Card className="mt-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-navy">{t('dashboard.notify.list.title')}</h2>

        {items.length === 0 ? (
          <p className="mt-3 text-sm text-slate/70">{t('dashboard.notify.list.empty')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                  <th scope="col" className="px-2 py-2">
                    {t('dashboard.notify.list.table.store')}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {t('dashboard.notify.list.table.description')}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {t('dashboard.notify.list.table.status')}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">{t('dashboard.notify.list.cancel')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate/10">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-2 py-2 font-medium text-navy">{item.store}</td>
                    <td className="px-2 py-2 text-slate">{item.description}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[item.status]}`}
                      >
                        {t(`dashboard.notify.status.${item.status}`)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {item.status === 'pending' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={cancelingId === item.id}
                          onClick={() => handleCancel(item.id)}
                        >
                          {t('dashboard.notify.list.cancel')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
