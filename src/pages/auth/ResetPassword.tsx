import { useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { authService } from '../../services/authService'

export default function ResetPassword() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const schema = z
    .object({
      password: z.string().min(8),
      confirmPassword: z.string().min(1),
    })
    .superRefine((data, ctx) => {
      if (data.password !== data.confirmPassword) {
        ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: t('auth.reset.confirmPassword') })
      }
    })

  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit: SubmitHandler<FormValues> = async ({ password }) => {
    setStatus('idle')
    try {
      await authService.updatePassword(password)
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="mx-auto my-16 max-w-md px-4">
      <Card>
        <h1 className="text-3xl font-bold text-navy">{t('auth.reset.title')}</h1>
        <p className="mt-2 text-sm text-slate">{t('auth.reset.subtitle')}</p>

        {status === 'success' ? (
          <div role="status" className="mt-6">
            <div className="flex items-start gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{t('auth.reset.success')}</span>
            </div>
            <div className="mt-6">
              <Link to="/login">
                <Button type="button" variant="primary" size="lg" className="w-full">
                  {t('auth.reset.backToLogin')}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {status === 'error' && (
              <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {t('auth.reset.error')}
              </p>
            )}
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6">
              <Input
                label={t('auth.reset.password')}
                id="password"
                type="password"
                autoComplete="new-password"
                error={errors.password?.message}
                {...register('password')}
              />
              <div className="mt-4">
                <Input
                  label={t('auth.reset.confirmPassword')}
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  error={errors.confirmPassword?.message}
                  {...register('confirmPassword')}
                />
              </div>
              <div className="mt-6">
                <Button type="submit" variant="primary" size="lg" className="w-full">
                  {t('auth.reset.submit')}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  )
}
