import { View, StyleSheet, Platform, type ViewProps } from 'react-native'
import { colors } from '../../theme/colors'

type CardProps = ViewProps

export function Card({ style, children, ...props }: CardProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    backgroundColor: colors.white,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      web: { boxShadow: `0 1px 4px 0 rgba(15, 23, 42, 0.05)` },
      default: {
        shadowColor: colors.slate,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
})
