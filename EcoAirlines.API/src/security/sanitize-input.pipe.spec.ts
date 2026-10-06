import type { ArgumentMetadata } from '@nestjs/common';
import { ProblemDetailsException } from '@ecoairlines/business/exceptions/problem-details.exception.js';
import { SanitizeInputPipe } from './sanitize-input.pipe.js';

const body: ArgumentMetadata = { type: 'body' };
const pipe = new SanitizeInputPipe();

function invalidParams(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ProblemDetailsException);
    return ((error as ProblemDetailsException).getResponse() as { invalidParams: unknown }).invalidParams;
  }
  throw new Error('se esperaba una excepción');
}

describe('SanitizeInputPipe', () => {
  it('recorta espacios en strings anidados sin alterar otros tipos', () => {
    const input = { name: '  Jane ', nested: { list: [' a ', 1, true, null] } };
    expect(pipe.transform(input, body)).toEqual({ name: 'Jane', nested: { list: ['a', 1, true, null] } });
  });

  it('no escapa HTML (el escape corresponde a la presentación)', () => {
    expect(pipe.transform({ reason: '<b>hola</b>' }, body)).toEqual({ reason: '<b>hola</b>' });
  });

  it('conserva tabulaciones y saltos de línea', () => {
    expect(pipe.transform({ reason: 'línea 1\nlínea 2\tfin' }, body)).toEqual({ reason: 'línea 1\nlínea 2\tfin' });
  });

  it('rechaza bytes nulos y caracteres de control indicando la ruta', () => {
    expect(invalidParams(() => pipe.transform({ passengers: [{ firstName: 'Ja\u0000ne' }] }, body))).toEqual([
      { name: 'passengers[0].firstName', reason: 'contains control characters' },
    ]);
  });

  it.each(['__proto__', 'constructor', 'prototype'])('rechaza la clave %s (prototype pollution)', (key) => {
    const input = JSON.parse(`{"contact": {"${key}": {"isAdmin": true}}}`) as unknown;
    expect(invalidParams(() => pipe.transform(input, body))).toEqual([
      { name: `contact.${key}`, reason: 'property name not allowed' },
    ]);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it('sanea query y params, pero no los valores de decoradores propios', () => {
    expect(pipe.transform(' ABC ', { type: 'param', data: 'id' })).toBe('ABC');
    const user = { sub: ' user ' };
    expect(pipe.transform(user, { type: 'custom' })).toBe(user);
  });
});
