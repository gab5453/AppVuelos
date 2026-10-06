import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { SearchRequestDto } from './search-request.dto.js';

describe('SearchRequestDto', () => {
  const validItineraries = [{ origin: 'MIA', destination: 'BOG', departureDate: '2026-01-01' }];

  it('rejects a payload that omits the required nested "passengers" object', async () => {
    const dto = plainToInstance(SearchRequestDto, { itineraries: validItineraries });
    const errors = await validate(dto);

    const passengersError = errors.find((error) => error.property === 'passengers');
    expect(passengersError).toBeDefined();
  });

  it('accepts a payload with itineraries and an (empty) passengers object', async () => {
    const dto = plainToInstance(SearchRequestDto, { itineraries: validItineraries, passengers: {} });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
