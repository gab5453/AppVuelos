import { Injectable } from '@nestjs/common';
import type { BookingRecord, BookingRepositoryPort } from '../domain/ports/booking-repository.port.js';

@Injectable()
export class InMemoryBookingRepository implements BookingRepositoryPort {
  private readonly bookings = new Map<string, BookingRecord>();

  async create(record: BookingRecord): Promise<BookingRecord> {
    this.bookings.set(record.bookingId, record);
    return record;
  }

  async findById(bookingId: string): Promise<BookingRecord | undefined> {
    return this.bookings.get(bookingId);
  }

  async findByPnr(pnr: string): Promise<BookingRecord | undefined> {
    return [...this.bookings.values()].find((booking) => booking.pnr === pnr);
  }

  async findAllByOwner(ownerId: string): Promise<BookingRecord[]> {
    return [...this.bookings.values()].filter((booking) => booking.ownerId === ownerId);
  }

  async update(bookingId: string, patch: Partial<BookingRecord>): Promise<BookingRecord> {
    const existing = this.bookings.get(bookingId);
    if (!existing) {
      throw new Error('BOOKING_NOT_FOUND');
    }
    const updated: BookingRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.bookings.set(bookingId, updated);
    return updated;
  }
}
