import { forwardRef } from 'react'
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native'
import { colors } from '../../theme/colors'

export interface TextFieldProps extends TextInputProps {
  label: string
  error?: string
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, style, ...props },
  ref,
) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        style={[styles.input, error ? styles.inputError : undefined, style]}
        placeholderTextColor="rgba(15, 23, 42, 0.4)"
        accessibilityLabel={label}
        {...props}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    marginBottom: 4,
    fontSize: 14,
    fontWeight: '500',
    color: colors.slate,
  },
  input: {
    width: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.slate,
    backgroundColor: colors.white,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    marginTop: 4,
    fontSize: 13,
    color: colors.danger,
  },
})
