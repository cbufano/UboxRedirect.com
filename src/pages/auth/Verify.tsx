import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'

export default function Verify() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto my-16 max-w-md px-4">
      <Card className="text-center">
        <MailCheck className="mx-auto h-12 w-12 text-brand" aria-hidden="true" />
        <h1 className="mt-4 text-3xl font-bold text-navy">{t('auth.verify.title')}</h1>
        <p className="mt-2 text-sm text-slate">{t('auth.verify.body')}</p>

        <div className="mt-6">
          <Link to="/login">
            <Button type="button" variant="primary" size="lg" className="w-full">
              {t('auth.verify.cta')}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
