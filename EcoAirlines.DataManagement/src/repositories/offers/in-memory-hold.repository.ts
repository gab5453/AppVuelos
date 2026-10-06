import { Injectable } from '@nestjs/common';
import { OffersDataContext } from '@ecoairlines/data-access/context/offers.context.js';
import type { HoldRecord } from '@ecoairlines/data-access/entities/offers/hold.entity.js';
import type { HoldRepository } from '../../interfaces/offers/hold.repository.js';

@Injectable()
export class InMemoryHoldRepository implements HoldRepository {
  constructor(private readonly db: OffersDataContext) {}

  async create(record: HoldRecord): Promise<HoldRecord> {
    this.db.holds.set(record.holdId, record);
    return record;
  }

  async findById(holdId: string): Promise<HoldRecord | undefined> {
    return this.db.holds.get(holdId);
  }

  async save(record: HoldRecord): Promise<HoldRecord> {
    this.db.holds.set(record.holdId, record);
    return record;
  }

  async findExpired(now: Date): Promise<HoldRecord[]> {
    return [...this.db.holds.values()].filter((hold) => hold.status === 'HELD' && hold.expiresAt <= now);
  }
}
