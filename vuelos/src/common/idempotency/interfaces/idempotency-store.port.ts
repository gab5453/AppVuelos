export const IDEMPOTENCY_STORE_PORT = Symbol('IDEMPOTENCY_STORE_PORT');

export interface IdempotencyRecord {
  statusCode: number;
  body: unknown;
  createdAt: Date;
}

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
 * Puerto de idempotencia. La operación `claim` debe ser atómica (check-and-set) para evitar
 * la ventana de carrera entre comprobar y guardar bajo peticiones concurrentes.
 */
export interface IdempotencyStorePort {
  claim(key: string, requestFingerprint: string): Promise<IdempotencyClaimResult>;
  complete(key: string, record: IdempotencyRecord): Promise<void>;
  /** Libera una key reclamada cuya operación falló, para permitir un reintento legítimo. */
  release(key: string): Promise<void>;
}
