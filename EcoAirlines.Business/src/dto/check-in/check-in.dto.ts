export type CheckInStatus = 'NOT_ELIGIBLE' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export type PassengerCheckInStatus = 'CHECKED_IN' | 'NOT_CHECKED_IN' | 'FAILED';

export interface CheckedInSegmentDto {
  segmentId: string;
  seat?: string | null;
  status: PassengerCheckInStatus;
}

export interface CheckedInPassengerDto {
  passengerId: string;
  status: PassengerCheckInStatus;
  segments?: CheckedInSegmentDto[];
}

export interface CheckInResponseDto {
  bookingId: string;
  status: CheckInStatus;
  checkedInPassengers: CheckedInPassengerDto[];
}
