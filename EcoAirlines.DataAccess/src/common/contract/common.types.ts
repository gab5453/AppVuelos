// Formas mínimas del contrato reutilizadas literalmente por 2+ dominios (sin lógica de negocio).
// Cada dominio sigue siendo dueño de sus DTOs compuestos (SearchResponse, BookingDetail, etc.).

export interface MoneyAmount {
  currency: string;
  baseFare?: string;
  taxes?: string;
  total: string;
}

export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';

export type FlightOperationalStatus =
  | 'SCHEDULED'
  | 'BOARDING'
  | 'DEPARTED'
  | 'DELAYED'
  | 'ARRIVED'
  | 'CANCELLED'
  | 'DIVERTED';

export interface FlightEndpoint {
  iataCode: string;
  at: string;
  terminal?: string | null;
}

export interface FlightSegment {
  segmentId: string;
  flightNumber: string;
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  layoverMinutes?: number;
  marketingCarrier: string;
  operatingCarrier: string;
  aircraft?: string | null;
  durationMinutes?: number | null;
  status?: FlightOperationalStatus | null;
}

export interface CabinPricing {
  cabinClass: CabinClass;
  fareBrand: string;
  availableSeats: number;
  fareRules: { isRefundable: boolean; isChangeable: boolean };
  baggageAllowance?: {
    personalItemIncluded?: boolean;
    carryOnIncluded?: number;
    checkedBaggageIncluded?: number;
  };
  extraCheckedBaggagePrice?: MoneyAmount;
  pricePerPassengerType?: { passengerType?: string; price?: MoneyAmount }[];
}

export interface ItineraryOption {
  itineraryId: string;
  totalDurationMinutes: number;
  stopsCount: number;
  segments: FlightSegment[];
  pricingOptions: CabinPricing[];
}

export type PassengerType = 'ADULT' | 'YOUTH' | 'CHILD' | 'INFANT';
export type DocumentType = 'PASSPORT' | 'NATIONAL_ID';
export type Gender = 'M' | 'F' | 'X';

export interface PassengerItem {
  passengerId: string;
  passengerType: PassengerType;
  associatedAdultId?: string;
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  nationality: string;
  documentExpiryDate?: string;
  birthDate: string;
  gender: Gender;
  contact: { email: string; phone: string };
  assignedSeats?: { segmentId: string; seatNumber: string }[];
  extraBaggage?: { itineraryId: string; quantity: number }[];
}

export type TicketStatus = 'PENDING' | 'ISSUING' | 'ISSUED' | 'FAILED' | 'VOIDED' | 'REFUNDED';
export type TicketSegmentStatus = 'PENDING' | 'ISSUED' | 'FAILED';

export interface TicketSegment {
  segmentId: string;
  status: TicketSegmentStatus;
  couponNumber?: string | null;
}

export interface Ticket {
  ticketId: string;
  bookingId: string;
  passengerId: string;
  eTicketNumber?: string | null;
  status: TicketStatus;
  issuedAt?: string | null;
  segments?: TicketSegment[];
  failureReason?: string | null;
}

export interface PaymentReference {
  paymentReference: string;
}
