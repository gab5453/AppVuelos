import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  WEBHOOK_REPOSITORY_PORT,
  type WebhookRepositoryPort,
  type WebhookSubscriptionRecord,
} from '../domain/ports/webhook-repository.port.js';
import {
  WEBHOOK_URL_POLICY,
  WebhookUrlPolicy,
  WebhookUrlRejectedError,
} from '../domain/webhook-url-policy.js';
import { ProblemDetailsException } from '../../../common/problem-details/problem-details.exception.js';
import type { WebhookSubscriptionDto, WebhookSubscriptionRequestDto } from '../presentation/dto/webhook-subscription.dto.js';

/** Cada cliente (sub del JWT) solo ve y elimina sus propias suscripciones. */
@Injectable()
export class WebhooksService {
  constructor(
    @Inject(WEBHOOK_REPOSITORY_PORT) private readonly webhookRepository: WebhookRepositoryPort,
    @Inject(WEBHOOK_URL_POLICY) private readonly urlPolicy: WebhookUrlPolicy,
  ) {}

  async list(ownerId: string): Promise<WebhookSubscriptionDto[]> {
    const subscriptions = await this.webhookRepository.findAllByOwner(ownerId);
    return subscriptions.map(toDto);
  }

  async create(ownerId: string, request: WebhookSubscriptionRequestDto): Promise<WebhookSubscriptionDto> {
    try {
      await this.urlPolicy.assertAllowed(request.url);
    } catch (error) {
      if (!(error instanceof WebhookUrlRejectedError)) throw error;
      throw new ProblemDetailsException({
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'La URL del webhook no está permitida.',
        invalidParams: [{ name: 'url', reason: error.message }],
      });
    }
    const record = await this.webhookRepository.create({ id: randomUUID(), ownerId, ...request });
    return toDto(record);
  }

  /**
   * El contrato solo documenta 204. Eliminar una suscripción inexistente o ajena responde 204 sin
   * efecto (DELETE idempotente) y no revela si el id pertenece a otro cliente.
   */
  delete(ownerId: string, id: string): Promise<void> {
    return this.webhookRepository.deleteByOwner(ownerId, id);
  }
}

function toDto({ ownerId: _ownerId, ...subscription }: WebhookSubscriptionRecord): WebhookSubscriptionDto {
  return subscription;
}
