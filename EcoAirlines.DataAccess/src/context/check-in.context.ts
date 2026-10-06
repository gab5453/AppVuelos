import { Injectable } from '@nestjs/common';
import type { CheckInRecord } from '../entities/check-in/check-in.entity.js';

/**
 * Contexto de datos de la **base de datos futura `check-in`** (equivale a un DbContext). Dueño: dominio check-in.
 * Hoy las tablas viven en memoria y se pierden al reiniciar; con PostgreSQL (V1.2) este contexto pasa a
 * ser la conexión a esa base de datos, sin cambiar los repositorios de EcoAirlines.DataManagement.
 */
@Injectable()
export class CheckInDataContext {
  /** Check-ins por reserva. */
  readonly checkIns = new Map<string, CheckInRecord>();
}
