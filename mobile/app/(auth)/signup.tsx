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

const COUNTRY_OPTIONS = [
  { value: 'BR', label: 'Brazil' },
  { value: 'US', label: 'United States' },
  { value: 'PT', label: 'Portugal' },
  { value: 'ES', label: 'Spain' },
  { value: 'MX', label: 'Mexico' },
  { value: 'AR', label: 'Argentina' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'OTHER', label: 'Other' },
]

const schema = z
  .object({
    name: z.string().min(1, 'Enter your name'),
    email: z.string().email(),
    country: z.string().min(1, 'Select your country'),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      })
    }
  })

type FormValues = z.infer<typeof schema>

export default function Signup() {
  const [authError, setAuthError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false)

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      country: '',
      password: '',
      confirmPassword: '',
    },
  })

  const onSubmit: SubmitHandler<FormValues> = async ({ name, email, country, password }) => {
    setAuthError(false)
    setSubmitting(true)
    try {
      const { needsEmailConfirmation: needsConfirmation } = await authService.register({
        name,
        email,
        country,
        password,
      })
      if (needsConfirmation) {
        setNeedsEmailConfirmation(true)
      } else {
        router.replace('/(tabs)')
      }
    } catch {
      setAuthError(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (needsEmailConfirmation) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a confirmation link to your inbox. Confirm your email, then come back and log in.
          </Text>
          <View style={styles.submitWrapper}>
            <Button onPress={() => router.replace('/(auth)/login')} size="lg">
              Go to login
            </Button>
          </View>
        </Card>
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Card style={styles.card}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Get your US address and start forwarding packages.</Text>

        {authError && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={styles.errorBannerText}>
              We couldn&apos;t create your account. Please check your details and try again.
            </Text>
          </View>
        )}

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Full name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.name?.message}
              autoComplete="name"
              style={styles.field}
            />
          )}
        />

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
          name="country"
          render={({ field: { onChange, value } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Country</Text>
              <View style={styles.pillRow}>
                {COUNTRY_OPTIONS.map((option) => {
                  const selected = value === option.value
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => onChange(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.pill, selected && styles.pillSelected]}
                    >
                      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{option.label}</Text>
                    </Pressable>
                  )
                })}
              </View>
              {errors.country && <Text style={styles.fieldError}>{errors.country.message}</Text>}
            </View>
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
              autoComplete="new-password"
              secureTextEntry
              style={styles.field}
            />
          )}
        />
        {!errors.password && <Text style={styles.hint}>At least 8 characters.</Text>}

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Confirm password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.confirmPassword?.message}
              autoComplete="new-password"
              secureTextEntry
              style={styles.field}
            />
          )}
        />

        <View style={styles.submitWrapper}>
          <Button onPress={handleSubmit(onSubmit)} loading={submitting} size="lg">
            Sign up
          </Button>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text style={styles.link}>Log in</Text>
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
  label: {
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
  fieldError: {
    marginTop: 4,
    fontSize: 13,
    color: colors.danger,
  },
  hint: {
    marginTop: 4,
    fontSize: 13,
    color: colors.slate,
  },
  submitWrapper: {
    marginTop: 24,
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
