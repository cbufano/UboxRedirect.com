export interface Package {
  id: string
  store: string
  description: string
  weightKg: number
  receivedDate: string
  status: 'in_box' | 'ready'
  photoUrl?: string
}

export const packages: Package[] = [
  {
    id: 'PKG-1001',
    store: 'Amazon',
    description: 'Wireless noise-cancelling headphones',
    weightKg: 0.6,
    receivedDate: '2026-07-14',
    status: 'ready',
  },
  {
    id: 'PKG-1002',
    store: 'Nike',
    description: 'Running shoes, size 42',
    weightKg: 0.9,
    receivedDate: '2026-07-18',
    status: 'ready',
  },
  {
    id: 'PKG-1003',
    store: 'Best Buy',
    description: 'Portable SSD 2TB',
    weightKg: 0.3,
    receivedDate: '2026-07-21',
    status: 'in_box',
  },
  {
    id: 'PKG-1004',
    store: 'Sephora',
    description: 'Skincare set (3 items)',
    weightKg: 0.8,
    receivedDate: '2026-07-23',
    status: 'in_box',
  },
  {
    id: 'PKG-1005',
    store: 'Apple',
    description: 'USB-C charging cable, 2-pack',
    weightKg: 0.2,
    receivedDate: '2026-07-25',
    status: 'in_box',
  },
]
