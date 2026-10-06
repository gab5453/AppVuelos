import { API_URL } from '../config';
import type { ProblemDetails } from './types';

/** Error de la API con el ProblemDetails del contrato (o un error de red, status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetails;
  /** Segundos de `Retry-After` (409/429 del contrato). */
  readonly retryAfter?: number;
  /** `X-Request-Id` de la respuesta, útil para soporte. */
  readonly requestId?: string;

  constructor(status: number, message: string, problem?: ProblemDetails, retryAfter?: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
    this.retryAfter = retryAfter;
    this.requestId = requestId;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  idempotencyKey?: string;
  fingerprint?: string;
  query?: Record<string, string | number | undefined>;
}

export interface ApiResponse<T> {
  status: number;
  data: T;
}

/**
 * Único punto de salida hacia la API. El token viaja solo en `Authorization` (nunca en la URL)
 * y las respuestas se tratan como datos: el renderizado de React las escapa.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.fingerprint) headers['X-Device-Fingerprint'] = options.fingerprint;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'omit',
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.');
  }

  const requestId = response.headers.get('X-Request-Id') ?? undefined;
  const text = await response.text();
  const json: unknown = text ? safeParse(text) : undefined;

  if (!response.ok) {
    const problem = isProblem(json) ? json : undefined;
    const retryAfter = Number(response.headers.get('Retry-After')) || undefined;
    throw new ApiError(response.status, problem?.title ?? `Error ${response.status}`, problem, retryAfter, requestId);
  }
  return { status: response.status, data: json as T };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isProblem(value: unknown): value is ProblemDetails {
  return typeof value === 'object' && value !== null && 'status' in value && 'title' in value;
}
