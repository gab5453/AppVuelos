import { Inject, Injectable } from '@nestjs/common';
import type { MoneyAmount } from '../../../common/contract-types/common.types.js';
import { scaleMoney, sumMoney } from '../../../common/money/money.js';
import { ProblemDetailsException } from '../../../common/problem-details/problem-details.exception.js';
import { DeferredTaskRunner } from '../../../common/scheduling/deferred-task-runner.js';
import { paymentProblem } from '../../bookings/application/bookings.service.js';
import { MAX_EXTRA_BAGS } from '../../bookings/domain/passenger-rules.js';
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRecord,
  type BookingRepositoryPort,
} from '../../bookings/domain/ports/booking-repository.port.js';
import { PAYMENT_VERIFIER_PORT, type PaymentVerifierPort } from '../../bookings/domain/ports/payment-verifier.port.js';
import { RESERVATION_SYSTEM_PORT, type ReservationSystemPort } from '../../bookings/domain/ports/reservation-system.port.js';
import { assertConfirmed, findFare, flightAlreadyDeparted, hasDeparted } from '../domain/post-sale-rules.js';
import type { AddBaggageRequestDto, BaggageAddedResponseDto, BaggageOptionsResponseDto } from '../presentation/dto/baggage.dto.js';

export interface BaggageResult {
  /** 200: maleta agregada. 202: pago en proceso, se agregará al confirmarse ("Procesando con el GDS"). */
  statusCode: 200 | 202;
  body?: BaggageAddedResponseDto;
}

@Injectable()
export class BaggageService {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT) private readonly bookingRepository: BookingRepositoryPort,
    @Inject(RESERVATION_SYSTEM_PORT) private readonly reservationSystem: ReservationSystemPort,
    @Inject(PAYMENT_VERIFIER_PORT) private readonly payments: PaymentVerifierPort,
    private readonly tasks: DeferredTaskRunner,
  ) {}

  /** Una opción por pasajero con asiento e itinerario aún no despegado. Los infantes no llevan equipaje facturado propio. */
  async getOptions(booking: BookingRecord): Promise<BaggageOptionsResponseDto> {
    const options: BaggageOptionsResponseDto = [];
    for (const fare of booking.internal.fares) {
      if (await hasDeparted(fare, this.reservationSystem)) continue;
      const price = await this.reservationSystem.extraBagPrice(fare.itineraryId);
      for (const passenger of booking.passengers ?? []) {
        if (passenger.passengerType === 'INFANT') continue;
        options.push({
          passengerId: passenger.passengerId,
          itineraryId: fare.itineraryId,
          ...(price ? { price } : {}),
          maxAllowed: MAX_EXTRA_BAGS,
          alreadyPurchased: purchased(booking, passenger.passengerId, fare.itineraryId),
        });
      }
    }
    return options;
  }

  async addBaggage(booking: BookingRecord, request: AddBaggageRequestDto): Promise<BaggageResult> {
    assertConfirmed(booking);
    const fare = findFare(booking, request.itineraryId);
    const passenger = booking.passengers?.find((candidate) => candidate.passengerId === request.passengerId);
    if (!passenger || passenger.passengerType === 'INFANT') {
      throw new ProblemDetailsException({
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'El pasajero no existe en la reserva o no puede llevar equipaje facturado propio.',
        invalidParams: [{ name: 'passengerId', reason: 'unknown passenger or INFANT' }],
      });
    }
    if (await hasDeparted(fare, this.reservationSystem)) throw flightAlreadyDeparted();

    const already = purchased(booking, request.passengerId, request.itineraryId);
    if (already + request.quantity > MAX_EXTRA_BAGS) {
      throw new ProblemDetailsException({
        status: 409,
        code: 'BAGGAGE_LIMIT_EXCEEDED',
        title: `Máximo ${MAX_EXTRA_BAGS} maletas extra por pasajero e itinerario.`,
        detail: `Ya compradas: ${already}.`,
      });
    }

    const unitPrice = (await this.reservationSystem.extraBagPrice(request.itineraryId))!;
    const amount = scaleMoney(unitPrice, request.quantity);
    // El endpoint solo documenta 409 como error: los problemas de pago se informan con 409.
    const verification = await this.payments.verify(request.payment.paymentReference, amount);
    if (verification === 'INVALID' || verification === 'NOT_AUTHORIZED') throw paymentProblem(verification, 409);
    await this.payments.markUsed(request.payment.paymentReference, `baggage:${booking.bookingId}`);

    if (verification === 'PENDING') {
      this.tasks.schedule(`baggage:${booking.bookingId}`, async () => {
        await this.apply(booking.bookingId, request, amount);
      });
      return { statusCode: 202 };
    }

    const updated = await this.apply(booking.bookingId, request, amount);
    const conditions = await this.reservationSystem.fareConditions(fare.cabinClass, fare.fareBrand);
    return {
      statusCode: 200,
      body: {
        passengerId: request.passengerId,
        itineraryId: request.itineraryId,
        // Total de maletas facturadas del pasajero en el itinerario: incluidas en la tarifa + extra (HALL-23).
        totalBaggage: (conditions?.checkedBaggageIncluded ?? 0) + purchased(updated, request.passengerId, request.itineraryId),
      },
    };
  }

  private async apply(bookingId: string, request: AddBaggageRequestDto, amount: MoneyAmount): Promise<BookingRecord> {
    const booking = (await this.bookingRepository.findById(bookingId))!;
    const passengers = structuredClone(booking.passengers ?? []).map((passenger) => {
      if (passenger.passengerId !== request.passengerId) return passenger;
      const bags = passenger.extraBaggage ?? [];
      const existing = bags.find((bag) => bag.itineraryId === request.itineraryId);
      return {
        ...passenger,
        extraBaggage: existing
          ? bags.map((bag) => (bag === existing ? { ...bag, quantity: bag.quantity + request.quantity } : bag))
          : [...bags, { itineraryId: request.itineraryId, quantity: request.quantity }],
      };
    });
    const now = new Date().toISOString();
    return this.bookingRepository.update(bookingId, {
      passengers,
      grandTotal: sumMoney([booking.grandTotal, amount]),
      changes: [
        ...(booking.changes ?? []),
        {
          changedAt: now,
          description: `${request.quantity} maleta(s) extra para ${request.passengerId} en ${request.itineraryId} (${amount.total} ${amount.currency}).`,
        },
      ],
    });
  }
}

function purchased(booking: BookingRecord, passengerId: string, itineraryId: string): number {
  return (
    booking.passengers
      ?.find((passenger) => passenger.passengerId === passengerId)
      ?.extraBaggage?.filter((bag) => bag.itineraryId === itineraryId)
      .reduce((total, bag) => total + bag.quantity, 0) ?? 0
  );
}
