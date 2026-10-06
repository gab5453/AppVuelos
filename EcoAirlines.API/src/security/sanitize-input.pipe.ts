import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ProblemDetailsException } from '@ecoairlines/business/exceptions/problem-details.exception.js';

/** Claves que permiten contaminar prototipos al copiar objetos (prototype pollution). */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Caracteres de control C0 y DEL, excepto tabulación, salto de línea y retorno de carro. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const SANITIZED_SOURCES = new Set<ArgumentMetadata['type']>(['body', 'query', 'param']);

/**
 * Saneamiento no destructivo de la entrada, previo a la validación de DTOs:
 * - rechaza (400 VALIDATION_FAILED) claves `__proto__`, `constructor` y `prototype`;
 * - rechaza strings con bytes nulos u otros caracteres de control;
 * - recorta espacios al inicio y al final de los strings.
 * No escapa HTML: los datos se guardan tal cual y el escape corresponde a quien los presenta.
 * Solo actúa sobre body, query y params; los decoradores propios (usuario, reserva) no se tocan.
 */
@Injectable()
export class SanitizeInputPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!SANITIZED_SOURCES.has(metadata.type)) {
      return value;
    }
    return sanitize(value, metadata.data ?? '');
  }
}

function sanitize(value: unknown, path: string): unknown {
  if (typeof value === 'string') {
    if (CONTROL_CHARACTERS.test(value)) {
      throw invalid(path, 'contains control characters');
    }
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitize(item, `${path}[${index}]`));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      const nestedPath = path ? `${path}.${key}` : key;
      if (FORBIDDEN_KEYS.has(key)) {
        throw invalid(nestedPath, 'property name not allowed');
      }
      result[key] = sanitize(nested, nestedPath);
    }
    return result;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function invalid(name: string, reason: string): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 400,
    code: 'VALIDATION_FAILED',
    title: 'La petición contiene datos no permitidos.',
    invalidParams: [{ name: name || 'body', reason }],
  });
}
