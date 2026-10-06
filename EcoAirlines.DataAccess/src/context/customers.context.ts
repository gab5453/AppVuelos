import { Injectable } from '@nestjs/common';
import type { CustomerProfileRecord } from '../entities/customers/customer-profile.entity.js';

/**
 * Contexto de datos de la **base de datos futura `customers`** (equivale a un DbContext). Dueño: dominio customers.
 * Hoy las tablas viven en memoria y se pierden al reiniciar; con PostgreSQL (V1.2) este contexto pasa a
 * ser la conexión a esa base de datos, sin cambiar los repositorios de EcoAirlines.DataManagement.
 */
@Injectable()
export class CustomersDataContext {
  /** Perfiles por `ownerId` (sub del JWT). */
  readonly profiles = new Map<string, CustomerProfileRecord>();
}
