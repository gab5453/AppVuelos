import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CabinPricing, FlightOffer, HoldResponse, PassengerBreakdown } from '../api/types';

export interface FareChoice {
  itineraryId: string;
  pricing: CabinPricing;
}

/** Selección en curso: oferta, tarifa por itinerario, pasajeros y hold creado. Vive en memoria. */
export interface BookingFlow {
  offer: FlightOffer;
  choices: FareChoice[];
  passengers: Required<PassengerBreakdown>;
  hold: HoldResponse;
}

interface BookingFlowValue {
  flow: BookingFlow | null;
  setFlow(flow: BookingFlow | null): void;
}

const BookingFlowContext = createContext<BookingFlowValue | null>(null);

export function BookingFlowProvider({ children }: { children: ReactNode }) {
  const [flow, setFlow] = useState<BookingFlow | null>(null);
  const value = useMemo(() => ({ flow, setFlow }), [flow]);
  return <BookingFlowContext.Provider value={value}>{children}</BookingFlowContext.Provider>;
}

// eslint-disable-next-line react/only-export-components
export function useBookingFlow(): BookingFlowValue {
  const context = useContext(BookingFlowContext);
  if (!context) throw new Error('useBookingFlow debe usarse dentro de <BookingFlowProvider>.');
  return context;
}
