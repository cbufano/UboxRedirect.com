import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { Card } from '../../src/components/ui/Card'
import { Button } from '../../src/components/ui/Button'
import { TextField } from '../../src/components/ui/TextField'
import { privacyService, type DataRequest } from '../../src/services/privacyService'
import { colors } from '../../src/theme/colors'

type PanelKind = 'export' | 'delete'

const statusStyles: Record<DataRequest['status'], { bg: string; text: string; label: string }> = {
  pending: { bg: 'rgba(15, 23, 42, 0.08)', text: colors.slate, label: 'Pending' },
  processing: { bg: '#FEF3C7', text: '#B45309', label: 'Processing' },
  completed: { bg: 'rgba(22, 163, 74, 0.1)', text: colors.success, label: 'Completed' },
  rejected: { bg: '#FEE2E2', text: colors.danger, label: 'Rejected' },
}

const kindLabels: Record<DataRequest['kind'], string> = {
  export: 'Export data',
  delete: 'Delete account',
}

const rights = [
  'Access and export a copy of the personal data we hold about you.',
  'Request correction of inaccurate or incomplete data.',
  'Request deletion of your account and associated data, subject to legal retention requirements.',
  'Withdraw consent and object to certain processing at any time.',
]

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

export default function Privacy() {
  // --- Past requests list — deliberately its own loading/error state, kept
  // separate from the two request buttons below. Same care already applied
  // in `notify-purchase.tsx`: the request buttons must not be blocked while
  // this list is still loading.
  const [requests, setRequests] = useState<DataRequest[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listLoadError, setListLoadError] = useState(false)

  useEffect(() => {
    let active = true
    privacyService
      .getMyDataRequests()
      .then((data) => {
        if (active) setRequests(data)
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
      const data = await privacyService.getMyDataRequests()
      setRequests(data)
    } catch {
      // Silencioso — o pedido novo já foi enviado com sucesso; a lista só
      // fica desatualizada até o próximo refresh bem-sucedido.
    }
  }

  // --- Request buttons + confirmation panel ---
  const [openPanel, setOpenPanel] = useState<PanelKind | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const openPanelFor = (kind: PanelKind) => {
    setOpenPanel(kind)
    setNote('')
    setSubmitError(false)
    setSubmitSuccess(false)
  }

  const closePanel = () => {
    setOpenPanel(null)
    setNote('')
    setSubmitError(false)
  }

  const handleConfirm = async () => {
    if (!openPanel) return
    setSubmitError(false)
    setSubmitting(true)
    try {
      await privacyService.submitDataRequest({ kind: openPanel, requestNote: note.trim() })
      setSubmitSuccess(true)
      setOpenPanel(null)
      setNote('')
      await refreshList()
    } catch {
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Privacy</Text>
      <Text style={styles.subtitle}>
        Your data rights under LGPD (Brazil) and GDPR (EU) — how to request an export or deletion.
      </Text>

      <Card style={styles.rightsCard}>
        <Text style={styles.cardTitle}>Your rights</Text>
        <View style={styles.rightsList}>
          {rights.map((item) => (
            <View key={item} style={styles.rightsRow}>
              <Text style={styles.rightsBullet}>{'•'}</Text>
              <Text style={styles.rightsText}>{item}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.actionsCard}>
        <View style={styles.actionsRow}>
          <Button size="md" onPress={() => openPanelFor('export')} style={styles.actionButton}>
            Export my data
          </Button>
          <Button
            variant="secondary"
            size="md"
            onPress={() => openPanelFor('delete')}
            style={styles.actionButton}
          >
            Delete my account
          </Button>
        </View>

        {openPanel && (
          <View style={styles.panel}>
            <Text style={styles.panelDescription}>
              {openPanel === 'export'
                ? 'We will prepare a copy of your personal data and contact you with instructions to download it.'
                : 'We will permanently delete your account and associated personal data, subject to legal retention requirements. This cannot be undone.'}
            </Text>

            <TextField
              label="Note (optional)"
              value={note}
              onChangeText={setNote}
              placeholder="Anything you'd like us to know about this request"
              multiline
              numberOfLines={3}
              style={styles.noteField}
            />

            <View style={styles.panelButtons}>
              <Button onPress={handleConfirm} loading={submitting}>
                {openPanel === 'export' ? 'Confirm export request' : 'Confirm deletion request'}
              </Button>
              <Button variant="ghost" onPress={closePanel} disabled={submitting}>
                Cancel
              </Button>
            </View>
          </View>
        )}

        {submitSuccess && (
          <View style={styles.noticeBox} accessibilityRole="alert">
            <Text style={styles.noticeText}>Your request has been submitted.</Text>
          </View>
        )}
        {submitError && (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorText}>Something went wrong submitting your request. Please try again.</Text>
          </View>
        )}
      </Card>

      <Card style={styles.listCard}>
        <Text style={styles.cardTitle}>Your requests</Text>

        {listLoading ? (
          <Text style={styles.emptyText}>Loading…</Text>
        ) : listLoadError ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            Something went wrong loading your requests. Please try again later.
          </Text>
        ) : requests.length === 0 ? (
          <Text style={styles.emptyText}>No requests yet.</Text>
        ) : (
          <View style={styles.list}>
            {requests.map((request) => {
              const status = statusStyles[request.status]
              return (
                <View key={request.id} style={styles.listRow}>
                  <View style={styles.listInfo}>
                    <Text style={styles.listKind}>{kindLabels[request.kind]}</Text>
                    <Text style={styles.listMeta}>
                      Requested {formatDate(request.requestedAt)} · Completed {formatDate(request.completedAt)}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: status.text }]}>{status.label}</Text>
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
  rightsCard: {
    marginTop: 20,
  },
  rightsList: {
    marginTop: 12,
    gap: 8,
  },
  rightsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rightsBullet: {
    fontSize: 14,
    color: colors.brand,
  },
  rightsText: {
    flex: 1,
    fontSize: 14,
    color: colors.slate,
  },
  actionsCard: {
    marginTop: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    flexGrow: 1,
  },
  panel: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
  panelDescription: {
    fontSize: 14,
    color: colors.slate,
  },
  noteField: {
    marginTop: 12,
  },
  panelButtons: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  noticeBox: {
    marginTop: 16,
  },
  noticeText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.success,
  },
  errorBox: {
    marginTop: 16,
  },
  errorText: {
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
  listKind: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.navy,
  },
  listMeta: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.6)',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
})
