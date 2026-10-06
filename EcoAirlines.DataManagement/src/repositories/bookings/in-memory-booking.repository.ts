import { Injectable } from '@nestjs/common';
import { BookingsDataContext } from '@ecoairlines/data-access/context/bookings.context.js';
import type { BookingRecord } from '@ecoairlines/data-access/entities/bookings/booking.entity.js';
import type { BookingRepository } from '../../interfaces/bookings/booking.repository.js';

@Injectable()
export class InMemoryBookingRepository implements BookingRepository {
  constructor(private readonly db: BookingsDataContext) {}

  async create(record: BookingRecord): Promise<BookingRecord> {
    this.db.bookings.set(record.bookingId, record);
    return record;
  }

  async findById(bookingId: string): Promise<BookingRecord | undefined> {
    return this.db.bookings.get(bookingId);
  }

  async findByPnr(pnr: string): Promise<BookingRecord | undefined> {
    return [...this.db.bookings.values()].find((booking) => booking.pnr === pnr);
  }

  async findAllByOwner(ownerId: string): Promise<BookingRecord[]> {
    return [...this.db.bookings.values()].filter((booking) => booking.ownerId === ownerId);
  }

  async findAll(): Promise<BookingRecord[]> {
    return [...this.db.bookings.values()];
  }

  async update(bookingId: string, patch: Partial<BookingRecord>): Promise<BookingRecord> {
    const existing = this.db.bookings.get(bookingId);
    if (!existing) {
      throw new Error('BOOKING_NOT_FOUND');
    }
    const updated: BookingRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db.bookings.set(bookingId, updated);
    return updated;
  }
}
