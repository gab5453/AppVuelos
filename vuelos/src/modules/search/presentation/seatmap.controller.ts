import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogService } from '../application/catalog.service.js';
import type { SeatMapResponseDto } from './dto/seatmap-response.dto.js';
import { SeatMapQueryDto } from './dto/seatmap-query.dto.js';
import { SeatmapRateLimit } from '../../../common/security/rate-limit.decorators.js';

@Controller('offers/:offerId/seatmap')
export class SeatMapController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @SeatmapRateLimit()
  getSeatMap(@Param('offerId') offerId: string, @Query() query: SeatMapQueryDto): Promise<SeatMapResponseDto> {
    return this.catalogService.getSeatMap(offerId, query.segmentId);
  }
}
