import { Injectable } from '@nestjs/common';
import { buildSegmentId, formatLocalIso } from '@ecoairlines/data-access/external/gds/gds-ids.js';
import { MockGdsService, type FleetSchedule } from '@ecoairlines/data-access/external/gds/mock-gds.service.js';
import { AIRPORTS } from '@ecoairlines/data-access/seed/airports.js';
import { TimetableError, type FleetAircraft, type RouteDefinition } from '@ecoairlines/data-access/seed/timetable.js';
import type { FlightOperationsGateway, PublishResult, RouteInfo, ScheduledFlightInfo } from '../../interfaces/admin/flight-operations.gateway.js';

/** Gateway de admin sobre el GDS simulado. */
@Injectable()
export class GdsFlightOperationsGateway implements FlightOperationsGateway {
  constructor(private readonly gds: MockGdsService) {}

  async flightsOn(localDate: string): Promise<ScheduledFlightInfo[]> {
    return this.gds.flightsOn(localDate).map((segment) => {
      const occupancy = this.gds.occupancy(segment.segmentId) ?? { totalSeats: 0, availableSeats: 0, reservedSeats: 0, simulatedSeats: 0 };
      return {
        flightId: segment.segmentId,
        flightNumber: segment.flight.flightNumber,
        origin: segment.origin.code,
        destination: segment.destination.code,
        date: segment.localDate,
        scheduledDeparture: formatLocalIso(segment.departureUtc, segment.origin.utcOffsetMinutes),
        ...occupancy,
      };
    });
  }

  async routes(): Promise<RouteInfo[]> {
    const routes = new Map<string, RouteInfo>();
    for (const flight of this.gds.currentTimetable().flights) {
      const airports = [flight.origin, flight.destination].sort() as [string, string];
      const key = airports.join('-');
      const existing = routes.get(key);
      if (existing) {
        existing.dailyFlights += 1;
      } else {
        const [first, second] = airports.map((code) => `${AIRPORTS[code]?.city ?? code} (${code})`);
        routes.set(key, { airports, label: `${first} ↔ ${second}`, dailyFlights: 1 });
      }
    }
    return [...routes.values()];
  }

  async fleetSchedule(localDate: string): Promise<FleetSchedule> {
    return this.gds.fleetSchedule(localDate);
  }

  async salesWindowEnd(): Promise<string> {
    return this.gds.salesWindowAt('UIO').to;
  }

  async segmentIdFor(flightNumber: string, date: string): Promise<string | undefined> {
    const segmentId = buildSegmentId(flightNumber.toUpperCase(), date);
    return this.gds.resolveSegment(segmentId) ? segmentId : undefined;
  }

  async publishRoutes(routes: readonly RouteDefinition[], fleet: readonly FleetAircraft[]): Promise<PublishResult> {
    try {
      const timetable = this.gds.publishRoutes(routes, fleet);
      return { ok: true, aircraftByRoute: timetable.aircraftByRoute ?? {}, fleet: timetable.fleet };
    } catch (error) {
      if (error instanceof TimetableError) return { ok: false, problems: error.problems };
      throw error;
    }
  }

  async customerSeatsOn(flightNumber: string): Promise<number> {
    return this.gds.customerSeatsOn(flightNumber);
  }
}
