import { Controller, Get, Param, Query } from '@nestjs/common';
import { FlightStatusService } from '../application/flight-status.service.js';
import { FlightStatusQueryDto } from './dto/flight-status-query.dto.js';
import type { FlightStatusDto } from './dto/flight-status.dto.js';

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
