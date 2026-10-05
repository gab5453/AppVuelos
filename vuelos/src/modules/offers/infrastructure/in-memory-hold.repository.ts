import { Injectable } from '@nestjs/common';
import type { HoldRecord, HoldRepositoryPort } from '../domain/ports/hold-repository.port.js';

@Injectable()
export class InMemoryHoldRepository implements HoldRepositoryPort {
  private readonly holds = new Map<string, HoldRecord>();

  async create(record: HoldRecord): Promise<HoldRecord> {
    this.holds.set(record.holdId, record);
    return record;
  }

  async findById(holdId: string): Promise<HoldRecord | undefined> {
    return this.holds.get(holdId);
  }

  async save(record: HoldRecord): Promise<HoldRecord> {
    this.holds.set(record.holdId, record);
    return record;
  }

  async findExpired(now: Date): Promise<HoldRecord[]> {
    return [...this.holds.values()].filter((hold) => hold.status === 'HELD' && hold.expiresAt <= now);
  }
}
