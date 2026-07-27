import type { UsAddress } from '../mocks/address'

export interface FormattedAddress {
  /** The recipient line — the signed-in user's name, falling back to a placeholder. */
  recipient: string
  suite: string
  street: string
  cityStateZip: string
  country: string
  /** Multi-line text ready to paste into a checkout form's address field. */
  fullText: string
}

/**
 * Formats the shared mock US warehouse address for display and clipboard copy.
 * `recipientName` should be the signed-in user's name so the recipient line
 * always matches an account the customer recognizes.
 */
export function formatUsAddress(address: UsAddress, recipientName?: string): FormattedAddress {
  const recipient = recipientName?.trim() ? recipientName.trim() : address.recipientPrefix
  const cityStateZip = `${address.city}, ${address.state} ${address.zip}`
  const fullText = [recipient, `${address.street}, ${address.suite}`, cityStateZip, address.country].join(
    '\n',
  )

  return {
    recipient,
    suite: address.suite,
    street: address.street,
    cityStateZip,
    country: address.country,
    fullText,
  }
}
