import { useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { authService } from '../../services/authService'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [authError, setAuthError] = useState(false)

  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  })

  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit: SubmitHandler<FormValues> = ({ email, password }) => {
    setAuthError(false)
    try {
      authService.login(email, password)
      navigate('/app')
    } catch {
      setAuthError(true)
    }
  }

  return (
    <div className="mx-auto my-16 max-w-md px-4">
      <Card>
        <h1 className="text-3xl font-bold text-navy">{t('auth.login.title')}</h1>
        <p className="mt-2 text-sm text-slate">{t('auth.login.subtitle')}</p>

        {authError && (
          <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('auth.login.error')}
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6">
          <Input
            label={t('auth.login.email')}
            id="email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <div className="mt-4">
            <Input
              label={t('auth.login.password')}
              id="password"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
          </div>

          <div className="mt-2 text-right">
            <Link to="/forgot" className="text-sm text-brand hover:underline">
              {t('auth.login.forgot')}
            </Link>
          </div>

          <div className="mt-6">
            <Button type="submit" variant="primary" size="lg" className="w-full">
              {t('auth.login.submit')}
            </Button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-slate">
          {t('auth.login.noAccount')}{' '}
          <Link to="/signup" className="font-medium text-brand hover:underline">
            {t('auth.login.signupLink')}
          </Link>
        </p>
      </Card>
    </div>
  )
}
