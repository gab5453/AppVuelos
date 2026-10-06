import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { sumMoney } from '@ecoairlines/data-access/common/money.js';
import { resolvePassengerCounts, seatsRequired } from '@ecoairlines/data-access/common/passenger-counts.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import type { HoldRecord } from '@ecoairlines/data-access/entities/offers/hold.entity.js';
import { HOLD_REPOSITORY, type HoldRepository } from '@ecoairlines/data-management/interfaces/offers/hold.repository.js';

/** Vista del hold que `HoldService` (API pública de offers) entrega a otros dominios. */
export type { HoldRecord } from '@ecoairlines/data-access/entities/offers/hold.entity.js';
import { OFFER_INVENTORY_GATEWAY, type OfferInventoryGateway } from '@ecoairlines/data-management/interfaces/offers/offer-inventory.gateway.js';
import type { HoldRequestDto } from '../../dto/offers/hold-request.dto.js';
import type { HoldResponseDto, HoldStatusResponseDto } from '../../dto/offers/hold-response.dto.js';

const DEFAULT_TTL_MINUTES = 15;
const EXPIRATION_SWEEP_MS = 30_000;

/** Motivo por el que un hold no puede usarse para crear una reserva. */
export type HoldUnavailableReason = 'NOT_FOUND' | 'EXPIRED' | 'NOT_HELD';

export class HoldUnavailableError extends Error {
  constructor(readonly reason: HoldUnavailableReason) {
    super(reason);
  }
}

@Injectable()
export class HoldService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HoldService.name);
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    @Inject(HOLD_REPOSITORY) private readonly holdRepository: HoldRepository,
    @Inject(OFFER_INVENTORY_GATEWAY) private readonly inventory: OfferInventoryGateway,
  ) {}

  /** Barrido periódico: libera el inventario de holds vencidos aunque nadie los vuelva a consultar. */
  onModuleInit(): void {
    this.sweepTimer = setInterval(() => {
      this.expireDueHolds().catch((error: unknown) => this.logger.error(error));
    }, EXPIRATION_SWEEP_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
  }

  async createHold(ownerId: string, request: HoldRequestDto): Promise<HoldResponseDto> {
    const counts = resolvePassengerCounts(request.passengersBreakdown);
    if (counts.infants > counts.adults) {
      throw new ProblemDetailsException({
        status: 422,
        code: 'INFANT_SEAT_NOT_ALLOWED',
        title: 'Cada infante viaja en el regazo de un adulto: no puede haber más infantes que adultos.',
        invalidParams: [{ name: 'passengersBreakdown.infants', reason: 'must not exceed passengersBreakdown.adults' }],
      });
    }

    const priced = await this.inventory.priceSelections(request.offerId, request.itinerarySelections, counts);
    if (!priced.ok) {
      throw priced.reason === 'OFFER_NOT_FOUND'
        ? offerNoLongerAvailable()
        : new ProblemDetailsException({
            status: 422,
            code: 'VALIDATION_FAILED',
            title:
              priced.reason === 'ITINERARY_MISMATCH'
                ? 'Debe seleccionarse una tarifa para cada itinerario de la oferta, sin repetir.'
                : 'La cabina o familia tarifaria no existe en la oferta.',
            invalidParams: [
              priced.reason === 'ITINERARY_MISMATCH'
                ? { name: 'itinerarySelections', reason: 'must cover every itinerary of the offer exactly once' }
                : { name: 'itinerarySelections', reason: `fare not offered for ${priced.itineraryId}` },
            ],
          });
    }

    if (!(await this.inventory.reserve(priced.selections, seatsRequired(counts)))) {
      throw offerNoLongerAvailable();
    }

    const now = new Date();
    const record = await this.holdRepository.create({
      holdId: randomUUID(),
      ownerId,
      status: 'HELD',
      createdAt: now,
      expiresAt: new Date(now.getTime() + DEFAULT_TTL_MINUTES * 60_000),
      ttlMinutes: DEFAULT_TTL_MINUTES,
      lockedPrice: sumMoney(priced.selections.map((selection) => selection.price)),
      offerId: request.offerId,
      counts,
      selections: priced.selections,
    });

    return {
      holdId: record.holdId,
      status: 'HELD',
      expiresAt: record.expiresAt.toISOString(),
      ttlMinutes: record.ttlMinutes,
      lockedPrice: record.lockedPrice,
    };
  }

  async getHoldStatus(ownerId: string, holdId: string): Promise<HoldStatusResponseDto> {
    const record = await this.findOwnedHold(ownerId, holdId);
    const remainingSeconds =
      record.status === 'HELD' ? Math.max(0, Math.floor((record.expiresAt.getTime() - Date.now()) / 1000)) : 0;
    return {
      status: record.status,
      expiresAt: record.expiresAt.toISOString(),
      remainingSeconds,
      lockedPrice: record.lockedPrice,
    };
  }

  /** Libera el inventario de un hold vigente. Sobre uno ya liberado, vencido o consumido no tiene efecto (204). */
  async releaseHold(ownerId: string, holdId: string): Promise<void> {
    const record = await this.findOwnedHold(ownerId, holdId);
    if (record.status === 'HELD') {
      await this.inventory.release(record.selections, seatsRequired(record.counts));
      await this.holdRepository.save({ ...record, status: 'RELEASED' });
    }
  }

  /**
   * Hold vigente del usuario, para crear una reserva. No lo consume: la reserva valida pasajeros,
   * asientos y pago antes de llamar a `consumeHold`.
   */
  async getHeldHold(ownerId: string, holdId: string): Promise<HoldRecord> {
    const record = await this.holdRepository.findById(holdId);
    if (!record || record.ownerId !== ownerId) throw new HoldUnavailableError('NOT_FOUND');
    const current = await this.expireIfDue(record);
    if (current.status === 'EXPIRED') throw new HoldUnavailableError('EXPIRED');
    if (current.status !== 'HELD') throw new HoldUnavailableError('NOT_HELD');
    return current;
  }

  /**
   * Marca el hold como CONSUMED. Los cupos retenidos pasan a ser los cupos vendidos de la reserva
   * (no se liberan). La comprobación y el cambio de estado no se intercalan con otras peticiones.
   */
  async consumeHold(ownerId: string, holdId: string): Promise<HoldRecord> {
    const record = await this.getHeldHold(ownerId, holdId);
    return this.holdRepository.save({ ...record, status: 'CONSUMED' });
  }

  async expireDueHolds(): Promise<void> {
    for (const record of await this.holdRepository.findExpired(new Date())) {
      await this.expireIfDue(record);
    }
  }

  /** Un hold de otro usuario responde 404 (igual que uno inexistente), para no revelar que existe. */
  private async findOwnedHold(ownerId: string, holdId: string): Promise<HoldRecord> {
    const record = await this.holdRepository.findById(holdId);
    if (!record || record.ownerId !== ownerId) {
      throw ProblemDetailsException.notFound('Hold no encontrado.');
    }
    return this.expireIfDue(record);
  }

  private async expireIfDue(record: HoldRecord): Promise<HoldRecord> {
    if (record.status !== 'HELD' || record.expiresAt.getTime() > Date.now()) {
      return record;
    }
    await this.inventory.release(record.selections, seatsRequired(record.counts));
    return this.holdRepository.save({ ...record, status: 'EXPIRED' });
  }
}

function offerNoLongerAvailable(): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 409,
    code: 'OFFER_NO_LONGER_AVAILABLE',
    title: 'La oferta ya no está disponible o no tiene cupos suficientes.',
  });
}
