export interface SeatDto {
  seatNumber: string;
  isAvailable: boolean;
  characteristics?: ('WINDOW' | 'AISLE' | 'EXTRA_LEGROOM' | 'EMERGENCY_EXIT')[];
}

export interface SeatRowDto {
  rowNumber: number;
  seats: SeatDto[];
}

export interface SeatMapCabinDto {
  cabinClass: string;
  rows: SeatRowDto[];
}

export interface SeatMapResponseDto {
  segmentId: string;
  cabins: SeatMapCabinDto[];
}
