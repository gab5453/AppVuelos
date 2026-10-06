import { Injectable } from '@nestjs/common';
import { HoldService, HoldUnavailableError, type HoldRecord } from '../offers/hold.service.js';
import type { HoldGatewayPort, HoldLookup } from './hold-gateway.port.js';

/** Adapter in-process hacia el dominio offers. Al separar en microservicios, se reemplaza por un cliente HTTP. */
@Injectable()
export class OffersHoldGatewayAdapter implements HoldGatewayPort {
  constructor(private readonly holdService: HoldService) {}

  getHeld(ownerId: string, holdId: string): Promise<HoldLookup> {
    return this.lookup(() => this.holdService.getHeldHold(ownerId, holdId));
  }

  consume(ownerId: string, holdId: string): Promise<HoldLookup> {
    return this.lookup(() => this.holdService.consumeHold(ownerId, holdId));
  }

  private async lookup(operation: () => Promise<HoldRecord>): Promise<HoldLookup> {
    try {
      const record = await operation();
      return {
        ok: true,
        hold: {
          holdId: record.holdId,
          counts: record.counts,
          lockedPrice: record.lockedPrice,
          selections: record.selections,
        },
      };
    } catch (error) {
      if (error instanceof HoldUnavailableError) {
        return { ok: false, reason: error.reason };
      }
      throw error;
    }
  }
}
