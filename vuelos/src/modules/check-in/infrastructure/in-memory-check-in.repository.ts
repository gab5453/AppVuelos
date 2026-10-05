import { Injectable } from '@nestjs/common';
import type { CheckInRecord, CheckInRepositoryPort } from '../domain/ports/check-in-repository.port.js';

@Injectable()
export class InMemoryCheckInRepository implements CheckInRepositoryPort {
  private readonly checkIns = new Map<string, CheckInRecord>();

  async findByBooking(bookingId: string): Promise<CheckInRecord> {
    return structuredClone(this.checkIns.get(bookingId) ?? {});
  }

  async save(bookingId: string, record: CheckInRecord): Promise<void> {
    this.checkIns.set(bookingId, structuredClone(record));
  }
}
