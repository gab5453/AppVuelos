import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { WebhookSubscriptionRecord } from '@ecoairlines/data-access/entities/webhooks/webhook-subscription.entity.js';
import { WEBHOOK_REPOSITORY, type WebhookRepository } from '@ecoairlines/data-management/interfaces/webhooks/webhook.repository.js';
import {
  WEBHOOK_URL_POLICY,
  WebhookUrlPolicy,
  WebhookUrlRejectedError,
} from '../../rules/webhooks/webhook-url-policy.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import type { WebhookSubscriptionDto, WebhookSubscriptionRequestDto } from '../../dto/webhooks/webhook-subscription.dto.js';

/** Cada cliente (sub del JWT) solo ve y elimina sus propias suscripciones. */
@Injectable()
export class WebhooksService {
  constructor(
    @Inject(WEBHOOK_REPOSITORY) private readonly webhookRepository: WebhookRepository,
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
