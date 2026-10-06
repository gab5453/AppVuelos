import { Injectable } from '@nestjs/common';
import type { HoldRecord } from '../entities/offers/hold.entity.js';

/**
 * Contexto de datos de la **base de datos futura `offers`** (equivale a un DbContext). Dueño: dominio offers.
 * Hoy las tablas viven en memoria y se pierden al reiniciar; con PostgreSQL (V1.2) este contexto pasa a
 * ser la conexión a esa base de datos, sin cambiar los repositorios de EcoAirlines.DataManagement.
 */
@Injectable()
export class OffersDataContext {
  readonly holds = new Map<string, HoldRecord>();
}
