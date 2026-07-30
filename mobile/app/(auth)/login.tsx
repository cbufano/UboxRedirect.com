import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useForm, Controller, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, router } from 'expo-router'
import { Card } from '../../src/components/ui/Card'
import { TextField } from '../../src/components/ui/TextField'
import { Button } from '../../src/components/ui/Button'
import { authService } from '../../src/services/authService'
import { colors } from '../../src/theme/colors'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

export default function Login() {
  const [authError, setAuthError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit: SubmitHandler<FormValues> = async ({ email, password }) => {
    setAuthError(false)
    setSubmitting(true)
    try {
      await authService.login(email, password)
      router.replace('/(tabs)')
    } catch {
      setAuthError(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Card style={styles.card}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to manage your shipments.</Text>

        {authError && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={styles.errorBannerText}>Invalid email or password.</Text>
          </View>
        )}

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Email"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={styles.field}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              autoComplete="current-password"
              secureTextEntry
              style={styles.field}
            />
          )}
        />

        <View style={styles.submitWrapper}>
          <Button onPress={handleSubmit(onSubmit)} loading={submitting} size="lg">
            Log in
          </Button>
        </View>

        <Text style={styles.forgotHint}>
          Forgot your password? Use the website to reset it.
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don&apos;t have an account? </Text>
          <Link href="/(auth)/signup" asChild>
            <Pressable>
              <Text style={styles.link}>Sign up</Text>
            </Pressable>
          </Link>
        </View>
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.offwhite,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.navy,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: colors.slate,
  },
  errorBanner: {
    marginTop: 20,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorBannerText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '500',
  },
  field: {
    marginTop: 16,
  },
  submitWrapper: {
    marginTop: 24,
  },
  forgotHint: {
    marginTop: 12,
    fontSize: 13,
    color: colors.slate,
    textAlign: 'center',
  },
  footer: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 14,
    color: colors.slate,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brand,
  },
})
