import { useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { authService } from '../../services/authService'

const schema = z.object({
  email: z.string().email(),
})

type FormValues = z.infer<typeof schema>

export default function Forgot() {
  const { t } = useTranslation()
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  const onSubmit: SubmitHandler<FormValues> = async ({ email }) => {
    try {
      await authService.requestPasswordReset(email)
    } finally {
      // Sempre mostra sucesso — não revelamos se o e-mail existe (anti-enumeração).
      setSubmitted(true)
    }
  }

  return (
    <div className="mx-auto my-16 max-w-md px-4">
      <Card>
        <h1 className="text-3xl font-bold text-navy">{t('auth.forgot.title')}</h1>
        <p className="mt-2 text-sm text-slate">{t('auth.forgot.subtitle')}</p>

        {submitted ? (
          <div role="status" className="mt-6 flex items-start gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{t('auth.forgot.success')}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6">
            <Input
              label={t('auth.forgot.email')}
              id="email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <div className="mt-6">
              <Button type="submit" variant="primary" size="lg" className="w-full">
                {t('auth.forgot.submit')}
              </Button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate">
          <Link to="/login" className="font-medium text-brand hover:underline">
            {t('auth.forgot.backToLogin')}
          </Link>
        </p>
      </Card>
    </div>
  )
}
