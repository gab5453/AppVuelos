import { Injectable } from '@nestjs/common';
import { IdempotencyDataContext } from '@ecoairlines/data-access/context/idempotency.context.js';
import type { IdempotencyRecord } from '@ecoairlines/data-access/entities/idempotency/idempotency.entity.js';
import type { IdempotencyClaimResult, IdempotencyRepository } from '../../interfaces/idempotency/idempotency.repository.js';

/** Ventana durante la cual una key protege contra reintentos duplicados. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Almacenamiento en memoria; se pierde al reiniciar el proceso. Reemplazar por Redis/DB cuando
 * exista infraestructura compartida entre instancias.
 *
 * `claim` es una sección síncrona (sin `await` de por medio) entre la lectura y la escritura
 * del Map, por lo que ninguna petición concurrente puede intercalarse entre ambas: es atómica
 * en la práctica dentro de un mismo proceso Node de un solo hilo.
 * Las keys expiran a las 24 h y se purgan de forma perezosa, para que la memoria no crezca sin límite.
 */
@Injectable()
export class InMemoryIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly db: IdempotencyDataContext) {}

  /** Reloj reemplazable en pruebas. */
  now: () => number = () => Date.now();

  async claim(key: string, requestFingerprint: string): Promise<IdempotencyClaimResult> {
    this.purgeExpired();
    const existing = this.db.claims.get(key);

    if (!existing) {
      this.db.claims.set(key, {
        fingerprint: requestFingerprint,
        status: 'IN_PROGRESS',
        expiresAt: this.now() + IDEMPOTENCY_TTL_MS,
      });
      return { outcome: 'CLAIMED' };
    }

    if (existing.fingerprint !== requestFingerprint) {
      return { outcome: 'CONFLICT' };
    }

    if (existing.status === 'IN_PROGRESS') {
      return { outcome: 'IN_PROGRESS' };
    }

    return { outcome: 'COMPLETED', record: existing.record! };
  }

  async complete(key: string, record: IdempotencyRecord): Promise<void> {
    const existing = this.db.claims.get(key);
    this.db.claims.set(key, {
      fingerprint: existing?.fingerprint ?? '',
      status: 'COMPLETED',
      record,
      expiresAt: existing?.expiresAt ?? this.now() + IDEMPOTENCY_TTL_MS,
    });
  }

  async release(key: string): Promise<void> {
    const existing = this.db.claims.get(key);
    if (existing?.status === 'IN_PROGRESS') {
      this.db.claims.delete(key);
    }
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const [key, claim] of this.db.claims) {
      if (claim.expiresAt <= now) this.db.claims.delete(key);
    }
  }
}
