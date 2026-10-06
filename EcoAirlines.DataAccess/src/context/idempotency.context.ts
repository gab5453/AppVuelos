import { Injectable } from '@nestjs/common';
import type { IdempotencyClaim } from '../entities/idempotency/idempotency.entity.js';

/**
 * Contexto de datos de la **base de datos futura `idempotency`** (equivale a un DbContext). Transversal: en microservicios, cada servicio tiene la suya.
 * Hoy las tablas viven en memoria y se pierden al reiniciar; con PostgreSQL (V1.2) este contexto pasa a
 * ser la conexión a esa base de datos, sin cambiar los repositorios de EcoAirlines.DataManagement.
 */
@Injectable()
export class IdempotencyDataContext {
  readonly claims = new Map<string, IdempotencyClaim>();
}
