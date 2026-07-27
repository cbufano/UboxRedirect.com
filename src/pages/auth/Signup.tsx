import { useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { authService } from '../../services/authService'

const COUNTRY_OPTIONS = [
  { value: 'BR', label: 'Brazil' },
  { value: 'US', label: 'United States' },
  { value: 'PT', label: 'Portugal' },
  { value: 'ES', label: 'Spain' },
  { value: 'MX', label: 'Mexico' },
  { value: 'AR', label: 'Argentina' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'OTHER', label: 'Other' },
]

export default function Signup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [authError, setAuthError] = useState(false)

  const schema = z
    .object({
      name: z.string().min(1, t('auth.signup.name')),
      email: z.string().email(),
      country: z.string().min(1),
      password: z.string().min(8, t('auth.signup.passwordHint')),
      confirmPassword: z.string().min(1),
      terms: z.boolean().refine((v) => v === true, {
        message: t('auth.signup.terms'),
      }),
    })
    .superRefine((data, ctx) => {
      if (data.password !== data.confirmPassword) {
        ctx.addIssue({
          code: 'custom',
          path: ['confirmPassword'],
          message: t('auth.signup.passwordMismatch'),
        })
      }
    })

  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      country: '',
      password: '',
      confirmPassword: '',
      terms: false,
    },
  })

  const onSubmit: SubmitHandler<FormValues> = ({ name, email, country, password }) => {
    setAuthError(false)
    try {
      authService.register({ name, email, country, password })
      navigate('/app')
    } catch {
      setAuthError(true)
    }
  }

  return (
    <div className="mx-auto my-16 max-w-md px-4">
      <Card>
        <h1 className="text-3xl font-bold text-navy">{t('auth.signup.title')}</h1>
        <p className="mt-2 text-sm text-slate">{t('auth.signup.subtitle')}</p>

        {authError && (
          <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('auth.signup.error')}
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6">
          <Input
            label={t('auth.signup.name')}
            id="name"
            type="text"
            autoComplete="name"
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="mt-4">
            <Input
              label={t('auth.signup.email')}
              id="email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
          </div>

          <div className="mt-4">
            <label htmlFor="country" className="block">
              {t('auth.signup.country')}
              <select
                id="country"
                className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-invalid={errors.country ? true : undefined}
                {...register('country')}
              >
                <option value="" disabled>
                  {t('auth.signup.country')}
                </option>
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {errors.country && <p className="mt-1 text-sm text-red-600">{errors.country.message}</p>}
          </div>

          <div className="mt-4">
            <Input
              label={t('auth.signup.password')}
              id="password"
              type="password"
              autoComplete="new-password"
              error={errors.password?.message}
              {...register('password')}
            />
            {!errors.password && <p className="mt-1 text-sm text-slate">{t('auth.signup.passwordHint')}</p>}
          </div>

          <div className="mt-4">
            <Input
              label={t('auth.signup.confirmPassword')}
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
          </div>

          <div className="mt-4 flex items-start gap-2">
            <input
              type="checkbox"
              id="terms"
              className="mt-1"
              aria-invalid={errors.terms ? true : undefined}
              {...register('terms')}
            />
            <label htmlFor="terms" className="text-sm text-slate">
              <Trans
                i18nKey="auth.signup.terms"
                components={{
                  termsLink: <Link to="/terms" className="font-medium text-brand hover:underline" />,
                }}
              />
            </label>
          </div>
          {errors.terms && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {errors.terms.message}
            </p>
          )}

          <div className="mt-6">
            <Button type="submit" variant="primary" size="lg" className="w-full">
              {t('auth.signup.submit')}
            </Button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-slate">
          {t('auth.signup.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            {t('auth.signup.loginLink')}
          </Link>
        </p>
      </Card>
    </div>
  )
}
