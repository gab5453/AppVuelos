import { Inject, Injectable } from '@nestjs/common';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import { resolvePassengerCounts } from '@ecoairlines/data-access/common/passenger-counts.js';
import { FLIGHT_CATALOG_GATEWAY, type FlightCatalogGateway } from '@ecoairlines/data-management/interfaces/search/flight-catalog.gateway.js';
import type { SearchRequestDto } from '../../dto/search/search-request.dto.js';
import type { SearchResponseDto } from '../../dto/search/search-response.dto.js';
import type { SeatMapResponseDto } from '../../dto/search/seatmap-response.dto.js';

@Injectable()
export class CatalogService {
  constructor(@Inject(FLIGHT_CATALOG_GATEWAY) private readonly catalog: FlightCatalogGateway) {}

  /** Aplica los defaults de `PassengerBreakdown` (adults: 1, resto: 0) antes de consultar el catálogo. */
  search(request: SearchRequestDto): Promise<SearchResponseDto> {
    const counts = resolvePassengerCounts(request.passengers);
    if (counts.infants > counts.adults) {
      throw new ProblemDetailsException({
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'Cada infante debe viajar con un adulto.',
        invalidParams: [{ name: 'passengers.infants', reason: 'must not exceed passengers.adults' }],
      });
    }
    return this.catalog.search(request.itineraries, counts);
  }

  async getSeatMap(offerId: string, segmentId: string): Promise<SeatMapResponseDto> {
    const seatMap = await this.catalog.getSeatMap(offerId, segmentId);
    if (!seatMap) {
      throw ProblemDetailsException.notFound('Oferta o segmento no encontrado.');
    }
    return seatMap;
  }
}
