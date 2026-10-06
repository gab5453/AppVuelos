export type BarcodeType = 'AZTEC' | 'PDF417' | 'QR';

export interface BoardingPassDto {
  passengerId: string;
  segmentId: string;
  seat: string;
  boardingGroup?: string | null;
  boardingPosition?: string | null;
  barcode: string;
  barcodeType: BarcodeType;
}

export interface BoardingPassListResponseDto {
  bookingId: string;
  boardingPasses: BoardingPassDto[];
}
