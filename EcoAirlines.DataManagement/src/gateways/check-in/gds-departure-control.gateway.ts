import { Injectable } from '@nestjs/common';
import { MockGdsService } from '@ecoairlines/data-access/external/gds/mock-gds.service.js';
import type { DepartureControlGateway } from '../../interfaces/check-in/departure-control.gateway.js';

/** Gateway de check-in sobre el GDS simulado. */
@Injectable()
export class GdsDepartureControlGateway implements DepartureControlGateway {
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
