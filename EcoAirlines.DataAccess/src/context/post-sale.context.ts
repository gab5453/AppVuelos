import { Injectable } from '@nestjs/common';
import type { StoredQuote } from '../entities/post-sale/stored-quote.entity.js';

/**
 * Contexto de datos de la **base de datos futura `post-sale`** (equivale a un DbContext). Dueño: dominio post-sale.
 * Hoy las tablas viven en memoria y se pierden al reiniciar; con PostgreSQL (V1.2) este contexto pasa a
 * ser la conexión a esa base de datos, sin cambiar los repositorios de EcoAirlines.DataManagement.
 */
@Injectable()
export class PostSaleDataContext {
  readonly cancellationQuotes = new Map<string, StoredQuote<unknown>>();
  readonly dateChangeOffers = new Map<string, StoredQuote<unknown>>();
}
