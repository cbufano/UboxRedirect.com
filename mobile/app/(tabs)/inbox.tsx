import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { router } from 'expo-router'
import { packageService, type ReceivedPackage } from '../../src/services/packageService'
import { isSelectable, toggleSelection, pruneSelection } from '../../src/lib/inboxSelection'
import { Card } from '../../src/components/ui/Card'
import { Button } from '../../src/components/ui/Button'
import { colors } from '../../src/theme/colors'

const packageStatusStyles: Record<ReceivedPackage['status'], { bg: string; text: string; label: string }> = {
  received: { bg: 'rgba(15, 23, 42, 0.08)', text: colors.slate, label: 'Received' },
  in_review: { bg: 'rgba(15, 23, 42, 0.08)', text: colors.slate, label: 'In review' },
  ready: { bg: 'rgba(22, 163, 74, 0.1)', text: colors.success, label: 'Ready' },
  consolidating: { bg: '#FEF3C7', text: '#B45309', label: 'Consolidating' },
  shipped: { bg: 'rgba(30, 136, 229, 0.1)', text: colors.brand, label: 'Shipped' },
  discarded: { bg: '#FEE2E2', text: colors.danger, label: 'Discarded' },
}

export default function Inbox() {
  const [packages, setPackages] = useState<ReceivedPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    packageService
      .getMyReceivedPackages()
      .then((data) => {
        if (!active) return
        setPackages(data)
        setSelectedIds((prev) => pruneSelection(prev, data))
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

  const handleToggle = (pkg: ReceivedPackage) => {
    setSelectedIds((prev) => toggleSelection(prev, pkg))
  }

  const handleConsolidate = () => {
    router.push({ pathname: '/ship', params: { ids: JSON.stringify([...selectedIds]) } })
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
          Something went wrong loading your inbox. Please try again later.
        </Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Inbox</Text>
      <Text style={styles.subtitle}>Packages received at the warehouse on your behalf.</Text>

      {packages.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>No packages yet.</Text>
        </Card>
      ) : (
        <>
          <View style={styles.list}>
            {packages.map((pkg) => {
              const selectable = isSelectable(pkg)
              const selected = selectedIds.has(pkg.id)
              const status = packageStatusStyles[pkg.status]
              return (
                <Card key={pkg.id} style={styles.packageCard}>
                  <Pressable
                    onPress={() => selectable && handleToggle(pkg)}
                    disabled={!selectable}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled: !selectable }}
                    accessibilityLabel={`Select package from ${pkg.store}`}
                    style={styles.packageRow}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        selected && styles.checkboxChecked,
                        !selectable && styles.checkboxDisabled,
                      ]}
                    >
                      {selected && <Text style={styles.checkboxMark}>✓</Text>}
                    </View>

                    <View style={styles.packageInfo}>
                      <Text style={styles.packageStore}>{pkg.store}</Text>
                      <Text style={styles.packageDescription}>{pkg.description}</Text>
                      <Text style={styles.packageMeta}>
                        {pkg.weightKg} kg · Received {pkg.receivedAt.slice(0, 10)}
                      </Text>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: status.text }]}>{status.label}</Text>
                    </View>
                  </Pressable>
                </Card>
              )
            })}
          </View>

          <View style={styles.footer}>
            <Button disabled={selectedIds.size === 0} onPress={handleConsolidate} size="lg">
              {`Consolidate (${selectedIds.size})`}
            </Button>
          </View>
        </>
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
  packageCard: {
    padding: 0,
    overflow: 'hidden',
  },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  checkboxDisabled: {
    opacity: 0.35,
  },
  checkboxMark: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
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
  packageMeta: {
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
  footer: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
})
