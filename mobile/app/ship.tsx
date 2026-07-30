import { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { useForm, Controller, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Stack, useLocalSearchParams } from 'expo-router'
import { packageService, type ReceivedPackage } from '../src/services/packageService'
import { rateService, type RateEstimate } from '../src/services/rateService'
import { parseSelectedIds, selectPackages, computeTotalWeightKg, resolveChosenOption } from '../src/lib/shipSelection'
import { Card } from '../src/components/ui/Card'
import { TextField } from '../src/components/ui/TextField'
import { Button } from '../src/components/ui/Button'
import { colors } from '../src/theme/colors'

const COUNTRY_OPTIONS = [
  { value: 'BR', label: 'Brazil' },
  { value: 'US', label: 'United States' },
  { value: 'PT', label: 'Portugal' },
  { value: 'ES', label: 'Spain' },
  { value: 'MX', label: 'Mexico' },
  { value: 'AR', label: 'Argentina' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'OTHER', label: 'Other' },
] as const

// Consolidated box dimensions assumed for the estimate, in centimeters —
// mirrors BOX_DIMENSION_CM in src/pages/dashboard/Ship.tsx (site).
const BOX_DIMENSION_CM = 40

interface OrderConfirmation {
  reference: string
  destinationCountry: string
  carrier: string
  costUsd: number
}

const schema = z.object({
  recipientName: z.string().min(1, "Enter the recipient's full name"),
  street: z.string().min(1, 'Enter the street address'),
  city: z.string().min(1, 'Enter the city'),
  stateProvince: z.string().optional(),
  postalCode: z.string().min(1, 'Enter the postal code'),
  contentsDescription: z.string().min(3, 'Describe the contents (at least 3 characters)'),
  declaredValueUsd: z.coerce.number().positive('Enter a value greater than zero'),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

function countryLabel(code: string): string {
  return COUNTRY_OPTIONS.find((option) => option.value === code)?.label ?? code
}

export default function Ship() {
  const params = useLocalSearchParams<{ ids?: string }>()
  const selectedIds = useMemo(() => parseSelectedIds(params.ids), [params.ids])

  const [packages, setPackages] = useState<ReceivedPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    packageService
      .getMyReceivedPackages()
      .then((data) => {
        if (active) setPackages(data)
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

  const selected = useMemo(() => selectPackages(packages, selectedIds), [packages, selectedIds])
  const totalWeightKg = useMemo(() => computeTotalWeightKg(selected), [selected])

  const [destinationCountry, setDestinationCountry] = useState<string>('BR')
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderConfirmation | null>(null)
  const [submitError, setSubmitError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [estimate, setEstimate] = useState<RateEstimate | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)
  const [estimateError, setEstimateError] = useState(false)

  useEffect(() => {
    if (totalWeightKg <= 0) {
      setEstimate(null)
      return
    }
    let active = true
    setEstimateLoading(true)
    setEstimateError(false)
    rateService
      .estimateShippingCost({
        destinationCountry,
        weightKg: totalWeightKg,
        lengthCm: BOX_DIMENSION_CM,
        widthCm: BOX_DIMENSION_CM,
        heightCm: BOX_DIMENSION_CM,
      })
      .then((result) => {
        if (active) setEstimate(result)
      })
      .catch(() => {
        if (active) {
          setEstimate(null)
          setEstimateError(true)
        }
      })
      .finally(() => {
        if (active) setEstimateLoading(false)
      })
    return () => {
      active = false
    }
  }, [destinationCountry, totalWeightKg])

  const chosenOption = resolveChosenOption(estimate?.options, selectedCarrier)

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      recipientName: '',
      street: '',
      city: '',
      stateProvince: '',
      postalCode: '',
      contentsDescription: '',
      declaredValueUsd: undefined,
    },
  })

  const onValid: SubmitHandler<FormOutput> = async (values) => {
    if (!chosenOption || !estimate) return
    setSubmitError(false)
    setSubmitting(true)
    try {
      const consolidationId = await packageService.createConsolidation({
        recipientName: values.recipientName,
        street: values.street,
        city: values.city,
        stateProvince: values.stateProvince || undefined,
        postalCode: values.postalCode,
        country: destinationCountry,
        carrier: chosenOption.carrier,
        chargeableWeightKg: estimate.chargeableWeightKg,
        costUsd: chosenOption.costUsd,
        contentsDescription: values.contentsDescription,
        declaredValueUsd: values.declaredValueUsd,
      })
      await packageService.addConsolidationItems(
        consolidationId,
        selected.map((pkg) => pkg.id),
      )
      setOrder({
        reference: `CONS-${consolidationId.slice(0, 8).toUpperCase()}`,
        destinationCountry,
        carrier: chosenOption.carrier,
        costUsd: chosenOption.costUsd,
      })
    } catch {
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ headerShown: true, title: 'Consolidate & Ship' }} />
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    )
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ headerShown: true, title: 'Consolidate & Ship' }} />
        <Text style={styles.errorText} accessibilityRole="alert">
          We couldn&apos;t load your packages. Please try again later.
        </Text>
      </View>
    )
  }

  if (order) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ headerShown: true, title: 'Consolidate & Ship' }} />
        <Text style={styles.title}>Consolidate & Ship</Text>
        <Card style={styles.confirmationCard} accessibilityRole="alert">
          <Text style={styles.confirmationTitle}>Order placed!</Text>
          <View style={styles.confirmationList}>
            <Text style={styles.confirmationRow}>Shipment reference: {order.reference}</Text>
            <Text style={styles.confirmationRow}>Destination: {countryLabel(order.destinationCountry)}</Text>
            <Text style={styles.confirmationRow}>Carrier: {order.carrier}</Text>
            <Text style={styles.confirmationRow}>Total cost: ${order.costUsd.toFixed(2)}</Text>
          </View>
        </Card>
      </ScrollView>
    )
  }

  if (selected.length === 0) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ headerShown: true, title: 'Consolidate & Ship' }} />
        <Text style={styles.title}>Consolidate & Ship</Text>
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>No packages to ship. Add packages to your inbox first.</Text>
        </Card>
      </ScrollView>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: 'Consolidate & Ship' }} />
      <Text style={styles.title}>Consolidate & Ship</Text>
      <Text style={styles.subtitle}>
        Review your consolidated box, pick a destination and carrier, declare its contents, and place your order.
      </Text>

      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>Selected packages</Text>
        <View style={styles.packageList}>
          {selected.map((pkg) => (
            <View key={pkg.id} style={styles.packageRow}>
              <View style={styles.packageInfo}>
                <Text style={styles.packageStore}>{pkg.store}</Text>
                <Text style={styles.packageDescription}>{pkg.description}</Text>
              </View>
              <Text style={styles.packageWeight}>{pkg.weightKg} kg</Text>
            </View>
          ))}
        </View>
        <Text style={styles.totalWeight}>Total actual weight: {totalWeightKg} kg</Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>Destination & carrier</Text>
        <Text style={styles.fieldLabel}>Destination country</Text>
        <View style={styles.pillRow}>
          {COUNTRY_OPTIONS.map((option) => {
            const selectedCountry = destinationCountry === option.value
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setDestinationCountry(option.value)
                  setSelectedCarrier(null)
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedCountry }}
                style={[styles.pill, selectedCountry && styles.pillSelected]}
              >
                <Text style={[styles.pillText, selectedCountry && styles.pillTextSelected]}>{option.label}</Text>
              </Pressable>
            )
          })}
        </View>

        <Text style={styles.boxNote}>
          Estimate assumes a consolidated box of 40 x 40 x 40 cm. Actual dimensions are confirmed once your box is
          packed.
        </Text>

        {estimateLoading && (
          <Text style={styles.calculatingText} accessibilityRole="text">
            Calculating shipping options…
          </Text>
        )}

        {estimateError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            We couldn&apos;t calculate shipping options. Please try again.
          </Text>
        )}

        {estimate && !estimateLoading && (
          <>
            <Text style={styles.chargeableWeight}>Chargeable weight: {estimate.chargeableWeightKg} kg</Text>
            <View style={styles.carrierList}>
              {estimate.options.map((option) => {
                const isChosen = chosenOption?.carrier === option.carrier
                return (
                  <Pressable
                    key={option.carrier}
                    onPress={() => setSelectedCarrier(option.carrier)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isChosen }}
                    style={[styles.carrierCard, isChosen && styles.carrierCardSelected]}
                  >
                    <View style={styles.radioOuter}>{isChosen && <View style={styles.radioInner} />}</View>
                    <View style={styles.carrierInfo}>
                      <Text style={styles.carrierName}>{option.carrier}</Text>
                      <Text style={styles.carrierEta}>ETA: {option.etaDays} days</Text>
                      <Text style={styles.carrierCost}>${option.costUsd.toFixed(2)}</Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </>
        )}
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>Delivery address</Text>

        <Controller
          control={control}
          name="recipientName"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Recipient name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.recipientName?.message}
              style={styles.field}
            />
          )}
        />

        <Controller
          control={control}
          name="street"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Street address"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.street?.message}
              style={styles.field}
            />
          )}
        />

        <Controller
          control={control}
          name="city"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="City"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.city?.message}
              style={styles.field}
            />
          )}
        />

        <Controller
          control={control}
          name="stateProvince"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="State / Province (optional)"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.stateProvince?.message}
              style={styles.field}
            />
          )}
        />

        <Controller
          control={control}
          name="postalCode"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Postal code"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.postalCode?.message}
              style={styles.field}
            />
          )}
        />
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>Customs declaration</Text>

        <Controller
          control={control}
          name="contentsDescription"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Contents description"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.contentsDescription?.message}
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
      </Card>

      {chosenOption && (
        <Card style={styles.sectionCard}>
          <Text style={styles.cardTitle}>Cost summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Chargeable weight</Text>
            <Text style={styles.summaryValue}>{estimate?.chargeableWeightKg} kg</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Carrier</Text>
            <Text style={styles.summaryValue}>{chosenOption.carrier}</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotalRow]}>
            <Text style={styles.summaryTotalLabel}>Total cost</Text>
            <Text style={styles.summaryTotalValue}>${chosenOption.costUsd.toFixed(2)}</Text>
          </View>
        </Card>
      )}

      {submitError && (
        <Card style={styles.errorCard} accessibilityRole="alert">
          <Text style={styles.errorCardText}>We couldn&apos;t place your order. Please try again.</Text>
        </Card>
      )}

      <View style={styles.submitWrapper}>
        <Button
          disabled={!chosenOption}
          loading={submitting}
          size="lg"
          onPress={handleSubmit(onValid)}
        >
          Place order
        </Button>
      </View>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.offwhite,
  },
  errorText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.navy,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: colors.slate,
  },
  emptyCard: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: colors.slate,
    textAlign: 'center',
  },
  confirmationCard: {
    marginTop: 20,
  },
  confirmationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.navy,
  },
  confirmationList: {
    marginTop: 12,
    gap: 4,
  },
  confirmationRow: {
    fontSize: 14,
    color: colors.slate,
  },
  sectionCard: {
    marginTop: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.navy,
  },
  packageList: {
    marginTop: 12,
    gap: 10,
  },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  packageInfo: {
    flex: 1,
  },
  packageStore: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.navy,
  },
  packageDescription: {
    marginTop: 2,
    fontSize: 13,
    color: colors.slate,
  },
  packageWeight: {
    fontSize: 13,
    color: colors.slate,
  },
  totalWeight: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: colors.navy,
  },
  fieldLabel: {
    marginTop: 16,
    marginBottom: 4,
    fontSize: 14,
    fontWeight: '500',
    color: colors.slate,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  pillText: {
    fontSize: 13,
    color: colors.slate,
  },
  pillTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  boxNote: {
    marginTop: 12,
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.6)',
  },
  calculatingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.slate,
  },
  chargeableWeight: {
    marginTop: 16,
    fontSize: 14,
    color: colors.slate,
  },
  carrierList: {
    marginTop: 12,
    gap: 10,
  },
  carrierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  carrierCardSelected: {
    borderColor: colors.brand,
    backgroundColor: 'rgba(30, 136, 229, 0.05)',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand,
  },
  carrierInfo: {
    flex: 1,
  },
  carrierName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.navy,
  },
  carrierEta: {
    marginTop: 2,
    fontSize: 13,
    color: colors.slate,
  },
  carrierCost: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  field: {
    marginTop: 16,
  },
  summaryRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.7)',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.navy,
  },
  summaryTotalRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.navy,
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: '700',
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
  submitWrapper: {
    marginTop: 20,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
})
