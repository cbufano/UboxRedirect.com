import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { useForm, Controller, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card } from '../../src/components/ui/Card'
import { TextField } from '../../src/components/ui/TextField'
import { Button } from '../../src/components/ui/Button'
import { packageService, type ExpectedPackage } from '../../src/services/packageService'
import { colors } from '../../src/theme/colors'

const statusStyles: Record<ExpectedPackage['status'], { bg: string; text: string; label: string }> = {
  pending: { bg: 'rgba(15, 23, 42, 0.08)', text: colors.slate, label: 'Pending' },
  matched: { bg: 'rgba(22, 163, 74, 0.1)', text: colors.success, label: 'Matched' },
  cancelled: { bg: '#FEE2E2', text: colors.danger, label: 'Cancelled' },
}

const schema = z.object({
  store: z.string().min(1, 'Store is required'),
  trackingNumber: z.string().optional(),
  description: z.string().min(3, 'Description must be at least 3 characters'),
  declaredValueUsd: z.coerce.number().positive('Enter a valid declared value'),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

export default function NotifyPurchase() {
  const [items, setItems] = useState<ExpectedPackage[]>([])
  // Loading da LISTA de pré-alertas existentes — deliberadamente separado do
  // estado de submit do formulário abaixo. Bug já corrigido no site: os
  // botões de ação do formulário não podem ficar bloqueados enquanto a
  // lista carrega (ver `src/pages/dashboard/NotifyPurchase.tsx`).
  const [listLoading, setListLoading] = useState(true)
  const [listLoadError, setListLoadError] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState(false)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { store: '', trackingNumber: '', description: '', declaredValueUsd: undefined },
  })

  useEffect(() => {
    let active = true
    packageService
      .getMyExpectedPackages()
      .then((data) => {
        if (active) setItems(data)
      })
      .catch(() => {
        if (active) setListLoadError(true)
      })
      .finally(() => {
        if (active) setListLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

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
    setSubmitSuccess(false)
    setSubmitting(true)
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
    } finally {
      setSubmitting(false)
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Pre-alert a purchase</Text>
      <Text style={styles.subtitle}>
        Tell us what you bought so we can match it to the package when it arrives at the warehouse.
      </Text>

      <Card style={styles.formCard}>
        <Text style={styles.cardTitle}>New pre-alert</Text>

        <Controller
          control={control}
          name="store"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Store"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.store?.message}
              style={styles.field}
            />
          )}
        />

        <Controller
          control={control}
          name="trackingNumber"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Tracking number (optional)"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.trackingNumber?.message}
              style={styles.field}
            />
          )}
        />

        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Description"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.description?.message}
              style={styles.field}
            />
          )}
        />

        <Controller
          control={control}
          name="declaredValueUsd"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Declared value (USD)"
              value={value === undefined ? '' : String(value)}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.declaredValueUsd?.message}
              keyboardType="decimal-pad"
              style={styles.field}
            />
          )}
        />

        <View style={styles.submitWrapper}>
          <Button onPress={handleSubmit(onValid)} loading={submitting} size="lg">
            Submit pre-alert
          </Button>
        </View>
      </Card>

      {submitSuccess && (
        <Card style={styles.noticeCard} accessibilityRole="alert">
          <Text style={styles.noticeText}>Pre-alert submitted successfully.</Text>
        </Card>
      )}

      {submitError && (
        <Card style={styles.errorCard} accessibilityRole="alert">
          <Text style={styles.errorCardText}>Something went wrong submitting your pre-alert. Please try again.</Text>
        </Card>
      )}

      {cancelError && (
        <Card style={styles.errorCard} accessibilityRole="alert">
          <Text style={styles.errorCardText}>Something went wrong cancelling that pre-alert. Please try again.</Text>
        </Card>
      )}

      <Card style={styles.listCard}>
        <Text style={styles.cardTitle}>Your pre-alerts</Text>

        {listLoading ? (
          <Text style={styles.emptyText}>Loading…</Text>
        ) : listLoadError ? (
          <Text style={styles.errorCardText} accessibilityRole="alert">
            Something went wrong loading your pre-alerts. Please try again later.
          </Text>
        ) : items.length === 0 ? (
          <Text style={styles.emptyText}>No pre-alerts yet.</Text>
        ) : (
          <View style={styles.list}>
            {items.map((item) => {
              const status = statusStyles[item.status]
              return (
                <View key={item.id} style={styles.listRow}>
                  <View style={styles.listInfo}>
                    <Text style={styles.listStore}>{item.store}</Text>
                    <Text style={styles.listDescription}>{item.description}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: status.text }]}>{status.label}</Text>
                    </View>
                  </View>
                  {item.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={cancelingId === item.id}
                      loading={cancelingId === item.id}
                      onPress={() => handleCancel(item.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </View>
              )
            })}
          </View>
        )}
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.offwhite,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.navy,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: colors.slate,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.navy,
  },
  formCard: {
    marginTop: 20,
  },
  field: {
    marginTop: 16,
  },
  submitWrapper: {
    marginTop: 20,
  },
  noticeCard: {
    marginTop: 16,
  },
  noticeText: {
    fontSize: 14,
    color: colors.navy,
  },
  errorCard: {
    marginTop: 16,
    backgroundColor: '#FEF2F2',
    borderColor: 'transparent',
  },
  errorCardText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.danger,
  },
  listCard: {
    marginTop: 16,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 14,
    color: colors.slate,
  },
  list: {
    marginTop: 10,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  listInfo: {
    flex: 1,
  },
  listStore: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.navy,
  },
  listDescription: {
    marginTop: 2,
    fontSize: 13,
    color: colors.slate,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
})
