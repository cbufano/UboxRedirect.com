import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, AppState, Alert } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { packageService, type Consolidation } from '../../src/services/packageService'
import { paymentService } from '../../src/services/paymentService'
import { Card } from '../../src/components/ui/Card'
import { Button } from '../../src/components/ui/Button'
import { colors } from '../../src/theme/colors'

/**
 * Mesmas 5 cores de status usadas em `src/pages/dashboard/Shipments.tsx`
 * (site): pending âmbar, paid azul-marca, shipped azul, delivered verde,
 * cancelled vermelho.
 */
const statusStyles: Record<Consolidation['status'], { bg: string; text: string; label: string }> = {
  pending: { bg: '#FEF3C7', text: '#B45309', label: 'Pending payment' },
  paid: { bg: 'rgba(30, 136, 229, 0.1)', text: colors.brand, label: 'Paid' },
  shipped: { bg: '#DBEAFE', text: '#1D4ED8', label: 'Shipped' },
  delivered: { bg: 'rgba(22, 163, 74, 0.1)', text: colors.success, label: 'Delivered' },
  cancelled: { bg: '#FEE2E2', text: colors.danger, label: 'Cancelled' },
}

export default function Shipments() {
  const [consolidations, setConsolidations] = useState<Consolidation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)

  const fetchConsolidations = useCallback(() => {
    return packageService
      .getMyConsolidations()
      .then((data) => {
        setConsolidations(data)
        setLoadError(false)
      })
      .catch(() => {
        setLoadError(true)
      })
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchConsolidations().finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [fetchConsolidations])

  // Não há deep link de volta ao app após o Stripe Checkout (ver nota no
  // cabeçalho do plano de Fase 6): o app abre o checkout num browser in-app
  // e, quando o usuário volta ao app (AppState -> 'active'), refaz a busca
  // das consolidações — esse é o mecanismo real de refletir o pagamento.
  const appState = useRef(AppState.currentState)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        fetchConsolidations()
      }
      appState.current = nextAppState
    })
    return () => subscription.remove()
  }, [fetchConsolidations])

  const handlePayNow = async (id: string) => {
    setPayingId(id)
    try {
      const { url } = await paymentService.createCheckoutSession(id)
      await WebBrowser.openBrowserAsync(url)
    } catch (error) {
      Alert.alert(
        'Payment unavailable',
        error instanceof Error ? error.message : 'We could not start the checkout. Please try again later.',
      )
    } finally {
      setPayingId(null)
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    )
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText} accessibilityRole="alert">
          Something went wrong loading your shipments. Please try again later.
        </Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Shipments</Text>
      <Text style={styles.subtitle}>Track your consolidated boxes and pay for the ones awaiting payment.</Text>

      {consolidations.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>No shipments yet.</Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {consolidations.map((consolidation) => {
            const status = statusStyles[consolidation.status]
            return (
              <Card key={consolidation.id} style={styles.shipmentCard}>
                <View style={styles.headerRow}>
                  <View style={styles.headerInfo}>
                    <Text style={styles.destination}>
                      {consolidation.city}, {consolidation.country}
                    </Text>
                    <Text style={styles.meta}>Created {consolidation.createdAt.slice(0, 10)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: status.text }]}>{status.label}</Text>
                  </View>
                </View>

                <View style={styles.detailsRow}>
                  {consolidation.carrier && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Carrier</Text>
                      <Text style={styles.detailValue}>{consolidation.carrier}</Text>
                    </View>
                  )}
                  {consolidation.costUsd !== null && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Cost</Text>
                      <Text style={styles.detailValue}>${consolidation.costUsd.toFixed(2)}</Text>
                    </View>
                  )}
                  {(consolidation.status === 'shipped' || consolidation.status === 'delivered') && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Tracking</Text>
                      <Text style={styles.detailValue}>{consolidation.trackingCode ?? 'Not available yet'}</Text>
                    </View>
                  )}
                </View>

                {consolidation.status === 'pending' && (
                  <View style={styles.footer}>
                    <Button
                      size="sm"
                      loading={payingId === consolidation.id}
                      disabled={payingId !== null && payingId !== consolidation.id}
                      onPress={() => handlePayNow(consolidation.id)}
                    >
                      Pay now
                    </Button>
                  </View>
                )}
              </Card>
            )
          })}
        </View>
      )}
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
    marginTop: 4,
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
  },
  list: {
    marginTop: 16,
    gap: 12,
  },
  shipmentCard: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerInfo: {
    flex: 1,
  },
  destination: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.navy,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.6)',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailsRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  detailItem: {},
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'rgba(15, 23, 42, 0.5)',
  },
  detailValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '500',
    color: colors.navy,
  },
  footer: {
    marginTop: 12,
    alignItems: 'flex-start',
  },
})
