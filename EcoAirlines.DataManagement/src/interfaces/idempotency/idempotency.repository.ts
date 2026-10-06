import type { IdempotencyRecord } from '@ecoairlines/data-access/entities/idempotency/idempotency.entity.js';

export const IDEMPOTENCY_REPOSITORY = Symbol('IDEMPOTENCY_REPOSITORY');

export type IdempotencyClaimResult =
  /** Nadie reclamó esta key todavía: el llamador debe ejecutar la operación y llamar a complete(). */
  | { outcome: 'CLAIMED' }
  /** Misma key y mismo fingerprint (método+ruta+usuario+body) ya resuelto: reproducir la respuesta cacheada. */
  | { outcome: 'COMPLETED'; record: IdempotencyRecord }
  /** Misma key y mismo fingerprint, todavía en ejecución: evita ejecutar la operación dos veces en paralelo. */
  | { outcome: 'IN_PROGRESS' }
  /** Misma key reutilizada con un fingerprint distinto: reuso incompatible. */
  | { outcome: 'CONFLICT' };

/**
 * Repositorio de claves idempotentes. La operación `claim` debe ser atómica (check-and-set) para evitar
 * la ventana de carrera entre comprobar y guardar bajo peticiones concurrentes.
 * Transversal: al separar en microservicios, **cada servicio con endpoints idempotentes tiene su propia
 * tabla de claves** (offers, bookings y post-sale), o se usa un Redis compartido con prefijo por servicio.
 */
export interface IdempotencyRepository {
  claim(key: string, requestFingerprint: string): Promise<IdempotencyClaimResult>;
  complete(key: string, record: IdempotencyRecord): Promise<void>;
  /** Libera una key reclamada cuya operación falló, para permitir un reintento legítimo. */
  release(key: string): Promise<void>;
}
