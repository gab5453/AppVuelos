import { Inject, Injectable } from '@nestjs/common';
import type { MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';
import { scaleMoney } from '@ecoairlines/data-access/common/money.js';
import { paymentProblem } from '../../common/payments/payment-problem.js';
import { MAX_EXTRA_BAGS } from '../../common/policies/commercial-policy.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import { DeferredTaskRunner } from '../../common/scheduling/deferred-task-runner.js';
import { BookingsFacade, type BookingSnapshot } from '../bookings/bookings.facade.js';
import { assertConfirmed, findFare, flightAlreadyDeparted, hasDeparted } from '../../rules/post-sale/post-sale-rules.js';
import { POST_SALE_GDS_GATEWAY, type PostSaleGdsGateway } from '@ecoairlines/data-management/interfaces/post-sale/post-sale-gds.gateway.js';
import { POST_SALE_PAYMENT_GATEWAY, type PostSalePaymentGateway } from '@ecoairlines/data-management/interfaces/post-sale/post-sale-payment.gateway.js';
import type { AddBaggageRequestDto, BaggageAddedResponseDto, BaggageOptionsResponseDto } from '../../dto/post-sale/baggage.dto.js';

export interface BaggageResult {
  /** 200: maleta agregada. 202: pago en proceso, se agregará al confirmarse ("Procesando con el GDS"). */
  statusCode: 200 | 202;
  body?: BaggageAddedResponseDto;
}

/** Maletas extra posventa. Lee la reserva como snapshot y registra la compra mediante `BookingsFacade`. */
@Injectable()
export class BaggageService {
  constructor(
    private readonly bookings: BookingsFacade,
    @Inject(POST_SALE_GDS_GATEWAY) private readonly gds: PostSaleGdsGateway,
    @Inject(POST_SALE_PAYMENT_GATEWAY) private readonly payments: PostSalePaymentGateway,
    private readonly tasks: DeferredTaskRunner,
  ) {}

  /** Una opción por pasajero con asiento e itinerario aún no despegado. Los infantes no llevan equipaje facturado propio. */
  async getOptions(booking: BookingSnapshot): Promise<BaggageOptionsResponseDto> {
    const options: BaggageOptionsResponseDto = [];
    for (const fare of booking.fares) {
      if (await hasDeparted(fare, this.gds)) continue;
      const price = await this.gds.extraBagPrice(fare.itineraryId);
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

  async addBaggage(booking: BookingSnapshot, request: AddBaggageRequestDto): Promise<BaggageResult> {
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
    if (await hasDeparted(fare, this.gds)) throw flightAlreadyDeparted();

    const already = purchased(booking, request.passengerId, request.itineraryId);
    if (already + request.quantity > MAX_EXTRA_BAGS) {
      throw new ProblemDetailsException({
        status: 409,
        code: 'BAGGAGE_LIMIT_EXCEEDED',
        title: `Máximo ${MAX_EXTRA_BAGS} maletas extra por pasajero e itinerario.`,
        detail: `Ya compradas: ${already}.`,
      });
    }

    const unitPrice = (await this.gds.extraBagPrice(request.itineraryId))!;
    const amount = scaleMoney(unitPrice, request.quantity);
    // El endpoint solo documenta 409 como error: los problemas de pago se informan con 409.
    const verification = await this.payments.verify(request.payment.paymentReference, amount);
    if (verification === 'INVALID' || verification === 'NOT_AUTHORIZED') throw paymentProblem(verification, 409);
    await this.payments.markUsed(request.payment.paymentReference, `baggage:${booking.bookingId}`);

    if (verification === 'PENDING') {
      this.tasks.schedule(`baggage:${booking.bookingId}`, async () => {
        await this.record(booking.bookingId, request, amount);
      });
      return { statusCode: 202 };
    }

    const updated = await this.record(booking.bookingId, request, amount);
    const conditions = await this.gds.fareConditions(fare.cabinClass, fare.fareBrand);
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

  private record(bookingId: string, request: AddBaggageRequestDto, amount: MoneyAmount): Promise<BookingSnapshot> {
    return this.bookings.recordBaggagePurchase(bookingId, {
      passengerId: request.passengerId,
      itineraryId: request.itineraryId,
      quantity: request.quantity,
      amount,
    });
  }
}

function purchased(booking: BookingSnapshot, passengerId: string, itineraryId: string): number {
  return (
    booking.passengers
      ?.find((passenger) => passenger.passengerId === passengerId)
      ?.extraBaggage?.filter((bag) => bag.itineraryId === itineraryId)
      .reduce((total, bag) => total + bag.quantity, 0) ?? 0
  );
}
