import type { WarehouseAddress } from '../config/warehouse'

export interface FormattedAddress {
  recipient: string
  suite: string
  street: string
  cityStateZip: string
  country: string
  /** Texto multi-linha pronto para colar num formulário de checkout. */
  fullText: string
}

export function formatUsAddress(
  address: WarehouseAddress,
  suite: string,
  recipientName?: string,
): FormattedAddress {
  const recipient = recipientName?.trim() ? recipientName.trim() : address.recipientPrefix
  const cityStateZip = `${address.city}, ${address.state} ${address.zip}`
  const fullText = [recipient, `${address.street}, ${suite}`, cityStateZip, address.country].join('\n')

  return { recipient, suite, street: address.street, cityStateZip, country: address.country, fullText }
}
