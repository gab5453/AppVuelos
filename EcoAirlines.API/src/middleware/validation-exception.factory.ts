import type { ValidationError } from 'class-validator';
import { ProblemDetailsException } from '@ecoairlines/business/exceptions/problem-details.exception.js';
import type { ProblemDetailsInvalidParam } from '@ecoairlines/business/exceptions/problem-details.types.js';

function flattenErrors(errors: ValidationError[], parentPath = ''): ProblemDetailsInvalidParam[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const ownReasons: ProblemDetailsInvalidParam[] = error.constraints
      ? Object.values(error.constraints).map((reason) => ({ name: path, reason }))
      : [];
    const childReasons = error.children?.length ? flattenErrors(error.children, path) : [];
    return [...ownReasons, ...childReasons];
  });
}

export function validationExceptionFactory(errors: ValidationError[]): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 400,
    code: 'VALIDATION_FAILED',
    title: 'La petición no cumple con las reglas de validación.',
    invalidParams: flattenErrors(errors),
  });
}
