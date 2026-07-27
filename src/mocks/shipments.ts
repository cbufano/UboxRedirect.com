export interface Shipment {
  id: string
  date: string
  carrier: string
  trackingCode: string
  status: 'processing' | 'in_transit' | 'delivered'
  itemCount: number
  costUsd: number
}

export const shipments: Shipment[] = [
  {
    id: 'SHP-2001',
    date: '2026-06-02',
    carrier: 'DHL Express',
    trackingCode: 'DHL7788412093',
    status: 'delivered',
    itemCount: 3,
    costUsd: 52,
  },
  {
    id: 'SHP-2002',
    date: '2026-07-10',
    carrier: 'FedEx International',
    trackingCode: 'FDX0091247765',
    status: 'in_transit',
    itemCount: 2,
    costUsd: 41,
  },
  {
    id: 'SHP-2003',
    date: '2026-07-24',
    carrier: 'USPS Priority',
    trackingCode: 'USPS9400111899223344',
    status: 'processing',
    itemCount: 1,
    costUsd: 18,
  },
]
