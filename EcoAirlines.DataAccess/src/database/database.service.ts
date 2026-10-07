import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { PersistentTable, type TableOptions, type TableWriter } from './persistent-table.js';

/**
 * Conexión a PostgreSQL (`DATABASE_URL`). Cada contexto de datos crea sus tablas con `table()`; al iniciar el módulo:
 * 1. crea el esquema y la tabla si no existen (`<schema>.<name>`: `id text`, `data jsonb`, `updated_at`);
 * 2. carga todas las filas en memoria;
 * 3. si la tabla está vacía, aplica los datos iniciales (red base de rutas y flota).
 * Las escrituras se encolan y se ejecutan **en orden**; al apagar la app se espera a que terminen.
 *
 * Sin `DATABASE_URL` (desarrollo y pruebas) todo queda en memoria, como antes.
 * Cada esquema es la "base de datos por dominio" del diseño: separarlos en servidores distintos solo cambia la conexión.
 */
@Injectable()
export class DatabaseService implements TableWriter, OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly tables: PersistentTable<unknown>[] = [];
  private readonly url = process.env.DATABASE_URL?.trim() || undefined;
  private pool?: pg.Pool;
  private queue: Promise<void> = Promise.resolve();
  private failures = 0;

  get persistent(): boolean {
    return this.url !== undefined;
  }

  /** Crea una tabla del contexto. En memoria aplica sus datos iniciales al momento. */
  table<T>(options: TableOptions<T>): PersistentTable<T> {
    const table = new PersistentTable<T>(options);
    this.tables.push(table as PersistentTable<unknown>);
    if (!this.persistent) table.applySeed();
    return table;
  }

  async onModuleInit(): Promise<void> {
    if (!this.url) {
      this.logger.log('Sin DATABASE_URL: los datos viven en memoria (se pierden al reiniciar).');
      return;
    }
    this.pool = new pg.Pool({ connectionString: this.url, max: 5, connectionTimeoutMillis: 10_000 });
    for (const table of this.tables) {
      await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${table.schema}`);
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS ${table.qualifiedName} (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
      );
      const { rows } = await this.pool.query<{ id: string; data: unknown }>(`SELECT id, data FROM ${table.qualifiedName}`);
      table.load(rows.map((row) => [row.id, row.data] as const));
      table.attach(this);
      if (rows.length === 0) table.applySeed();
    }
    await this.flush();
    this.logger.log(`PostgreSQL conectado: ${this.tables.length} tablas cargadas.`);
  }

  upsert(table: PersistentTable<unknown>, key: string, value: unknown): void {
    const data = JSON.stringify(value);
    this.enqueue(table, () =>
      this.pool!.query(
        `INSERT INTO ${table.qualifiedName} (id, data, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [key, data],
      ),
    );
  }

  remove(table: PersistentTable<unknown>, key: string): void {
    this.enqueue(table, () => this.pool!.query(`DELETE FROM ${table.qualifiedName} WHERE id = $1`, [key]));
  }

  clear(table: PersistentTable<unknown>): void {
    this.enqueue(table, () => this.pool!.query(`DELETE FROM ${table.qualifiedName}`));
  }

  /** Espera a que se escriban todos los cambios pendientes. */
  async flush(): Promise<void> {
    await this.queue;
  }

  /** Escrituras fallidas desde que arrancó (para observabilidad). */
  get failedWrites(): number {
    return this.failures;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.flush();
    await this.pool?.end();
  }

  private enqueue(table: PersistentTable<unknown>, write: () => Promise<unknown>): void {
    if (!this.pool) return;
    this.queue = this.queue
      .then(write)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.failures++;
        this.logger.error(`No se pudo escribir en ${table.qualifiedName}: ${error instanceof Error ? error.message : String(error)}`);
      });
  }
}
