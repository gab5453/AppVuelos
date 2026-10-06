import { Injectable } from '@nestjs/common';
import { CheckInDataContext } from '@ecoairlines/data-access/context/check-in.context.js';
import type { CheckInRecord } from '@ecoairlines/data-access/entities/check-in/check-in.entity.js';
import type { CheckInRepository } from '../../interfaces/check-in/check-in.repository.js';

@Injectable()
export class InMemoryCheckInRepository implements CheckInRepository {
  constructor(private readonly db: CheckInDataContext) {}

  async findByBooking(bookingId: string): Promise<CheckInRecord> {
    return structuredClone(this.db.checkIns.get(bookingId) ?? {});
  }

  async save(bookingId: string, record: CheckInRecord): Promise<void> {
    this.db.checkIns.set(bookingId, structuredClone(record));
  }
}
