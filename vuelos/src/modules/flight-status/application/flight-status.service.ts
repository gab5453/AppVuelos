import { Inject, Injectable } from '@nestjs/common';
import { ProblemDetailsException } from '../../../common/problem-details/problem-details.exception.js';
import {
  FLIGHT_STATUS_PROVIDER_PORT,
  type FlightStatusProviderPort,
} from '../domain/ports/flight-status-provider.port.js';
import type { FlightStatusDto } from '../presentation/dto/flight-status.dto.js';

@Injectable()
export class FlightStatusService {
  constructor(
    @Inject(FLIGHT_STATUS_PROVIDER_PORT) private readonly provider: FlightStatusProviderPort,
  ) {}

  async getStatus(flightNumber: string, date: string): Promise<FlightStatusDto> {
    const status = await this.provider.getStatus(flightNumber, date);
    if (!status) {
      throw ProblemDetailsException.notFound(
        'No hay información de estado para ese vuelo y fecha.',
        'FLIGHT_STATUS_NOT_AVAILABLE',
      );
    }
    return status;
  }
}
