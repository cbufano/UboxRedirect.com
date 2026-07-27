import { useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Mail, Clock, MapPin } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Section } from '../components/ui/Section'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

const SUPPORT_EMAIL = 'support@bufanoredirect.com'

export default function Contact() {
  const { t } = useTranslation()
  const [submitted, setSubmitted] = useState(false)

  const nameMessage = t('contact.form.errors.name')
  const emailMessage = t('contact.form.errors.email')
  const messageMessage = t('contact.form.errors.message')

  const schema = z.object({
    name: z.string().min(1, { message: nameMessage }),
    email: z.string().email({ message: emailMessage }),
    message: z.string().min(10, { message: messageMessage }),
  })

  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', message: '' },
  })

  const onSubmit: SubmitHandler<FormValues> = () => {
    setSubmitted(true)
    reset()
  }

  return (
    <>
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t('contact.title')}</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/80">{t('contact.subtitle')}</p>
        </div>
      </section>

      <Section>
        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2">
            <Card>
              {submitted && (
                <p
                  role="status"
                  className="mb-6 rounded-lg bg-brand/10 px-4 py-3 text-sm font-medium text-navy"
                >
                  {t('contact.form.success')}
                </p>
              )}

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <div>
                  <Input
                    label={t('contact.form.nameLabel')}
                    id="name"
                    type="text"
                    autoComplete="name"
                    error={errors.name?.message}
                    {...register('name')}
                  />
                </div>

                <div className="mt-4">
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    aria-label={t('contact.form.emailLabel')}
                    placeholder={t('contact.form.emailLabel')}
                    className={[
                      'mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                      errors.email ? 'border-red-500' : undefined,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-invalid={errors.email ? true : undefined}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    {...register('email')}
                  />
                  {errors.email && (
                    <p id="email-error" className="mt-1 text-sm text-red-600">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div className="mt-4">
                  <label htmlFor="message" className="block">
                    {t('contact.form.messageLabel')}
                    <textarea
                      id="message"
                      rows={5}
                      className={[
                        'mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                        errors.message ? 'border-red-500' : undefined,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-invalid={errors.message ? true : undefined}
                      aria-describedby={errors.message ? 'message-error' : undefined}
                      {...register('message')}
                    />
                  </label>
                  {errors.message && (
                    <p id="message-error" className="mt-1 text-sm text-red-600">
                      {errors.message.message}
                    </p>
                  )}
                </div>

                <div className="mt-6">
                  <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto">
                    {t('contact.form.submit')}
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          <div className="md:col-span-1">
            <Card>
              <h2 className="text-xl font-semibold text-navy">{t('contact.info.title')}</h2>

              <div className="mt-6 flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm text-slate hover:text-brand">
                  {SUPPORT_EMAIL}
                </a>
              </div>

              <div className="mt-6 flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-navy">{t('contact.info.hoursLabel')}</p>
                  <p className="text-sm text-slate">{t('contact.info.hours')}</p>
                </div>
              </div>

              <div className="mt-6 flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-navy">{t('contact.info.addressLabel')}</p>
                  <p className="text-sm text-slate">{t('contact.info.address')}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </Section>
    </>
  )
}
