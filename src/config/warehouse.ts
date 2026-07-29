/**
 * Endereço público do galpão em Doral, FL. Não é segredo — todo cliente usa
 * o mesmo endereço; quem identifica o cliente é a SUITE (vinda do banco).
 */
export interface WarehouseAddress {
  recipientPrefix: string
  street: string
  city: string
  state: string
  zip: string
  country: string
}

export const WAREHOUSE_ADDRESS: WarehouseAddress = {
  recipientPrefix: 'Your Name',
  street: '8390 NW 25th St',
  city: 'Doral',
  state: 'FL',
  zip: '33122',
  country: 'USA',
}
