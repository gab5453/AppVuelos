import type { FlightOperationalStatus } from '../../../../common/contract-types/common.types.js';

export interface FlightStatusEndpointDto {
  iataCode: string;
  terminal?: string | null;
  scheduledAt: string;
  estimatedAt?: string | null;
  actualAt?: string | null;
}

export interface FlightStatusDto {
  flightNumber: string;
  date: string;
  marketingCarrier: string;
  operatingCarrier: string;
  departure: FlightStatusEndpointDto;
  arrival: FlightStatusEndpointDto;
  aircraft?: string | null;
  status: FlightOperationalStatus;
}
