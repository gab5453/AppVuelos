import { Controller, Get, Param, Query } from '@nestjs/common';
import { FlightStatusService } from '@ecoairlines/business/services/flight-status/flight-status.service.js';
import { FlightStatusQueryDto } from '@ecoairlines/business/dto/flight-status/flight-status-query.dto.js';
import type { FlightStatusDto } from '@ecoairlines/business/dto/flight-status/flight-status.dto.js';

@Controller('flights/:flightNumber/status')
export class FlightStatusController {
  constructor(private readonly flightStatusService: FlightStatusService) {}

  @Get()
  getStatus(
    @Param('flightNumber') flightNumber: string,
    @Query() query: FlightStatusQueryDto,
  ): Promise<FlightStatusDto> {
    return this.flightStatusService.getStatus(flightNumber, query.date);
  }
}
