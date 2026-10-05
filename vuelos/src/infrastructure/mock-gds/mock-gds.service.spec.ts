import { toCents } from '../../common/money/money.js';
import { MockGdsService } from './mock-gds.service.js';
import { parseSegmentId } from './gds-ids.js';

const NOW = Date.parse('2026-10-03T12:00:00Z');
const DATE = '2026-12-01';

function gdsAt(now = NOW): MockGdsService {
  const gds = new MockGdsService();
  gds.now = () => now;
  return gds;
}

describe('MockGdsService', () => {
  describe('itinerarios', () => {
    it('devuelve primero los vuelos directos, con ids reconstruibles', () => {
      const gds = gdsAt();
      const options = gds.findItineraries('UIO', 'BOG', DATE);

      expect(options[0]!.segments).toHaveLength(1);
      expect(options.map((option) => option.itineraryId)).toContain('EA300-20261201');
      expect(gds.resolveItinerary(options[0]!.itineraryId)).toEqual(options[0]);
    });

    it('arma conexiones con escala válida (60–600 min) cuando no hay vuelo directo', () => {
      const gds = gdsAt();
      const options = gds.findItineraries('GYE', 'MIA', DATE);

      expect(options.length).toBeGreaterThan(0);
      for (const option of options) {
        expect(option.segments).toHaveLength(2);
        const layover = (option.segments[1]!.departureUtc - option.segments[0]!.arrivalUtc) / 60_000;
        expect(layover).toBeGreaterThanOrEqual(60);
        expect(layover).toBeLessThanOrEqual(600);
      }
    });

    it('descarta conexiones con rodeos absurdos (Quito → Madrid → Bogotá) pero acepta escalas razonables', () => {
      const gds = gdsAt();
      const hubsOf = (origin: string, destination: string) =>
        gds
          .findItineraries(origin, destination, DATE)
          .filter((option) => option.segments.length === 2)
          .map((option) => option.segments[0]!.destination.code);

      // Quito → Bogotá directo: ni Madrid ni Guayaquil (retroceso de 1,78×) son escalas razonables.
      expect(hubsOf('UIO', 'BOG')).toEqual([]);
      expect(gds.resolveItinerary('EA502-20261201.EA501-20261202')).toBeUndefined();
      // Guayaquil → Miami vía Quito es casi en línea recta: se mantiene.
      expect(hubsOf('GYE', 'MIA')).toContain('UIO');
    });

    it('no vende vuelos que salen en menos de 60 minutos', () => {
      // 06:30 hora local de Quito: EA300 (07:00) ya no se vende; EA302 (15:30) sí.
      const gds = gdsAt(Date.parse(`${DATE}T11:30:00Z`));
      const ids = gds.findItineraries('UIO', 'BOG', DATE).map((option) => option.itineraryId);
      expect(ids).not.toContain('EA300-20261201');
      expect(ids).toContain('EA302-20261201');
    });

    it('rechaza ids inexistentes, fechas imposibles y conexiones que no empalman', () => {
      const gds = gdsAt();
      expect(gds.resolveItinerary('EA999-20261201')).toBeUndefined();
      expect(parseSegmentId('EA300-20260231')).toBeUndefined();
      expect(gds.resolveItinerary('EA300-20261201.EA320-20261201')).toBeUndefined();
    });

    it('formatea horas locales con desfase', () => {
      const gds = gdsAt();
      const segment = gds.toFlightSegment(gds.resolveSegment('EA300-20261201')!);
      expect(segment.departure.at).toBe('2026-12-01T07:00:00-05:00');
      expect(segment.marketingCarrier).toBe('EA');
    });
  });

  describe('tarifas', () => {
    it('es determinista y cobra menos a niños e infantes; los infantes no pagan impuestos', () => {
      const gds = gdsAt();
      const itinerary = gds.resolveItinerary('EA300-20261201')!;
      const fare = gds.findFare('ECONOMY', 'SEMILLA')!;

      const adult = gds.priceFor(itinerary, fare, 'ADULT');
      const child = gds.priceFor(itinerary, fare, 'CHILD');
      const infant = gds.priceFor(itinerary, fare, 'INFANT');

      expect(gds.priceFor(itinerary, fare, 'ADULT')).toEqual(adult);
      expect(toCents(child.total)).toBeLessThan(toCents(adult.total));
      expect(infant.taxes).toBe('0.00');
      expect(toCents(adult.total)).toBe(toCents(adult.baseFare) + toCents(adult.taxes));
    });

    it('las familias superiores cuestan más', () => {
      const gds = gdsAt();
      const itinerary = gds.resolveItinerary('EA300-20261201')!;
      const totals = ['SEMILLA', 'BROTE', 'BOSQUE'].map((brand) =>
        toCents(gds.priceFor(itinerary, gds.findFare('ECONOMY', brand)!, 'ADULT').total),
      );
      expect(totals).toEqual([...totals].sort((a, b) => a - b));
    });
  });

  describe('inventario y asientos', () => {
    it('retiene cupos de forma atómica: si un segmento no alcanza, no retiene ninguno', () => {
      const gds = gdsAt();
      const available = gds.availableSeats('EA300-20261201', 'BUSINESS');
      expect(gds.reserve(['EA300-20261201', 'EA400-20261201'], 'BUSINESS', available + 1)).toBe(false);
      expect(gds.availableSeats('EA300-20261201', 'BUSINESS')).toBe(available);

      expect(gds.reserve(['EA300-20261201'], 'BUSINESS', 1)).toBe(true);
      expect(gds.availableSeats('EA300-20261201', 'BUSINESS')).toBe(available - 1);
      gds.release(['EA300-20261201'], 'BUSINESS', 1);
      expect(gds.availableSeats('EA300-20261201', 'BUSINESS')).toBe(available);
    });

    it('el mapa de asientos marca ventana, pasillo, salida de emergencia y espacio extra', () => {
      const gds = gdsAt();
      const seatMap = gds.seatMap('EA300-20261201')!;
      const economy = seatMap.cabins.find((cabin) => cabin.cabinClass === 'ECONOMY')!;
      const row12 = economy.rows.find((row) => row.rowNumber === 12)!;

      expect(seatMap.cabins.map((cabin) => cabin.cabinClass)).toEqual(['BUSINESS', 'ECONOMY']);
      expect(row12.seats.find((seat) => seat.seatNumber === '12A')!.characteristics).toEqual(['WINDOW', 'EXTRA_LEGROOM', 'EMERGENCY_EXIT']);
      expect(row12.seats.find((seat) => seat.seatNumber === '12C')!.characteristics).toContain('AISLE');
    });

    it('un asiento asignado deja de estar disponible y solo lo libera su titular', () => {
      const gds = gdsAt();
      const seat = gds.firstAvailableSeat('EA300-20261201', 'ECONOMY')!;

      expect(gds.assignSeat('EA300-20261201', seat, 'booking-1:p1')).toBe(true);
      expect(gds.assignSeat('EA300-20261201', seat, 'booking-2:p1')).toBe(false);
      gds.releaseSeat('EA300-20261201', seat, 'booking-2:p1');
      expect(gds.seatInfo('EA300-20261201', seat)).toMatchObject({ isAvailable: false, holder: 'booking-1:p1' });
      gds.releaseSeat('EA300-20261201', seat, 'booking-1:p1');
      expect(gds.seatInfo('EA300-20261201', seat)!.isAvailable).toBe(true);
    });
  });

  describe('estado operativo', () => {
    it('evoluciona con la hora: programado/retrasado → embarcando → en vuelo → aterrizado', () => {
      const departure = Date.parse(`${DATE}T12:00:00Z`); // EA300 07:00 −05:00
      const before = gdsAt(departure - 6 * 3_600_000).flightStatus('EA300', DATE)!;
      const after = gdsAt(departure + 6 * 3_600_000).flightStatus('EA300', DATE)!;

      expect(['SCHEDULED', 'DELAYED']).toContain(before.status);
      expect(before.departure.actualAt).toBeNull();
      expect(after.status).toBe('ARRIVED');
      expect(after.arrival.actualAt).not.toBeNull();
    });

    it('no existe estado para vuelos fuera del itinerario', () => {
      expect(gdsAt().flightStatus('EA999', DATE)).toBeUndefined();
    });
  });
});
