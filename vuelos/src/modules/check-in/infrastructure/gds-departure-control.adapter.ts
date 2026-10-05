import { Injectable } from '@nestjs/common';
import { MockGdsService } from '../../../infrastructure/mock-gds/mock-gds.service.js';
import type { DepartureControlPort } from '../domain/ports/departure-control.port.js';

/** Adapter de check-in sobre el GDS simulado. */
@Injectable()
export class GdsDepartureControlAdapter implements DepartureControlPort {
  constructor(private readonly gds: MockGdsService) {}

  async segmentTimes(segmentId: string): Promise<{ departureUtc: number; arrivalUtc: number } | undefined> {
    const segment = this.gds.resolveSegment(segmentId);
    return segment && { departureUtc: segment.departureUtc, arrivalUtc: segment.arrivalUtc };
  }

  async autoAssignSeat(segmentId: string, cabinClass: string, holder: string): Promise<string | undefined> {
    const seat = this.gds.firstAvailableSeat(segmentId, cabinClass);
    return seat && this.gds.assignSeat(segmentId, seat, holder) ? seat : undefined;
  }
}
