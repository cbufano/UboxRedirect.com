import type { ReactNode } from 'react'

interface SectionProps {
  children: ReactNode
  muted?: boolean
  className?: string
}

export function Section({ children, muted = false, className }: SectionProps) {
  const sectionClasses = [muted ? 'bg-offwhite' : undefined, className]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={sectionClasses || undefined}>
      <div className="mx-auto max-w-6xl px-4 py-16">{children}</div>
    </section>
  )
}
