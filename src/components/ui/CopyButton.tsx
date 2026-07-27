import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyButtonProps {
  /** The exact text written to the clipboard. */
  text: string
  /** Accessible name suffix — the button's accessible name is always "Copy {label}". */
  label: string
  /** Translated text shown next to the icon (e.g. "Copy full address"). Omit for an icon-only button. */
  visibleText?: string
  /** Translated text shown briefly instead of `visibleText` after a successful copy. */
  copiedText?: string
  className?: string
}

const ICON_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-md p-1.5 text-slate/50 transition hover:bg-brand/10 hover:text-brand'

const LABELED_BUTTON_CLASSES =
  'inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90'

const FOCUS_CLASSES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'

export function CopyButton({
  text,
  label,
  visibleText,
  copiedText = 'Copied',
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can fail (permissions, insecure context) — fail silently.
    }
  }

  const classes = [
    visibleText ? LABELED_BUTTON_CLASSES : ICON_BUTTON_CLASSES,
    FOCUS_CLASSES,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" onClick={handleCopy} aria-label={`Copy ${label}`} className={classes}>
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {visibleText && <span>{copied ? copiedText : visibleText}</span>}
    </button>
  )
}
