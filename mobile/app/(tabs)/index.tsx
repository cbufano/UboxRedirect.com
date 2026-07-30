import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useAuth } from '../../src/contexts/AuthContext'
import { WAREHOUSE_ADDRESS } from '../../src/config/warehouse'
import { profileService } from '../../src/services/profileService'
import { packageService, type ReceivedPackage } from '../../src/services/packageService'
import { formatUsAddress } from '../../src/lib/address'
import { Card } from '../../src/components/ui/Card'
import { colors } from '../../src/theme/colors'

const packageStatusStyles: Record<ReceivedPackage['status'], { bg: string; text: string; label: string }> = {
  received: { bg: 'rgba(15, 23, 42, 0.08)', text: colors.slate, label: 'Received' },
  in_review: { bg: 'rgba(15, 23, 42, 0.08)', text: colors.slate, label: 'In review' },
  ready: { bg: 'rgba(22, 163, 74, 0.1)', text: colors.success, label: 'Ready' },
  consolidating: { bg: '#FEF3C7', text: '#B45309', label: 'Consolidating' },
  shipped: { bg: 'rgba(30, 136, 229, 0.1)', text: colors.brand, label: 'Shipped' },
  discarded: { bg: '#FEE2E2', text: colors.danger, label: 'Discarded' },
}

interface StatTile {
  key: string
  label: string
  value: number
}

export default function Overview() {
  const { user } = useAuth()
  const [suite, setSuite] = useState<string | null>(null)
  const [inBoxCount, setInBoxCount] = useState(0)
  const [inTransitCount, setInTransitCount] = useState(0)
  const [deliveredCount, setDeliveredCount] = useState(0)
  const [recentPackages, setRecentPackages] = useState<ReceivedPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([
      profileService.getMyProfile(),
      packageService.getMyReceivedPackages(),
      packageService.getMyConsolidations(),
    ])
      .then(([profile, packages, consolidations]) => {
        if (!active) return
        setSuite(profile?.suiteNumber ?? null)
        setInBoxCount(packages.filter((pkg) => pkg.status === 'received' || pkg.status === 'in_review').length)
        setInTransitCount(consolidations.filter((c) => c.status === 'paid' || c.status === 'shipped').length)
        setDeliveredCount(consolidations.filter((c) => c.status === 'delivered').length)
        setRecentPackages([...packages].sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1)).slice(0, 3))
      })
      .catch((error) => {
        console.error('Overview: failed to load dashboard data', error)
        if (active) setLoadError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

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
          Something went wrong loading your dashboard. Please try again later.
        </Text>
      </View>
    )
  }

  // O card mostra o hint genérico de destinatário (o nome já aparece na
  // saudação acima) — o cliente escreve o próprio nome no checkout da loja,
  // e o galpão o identifica pela suite.
  const address = formatUsAddress(WAREHOUSE_ADDRESS, suite ?? '—')

  const statTiles: StatTile[] = [
    { key: 'inBox', label: 'In box', value: inBoxCount },
    { key: 'inTransit', label: 'In transit', value: inTransitCount },
    { key: 'delivered', label: 'Delivered', value: deliveredCount },
  ]

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Overview</Text>
      <Text style={styles.subtitle}>Welcome back{user?.name ? `, ${user.name}` : ''}.</Text>

      <Card style={styles.addressCard}>
        <Text style={styles.cardTitle}>Your US address</Text>
        <View style={styles.addressBlock}>
          <Text style={styles.addressRecipient}>{address.recipient}</Text>
          <Text style={styles.addressLine}>{address.street}</Text>
          <View style={styles.suiteBadge}>
            <Text style={styles.suiteBadgeText}>Suite: {address.suite}</Text>
          </View>
          <Text style={styles.addressLine}>{address.cityStateZip}</Text>
          <Text style={styles.addressLine}>{address.country}</Text>
        </View>
        <Text style={styles.addressNote}>
          Use this address (with your suite number) as the shipping address at any US store.
        </Text>
      </Card>

      <View style={styles.statsRow}>
        {statTiles.map((tile) => (
          <Card key={tile.key} style={styles.statCard}>
            <Text style={styles.statValue}>{tile.value}</Text>
            <Text style={styles.statLabel}>{tile.label}</Text>
          </Card>
        ))}
      </View>

      <Card style={styles.activityCard}>
        <Text style={styles.cardTitle}>Recent activity</Text>
        {recentPackages.length === 0 ? (
          <Text style={styles.emptyText}>No packages yet.</Text>
        ) : (
          <View style={styles.activityList}>
            {recentPackages.map((pkg) => {
              const statusStyle = packageStatusStyles[pkg.status]
              return (
                <View key={pkg.id} style={styles.activityRow}>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityStore}>{pkg.store}</Text>
                    <Text style={styles.activityDescription}>{pkg.description}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
                  </View>
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
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.navy,
  },
  addressCard: {
    marginTop: 20,
  },
  addressBlock: {
    marginTop: 12,
  },
  addressRecipient: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.navy,
  },
  addressLine: {
    marginTop: 2,
    fontSize: 14,
    color: colors.slate,
  },
  suiteBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(30, 136, 229, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  suiteBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand,
  },
  addressNote: {
    marginTop: 12,
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.6)',
  },
  statsRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.navy,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: colors.slate,
    textAlign: 'center',
  },
  activityCard: {
    marginTop: 16,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 14,
    color: colors.slate,
  },
  activityList: {
    marginTop: 10,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  activityInfo: {
    flex: 1,
  },
  activityStore: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.navy,
  },
  activityDescription: {
    marginTop: 2,
    fontSize: 13,
    color: colors.slate,
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
})
