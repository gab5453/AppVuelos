import type { CustomerProfileRecord } from '@ecoairlines/data-access/entities/customers/customer-profile.entity.js';

export const CUSTOMER_PROFILE_REPOSITORY = Symbol('CUSTOMER_PROFILE_REPOSITORY');

/** Repositorio de perfiles de cliente. **Base de datos futura: `customers`**. Privado de customers. */
export interface CustomerProfileRepository {
  findByOwner(ownerId: string): Promise<CustomerProfileRecord | undefined>;
  save(profile: CustomerProfileRecord): Promise<CustomerProfileRecord>;
}
