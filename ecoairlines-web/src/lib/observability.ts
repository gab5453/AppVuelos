/*
 * Observabilidad del navegador (basada en `CR7Observability` de Ejemplo 1).
 * Registra en localStorage, sin enviar nada a ningún servidor:
 *   - tiempos de navegación y carga (Performance API)
 *   - errores de JavaScript y promesas rechazadas
 *   - errores de carga de recursos (img, script, link…)
 *   - clics en enlaces, botones y controles (nunca el valor de los campos)
 *   - cambios de visibilidad de la pestaña
 *   - viewport, conexión y soporte de APIs del navegador
 * Solo el administrador ve estos datos, en /admin/observabilidad. Todo acceso a APIs del navegador está
 * protegido para que la página funcione igual si alguna no existe.
 */

const PREFIX = 'ecoairlines-observability';
const KEYS = { meta: `${PREFIX}:meta`, environment: `${PREFIX}:environment`, log: `${PREFIX}:log` } as const;
const MAX_LOG_ENTRIES = 300;

export type ObservabilityCategory = 'performance' | 'error' | 'recurso' | 'interaccion' | 'visibilidad' | 'demo';

export interface ObservabilityEvent {
  id: string;
  categoria: ObservabilityCategory;
  tipo: string;
  pagina: string;
  timestamp: string;
  detalle: Record<string, unknown>;
}

export interface SessionMeta {
  sessionId: string;
  primeraVez: string;
  ultimaActividad: string;
}

export interface BrowserEnvironment {
  timestamp: string;
  pagina: string;
  viewport: { width: number | null; height: number | null; devicePixelRatio: number | null };
  conexion: { soportado: boolean; effectiveType?: string | null; downlink?: number | null; rtt?: number | null; saveData?: boolean };
  apisSoportadas: Record<string, boolean>;
  idioma: string | null;
  userAgent: string | null;
}

export interface BrowserSnapshot {
  generadoEn: string;
  meta: SessionMeta | null;
  environment: BrowserEnvironment | null;
  log: ObservabilityEvent[];
  almacenamientoDisponible: boolean;
}

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

/** Copia en memoria por si localStorage no está disponible (modo privado, cuota agotada…). */
const memory: { meta: SessionMeta | null; environment: BrowserEnvironment | null; log: ObservabilityEvent[] } = {
  meta: null,
  environment: null,
  log: [],
};

function storageAvailable(): boolean {
  try {
    const key = '__ecoairlines_test__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

let hasStorage = false;
let initialized = false;

function read<T>(key: string, fallback: T): T {
  if (!hasStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (!hasStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cuota excedida u otro fallo: no interrumpe la aplicación.
  }
}

const nowIso = () => new Date().toISOString();
const newId = () => `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const currentPage = () => window.location.pathname || '/';
const shortText = (value: unknown, limit: number) =>
  typeof value === 'string' ? (value.length > limit ? `${value.slice(0, limit)}…` : value) : null;

function touchMeta(): SessionMeta {
  const meta = read<SessionMeta | null>(KEYS.meta, null) ?? memory.meta ?? { sessionId: newId(), primeraVez: nowIso(), ultimaActividad: nowIso() };
  meta.ultimaActividad = nowIso();
  memory.meta = meta;
  write(KEYS.meta, meta);
  return meta;
}

function record(categoria: ObservabilityCategory, tipo: string, detalle: Record<string, unknown> = {}): ObservabilityEvent {
  const event: ObservabilityEvent = { id: newId(), categoria, tipo, pagina: currentPage(), timestamp: nowIso(), detalle };
  const log = [...(read<ObservabilityEvent[] | null>(KEYS.log, null) ?? memory.log), event].slice(-MAX_LOG_ENTRIES);
  memory.log = log;
  write(KEYS.log, log);
  touchMeta();
  return event;
}

function measureEnvironment(): BrowserEnvironment {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  const environment: BrowserEnvironment = {
    timestamp: nowIso(),
    pagina: currentPage(),
    viewport: {
      width: window.innerWidth || null,
      height: window.innerHeight || null,
      devicePixelRatio: window.devicePixelRatio || null,
    },
    conexion: connection
      ? {
          soportado: true,
          effectiveType: connection.effectiveType ?? null,
          downlink: typeof connection.downlink === 'number' ? connection.downlink : null,
          rtt: typeof connection.rtt === 'number' ? connection.rtt : null,
          saveData: Boolean(connection.saveData),
        }
      : { soportado: false },
    apisSoportadas: {
      localStorage: hasStorage,
      performance: typeof window.performance === 'object',
      performanceNavigationTiming: typeof window.performance?.getEntriesByType === 'function',
      performanceObserver: typeof window.PerformanceObserver === 'function',
      networkInformation: Boolean(connection),
      intersectionObserver: typeof window.IntersectionObserver === 'function',
      pageVisibility: typeof document.visibilityState !== 'undefined',
    },
    idioma: navigator.language || null,
    userAgent: navigator.userAgent || null,
  };
  memory.environment = environment;
  write(KEYS.environment, environment);
  return environment;
}

function measurePerformance(): void {
  try {
    const [navigation] = window.performance?.getEntriesByType?.('navigation') ?? [];
    if (!navigation) {
      record('performance', 'no-soportado', { motivo: 'PerformanceNavigationTiming no está disponible en este navegador' });
      return;
    }
    const timing = navigation as PerformanceNavigationTiming;
    const ms = (value: number) => (Number.isFinite(value) ? Math.round(value) : null);
    record('performance', 'navegacion', {
      metodo: 'PerformanceNavigationTiming',
      tiempoHastaPrimerByte: ms(timing.responseStart - timing.startTime),
      domContentCargado: ms(timing.domContentLoadedEventEnd - timing.startTime),
      cargaCompleta: ms(timing.loadEventEnd - timing.startTime),
      tipoNavegacion: timing.type,
    });
  } catch (error) {
    record('performance', 'error-medicion', { mensaje: shortText(String(error), 200) });
  }
}

function onError(event: Event): void {
  const target = event.target as (HTMLElement & { src?: string; href?: string }) | null;
  if (target && target !== (window as unknown as EventTarget) && target.tagName) {
    record('recurso', 'error-carga', { etiqueta: target.tagName.toLowerCase(), fuente: target.src || target.href || null });
    return;
  }
  const error = event as ErrorEvent;
  record('error', 'js-error', {
    mensaje: shortText(error.message, 300),
    archivo: error.filename || null,
    linea: error.lineno || null,
    columna: error.colno || null,
    stack: error.error instanceof Error ? shortText(error.error.stack, 500) : null,
  });
}

function onRejection(event: PromiseRejectionEvent): void {
  const reason: unknown = event.reason;
  record('error', 'promesa-rechazada', {
    mensaje: shortText(reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Promesa rechazada', 300),
    stack: reason instanceof Error ? shortText(reason.stack, 500) : null,
  });
}

function onClick(event: MouseEvent): void {
  const element = (event.target as Element | null)?.closest?.('a, button, input, select, textarea, [role="button"], [role="tab"]');
  if (!element) return;
  record('interaccion', 'clic', {
    etiqueta: element.tagName.toLowerCase(),
    id: element.id || null,
    // Solo el texto visible de enlaces y botones; nunca el valor escrito en un campo.
    texto: ['input', 'select', 'textarea'].includes(element.tagName.toLowerCase())
      ? null
      : shortText((element.textContent ?? '').trim().replace(/\s+/g, ' '), 80),
    href: element.getAttribute('href'),
    tipo: element.getAttribute('type'),
  });
}

function onVisibilityChange(): void {
  record('visibilidad', document.visibilityState, { oculto: document.hidden });
}

let resizeTimer: number | undefined;
function onEnvironmentChange(): void {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(measureEnvironment, 250);
}

/** Inicia la observación. Se llama una sola vez al arrancar la aplicación. */
export function initObservability(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  hasStorage = storageAvailable();
  touchMeta();
  measureEnvironment();

  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
  document.addEventListener('click', onClick, true);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('resize', onEnvironmentChange);
  window.addEventListener('online', onEnvironmentChange);
  window.addEventListener('offline', onEnvironmentChange);

  // El tiempo de carga completo solo se conoce después del evento "load".
  if (document.readyState === 'complete') window.setTimeout(measurePerformance, 0);
  else window.addEventListener('load', () => window.setTimeout(measurePerformance, 0), { once: true });
}

/** API equivalente a `window.CR7Observability` de Ejemplo 1. */
export const browserObservability = {
  prefix: PREFIX,
  getSnapshot(): BrowserSnapshot {
    return {
      generadoEn: nowIso(),
      meta: read(KEYS.meta, memory.meta),
      environment: read(KEYS.environment, memory.environment),
      log: read(KEYS.log, memory.log) ?? [],
      almacenamientoDisponible: hasStorage,
    };
  },
  refreshEnvironment: measureEnvironment,
  logDemoEvent: () => record('demo', 'evento-demostracion', { mensaje: 'Evento de demostración generado desde el panel de observabilidad.' }),
  clear(): void {
    memory.meta = null;
    memory.environment = null;
    memory.log = [];
    if (!hasStorage) return;
    try {
      for (const key of Object.values(KEYS)) window.localStorage.removeItem(key);
    } catch {
      // Sin acceso al almacenamiento: no hay nada que limpiar.
    }
  },
};
