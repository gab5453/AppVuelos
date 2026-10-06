import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { WebhookEvent } from '@ecoairlines/data-access/common/contract/webhook.types.js';

/** Versión del contrato con la que se publican los eventos (`apiVersion` del WebhookPayload). */
export const EVENTS_API_VERSION = '1.5.0.0';
const HISTORY_SIZE = 100;

/**
 * Evento de dominio de EcoAirlines. Su forma es la del `WebhookPayload` del contrato (`eventId`, `eventType`, `occurredAt`,
 * `apiVersion`, `data`), así el mismo evento sirve para el bus interno y para los webhooks salientes.
 */
export interface DomainEvent {
  eventId: string;
  eventType: WebhookEvent;
  occurredAt: string;
  apiVersion: string;
  /**
   * Dueño (`sub`) de la reserva: los eventos `booking.*` se entregan solo a sus suscripciones. Los eventos `flight.*` no lo
   * llevan y se entregan a todos los suscriptores. Nunca se envía en el payload.
   */
  ownerId?: string;
  data: {
    bookingId?: string;
    pnr?: string;
    status?: string;
    refundAmount?: string;
    /** Campos propios (el `data` del contrato admite más propiedades): vuelo, fecha, ruta… */
    [key: string]: unknown;
  };
}

/** Resultado de un consumidor al procesar un evento (p. ej. la entrega de un webhook). */
export interface EventDelivery {
  consumer: string;
  target: string;
  outcome: 'DELIVERED' | 'FAILED' | 'SIMULATED';
  httpStatus?: number;
  attempts?: number;
  detail?: string;
}

export interface PublishedEvent extends DomainEvent {
  deliveries: EventDelivery[];
}

export type EventHandler = (event: DomainEvent) => Promise<EventDelivery[]>;

/**
 * **Bus de eventos interno** (in-process). Los servicios publican lo que ocurrió (`booking.confirmed`, `flight.cancelled`…)
 * sin saber quién escucha; los consumidores se suscriben. Hoy el único consumidor es la entrega de webhooks, pero
 * notificaciones, contabilidad o el booking central podrían suscribirse sin tocar a quien publica.
 *
 * - La publicación no bloquea ni puede romper la operación que la originó: los consumidores corren después de responder.
 * - Guarda los últimos eventos con sus entregas para el panel de observabilidad.
 * - En microservicios se reemplaza por un broker (RabbitMQ, Kafka, SNS/SQS) con la misma interfaz `publish`/`subscribe`.
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly handlers: { name: string; handle: EventHandler }[] = [];
  private readonly history: PublishedEvent[] = [];
  private readonly pending = new Set<Promise<void>>();

  subscribe(name: string, handle: EventHandler): void {
    this.handlers.push({ name, handle });
  }

  publish(input: Pick<DomainEvent, 'eventType' | 'data' | 'ownerId'>): DomainEvent {
    const event: PublishedEvent = {
      eventId: randomUUID(),
      eventType: input.eventType,
      occurredAt: new Date().toISOString(),
      apiVersion: EVENTS_API_VERSION,
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      data: input.data,
      deliveries: [],
    };
    this.history.unshift(event);
    this.history.length = Math.min(this.history.length, HISTORY_SIZE);

    const run = (async () => {
      await Promise.resolve(); // después de la operación que lo originó
      for (const handler of this.handlers) {
        try {
          event.deliveries.push(...(await handler.handle(event)));
        } catch (error) {
          this.logger.error(`El consumidor "${handler.name}" falló con ${event.eventType}: ${error instanceof Error ? error.message : String(error)}`);
          event.deliveries.push({ consumer: handler.name, target: '-', outcome: 'FAILED', detail: 'error interno del consumidor' });
        }
      }
    })();
    this.pending.add(run);
    void run.finally(() => this.pending.delete(run));
    return event;
  }

  /** Atajo para eventos `booking.*`: datos básicos de la reserva (`bookingId`, `pnr`, `status`) más los propios del evento. */
  publishBooking(
    eventType: Extract<WebhookEvent, `booking.${string}`>,
    booking: { bookingId: string; pnr: string; status: string; ownerId: string },
    extra: Record<string, unknown> = {},
  ): DomainEvent {
    return this.publish({
      eventType,
      ownerId: booking.ownerId,
      data: { bookingId: booking.bookingId, pnr: booking.pnr, status: booking.status, ...extra },
    });
  }

  /** Últimos eventos publicados (el más reciente primero), con sus entregas. */
  recent(limit = 50): PublishedEvent[] {
    return this.history.slice(0, limit).map((event) => structuredClone(event));
  }

  /** Espera a que terminen los consumidores en curso (pruebas y apagado ordenado). */
  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled(this.pending);
  }
}
