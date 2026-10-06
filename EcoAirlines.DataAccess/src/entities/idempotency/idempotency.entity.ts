/** Respuesta guardada de una operación idempotente, para reproducirla ante un reintento. */
export interface IdempotencyRecord {
  statusCode: number;
  body: unknown;
  createdAt: Date;
}

/**
 * Clave idempotente reclamada. Transversal: al separar en microservicios, cada servicio con endpoints
 * idempotentes tiene su propia tabla de claves (offers, bookings y post-sale), o un Redis compartido con prefijo.
 */
export interface IdempotencyClaim {
  fingerprint: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  record?: IdempotencyRecord;
  expiresAt: number;
}
