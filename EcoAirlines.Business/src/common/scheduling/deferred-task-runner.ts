import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

/**
 * Ejecuta tareas en segundo plano tras una demora, para simular procesos asíncronos del contrato
 * (respuestas 202: emisión de tickets, pagos pendientes). Al cerrar la app cancela las pendientes.
 * En producción esto sería una cola (p. ej. eventos del GDS o de la Payment API).
 */
@Injectable()
export class DeferredTaskRunner implements OnModuleDestroy {
  private readonly logger = new Logger(DeferredTaskRunner.name);
  private readonly timers = new Set<NodeJS.Timeout>();

  /** Demora configurable con ASYNC_PROCESSING_DELAY_MS (por defecto 3 s). */
  get delayMs(): number {
    return Number(process.env.ASYNC_PROCESSING_DELAY_MS ?? 3_000);
  }

  schedule(name: string, task: () => Promise<void>): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      task().catch((error: unknown) =>
        this.logger.error(`Tarea diferida "${name}" falló: ${error instanceof Error ? error.stack : String(error)}`),
      );
    }, this.delayMs);
    timer.unref();
    this.timers.add(timer);
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}
