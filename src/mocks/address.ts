/**
 * Mock US address fixture — the personal warehouse address every customer
 * gets on signup. `recipientPrefix` documents that the customer's own name
 * must be prepended when they fill out a checkout form, so the warehouse
 * can match incoming packages to their `suite` number.
 */
export interface UsAddress {
  recipientPrefix: string
  suite: string
  street: string
  city: string
  state: string
  zip: string
  country: string
}

export const usAddress: UsAddress = {
  recipientPrefix: 'Your Name',
  suite: 'BUF-10482',
  street: '8390 NW 25th St',
  city: 'Doral',
  state: 'FL',
  zip: '33122',
  country: 'USA',
}
