import { Injectable } from '@nestjs/common';
import { CustomersDataContext } from '@ecoairlines/data-access/context/customers.context.js';
import type { CustomerProfileRecord } from '@ecoairlines/data-access/entities/customers/customer-profile.entity.js';
import type { CustomerProfileRepository } from '../../interfaces/customers/customer-profile.repository.js';

@Injectable()
export class InMemoryCustomerProfileRepository implements CustomerProfileRepository {
  constructor(private readonly db: CustomersDataContext) {}

  async findByOwner(ownerId: string): Promise<CustomerProfileRecord | undefined> {
    const profile = this.db.profiles.get(ownerId);
    return profile && structuredClone(profile);
  }

  async save(profile: CustomerProfileRecord): Promise<CustomerProfileRecord> {
    this.db.profiles.set(profile.ownerId, structuredClone(profile));
    return profile;
  }
}
