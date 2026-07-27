import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, name, className, ...props },
  ref,
) {
  const inputId = id ?? name
  const errorId = inputId ? `${inputId}-error` : undefined

  const inputClasses = [
    'mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
    error ? 'border-red-500' : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label htmlFor={inputId} className="block">
      {label}
      <input
        ref={ref}
        id={inputId}
        name={name}
        className={inputClasses}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </label>
  )
})
