/** Escritor de cambios hacia la base de datos (lo provee `DatabaseService` cuando hay PostgreSQL). */
export interface TableWriter {
  upsert(table: PersistentTable<unknown>, key: string, value: unknown): void;
  remove(table: PersistentTable<unknown>, key: string): void;
  clear(table: PersistentTable<unknown>): void;
}

export interface TableOptions<T> {
  /** Esquema de PostgreSQL = base de datos del dominio (`bookings`, `offers`, `schedule`…). */
  schema: string;
  /** Tabla dentro del esquema. */
  name: string;
  /** Reconstruye lo que JSON no conserva (p. ej. `Date`) al leer de la base. */
  revive?: (value: T) => T;
  /** Datos iniciales: se cargan solo si la tabla está vacía (la primera vez). */
  seed?: () => Iterable<readonly [string, T]>;
}

const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;

/**
 * Tabla de un contexto de datos. Se usa como un `Map` (las lecturas son en memoria y los repositorios no cambian) y, si hay
 * PostgreSQL, cada `set`/`delete` se escribe en la base, en orden, en una tabla `<schema>.<name>` con el registro en JSONB.
 * Al arrancar se cargan todas las filas. Sin base de datos se comporta como un `Map` (desarrollo y pruebas).
 *
 * Limitación consciente: la memoria es la copia de trabajo, así que la API corre como **una sola instancia** (App Service B1).
 */
export class PersistentTable<T> extends Map<string, T> {
  readonly schema: string;
  readonly name: string;
  private writer?: TableWriter;
  private loading = false;

  constructor(readonly options: TableOptions<T>) {
    super();
    if (!IDENTIFIER.test(options.schema) || !IDENTIFIER.test(options.name)) {
      throw new Error(`Nombre de tabla inválido: ${options.schema}.${options.name}`);
    }
    this.schema = options.schema;
    this.name = options.name;
  }

  get qualifiedName(): string {
    return `${this.schema}.${this.name}`;
  }

  /** La conecta a la base de datos: desde ahora cada cambio se persiste. */
  attach(writer: TableWriter): void {
    this.writer = writer;
  }

  /** Carga filas de la base sin volver a escribirlas. */
  load(rows: Iterable<readonly [string, T]>): void {
    this.loading = true;
    try {
      for (const [key, value] of rows) super.set(key, this.options.revive ? this.options.revive(value) : value);
    } finally {
      this.loading = false;
    }
  }

  /** Aplica los datos iniciales (si los hay) y los persiste. */
  applySeed(): void {
    for (const [key, value] of this.options.seed?.() ?? []) this.set(key, value);
  }

  override set(key: string, value: T): this {
    super.set(key, value);
    if (this.writer && !this.loading) this.writer.upsert(this as PersistentTable<unknown>, key, value);
    return this;
  }

  override delete(key: string): boolean {
    const existed = super.delete(key);
    if (existed && this.writer) this.writer.remove(this as PersistentTable<unknown>, key);
    return existed;
  }

  override clear(): void {
    super.clear();
    this.writer?.clear(this as PersistentTable<unknown>);
  }
}

/** Convierte a `Date` los campos indicados (JSON los guarda como texto ISO). */
export function reviveDates<T>(...fields: string[]): (value: T) => T {
  return (value) => {
    const record = value as Record<string, unknown>;
    for (const field of fields) {
      if (typeof record[field] === 'string') record[field] = new Date(record[field]);
    }
    return value;
  };
}
