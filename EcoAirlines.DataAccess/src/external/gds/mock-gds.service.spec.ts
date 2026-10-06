import { toCents } from '../../common/money.js';
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
      expect(options.map((option) => option.itineraryId)).toContain('EA104-20261201');
      expect(gds.resolveItinerary(options[0]!.itineraryId)).toEqual(options[0]);
    });

    it('ofrece los 2 vuelos directos del día primero y conexiones con escala válida (60–600 min)', () => {
      const gds = gdsAt();
      const options = gds.findItineraries('GYE', 'MIA', DATE);

      expect(options.slice(0, 2).map((option) => option.segments.length)).toEqual([1, 1]);
      for (const option of options.filter((candidate) => candidate.segments.length === 2)) {
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

      // Quito → Bogotá: ni Madrid ni Guayaquil (retroceso de 1,78×) son escalas razonables.
      expect(hubsOf('UIO', 'BOG')).not.toContain('MAD');
      expect(hubsOf('UIO', 'BOG')).not.toContain('GYE');
      // Quito → Madrid (EA116) + Madrid → Bogotá (EA286): rodeo absurdo, no es un itinerario válido.
      expect(gds.resolveItinerary('EA116-20261201.EA287-20261202')).toBeUndefined();
    });

    it('no vende vuelos que salen en menos de 60 minutos', () => {
      // 07:00 hora local de Quito: EA104 (07:30) ya no se vende; EA105 (14:30) sí.
      const gds = gdsAt(Date.parse(`${DATE}T12:00:00Z`));
      const ids = gds.findItineraries('UIO', 'BOG', DATE).map((option) => option.itineraryId);
      expect(ids).not.toContain('EA104-20261201');
      expect(ids).toContain('EA105-20261201');
    });

    it('rechaza ids inexistentes, fechas imposibles y conexiones que no empalman', () => {
      const gds = gdsAt();
      expect(gds.resolveItinerary('EA999-20261201')).toBeUndefined();
      expect(parseSegmentId('EA300-20260231')).toBeUndefined();
      // Quito → Bogotá y luego Guayaquil → Quito: no empalman.
      expect(gds.resolveItinerary('EA104-20261201.EA120-20261201')).toBeUndefined();
    });

    it('formatea horas locales con desfase', () => {
      const gds = gdsAt();
      const segment = gds.toFlightSegment(gds.resolveSegment('EA104-20261201')!);
      expect(segment.departure.at).toBe('2026-12-01T07:30:00-05:00');
      expect(segment.marketingCarrier).toBe('EA');
    });
  });

  describe('tarifas', () => {
    it('es determinista y cobra menos a niños e infantes; los infantes no pagan impuestos', () => {
      const gds = gdsAt();
      const itinerary = gds.resolveItinerary('EA104-20261201')!;
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
      const itinerary = gds.resolveItinerary('EA104-20261201')!;
      const totals = ['SEMILLA', 'BROTE', 'BOSQUE'].map((brand) =>
        toCents(gds.priceFor(itinerary, gds.findFare('ECONOMY', brand)!, 'ADULT').total),
      );
      expect(totals).toEqual([...totals].sort((a, b) => a - b));
    });
  });

  describe('inventario y asientos', () => {
    it('retiene cupos de forma atómica: si un segmento no alcanza, no retiene ninguno', () => {
      const gds = gdsAt();
      const available = gds.availableSeats('EA104-20261201', 'BUSINESS');
      expect(gds.reserve(['EA104-20261201', 'EA105-20261201'], 'BUSINESS', available + 1)).toBe(false);
      expect(gds.availableSeats('EA104-20261201', 'BUSINESS')).toBe(available);

      expect(gds.reserve(['EA104-20261201'], 'BUSINESS', 1)).toBe(true);
      expect(gds.availableSeats('EA104-20261201', 'BUSINESS')).toBe(available - 1);
      gds.release(['EA104-20261201'], 'BUSINESS', 1);
      expect(gds.availableSeats('EA104-20261201', 'BUSINESS')).toBe(available);
    });

    it('el mapa de asientos marca ventana, pasillo, salida de emergencia y espacio extra', () => {
      const gds = gdsAt();
      // Quito → Miami (EA112) opera con A320neo: filas de emergencia 12 y 13.
      const seatMap = gds.seatMap('EA112-20261201')!;
      const economy = seatMap.cabins.find((cabin) => cabin.cabinClass === 'ECONOMY')!;
      const row12 = economy.rows.find((row) => row.rowNumber === 12)!;

      expect(seatMap.cabins.map((cabin) => cabin.cabinClass)).toEqual(['BUSINESS', 'ECONOMY']);
      expect(row12.seats.find((seat) => seat.seatNumber === '12A')!.characteristics).toEqual(['WINDOW', 'EXTRA_LEGROOM', 'EMERGENCY_EXIT']);
      expect(row12.seats.find((seat) => seat.seatNumber === '12C')!.characteristics).toContain('AISLE');
    });

    it('un asiento asignado deja de estar disponible y solo lo libera su titular', () => {
      const gds = gdsAt();
      const seat = gds.firstAvailableSeat('EA104-20261201', 'ECONOMY')!;

      expect(gds.assignSeat('EA104-20261201', seat, 'booking-1:p1')).toBe(true);
      expect(gds.assignSeat('EA104-20261201', seat, 'booking-2:p1')).toBe(false);
      gds.releaseSeat('EA104-20261201', seat, 'booking-2:p1');
      expect(gds.seatInfo('EA104-20261201', seat)).toMatchObject({ isAvailable: false, holder: 'booking-1:p1' });
      gds.releaseSeat('EA104-20261201', seat, 'booking-1:p1');
      expect(gds.seatInfo('EA104-20261201', seat)!.isAvailable).toBe(true);
    });
  });

  describe('ocupación simulada', () => {
    const occupied = (gds: MockGdsService, segmentId: string) =>
      gds.seatMap(segmentId)!.cabins.flatMap((cabin) => cabin.rows.flatMap((row) => row.seats)).filter((seat) => !seat.isAvailable).length;

    it('los vuelos de la primera semana tienen ocupación moderada y los demás empiezan vacíos', () => {
      const gds = gdsAt(); // 2026-10-03
      const soon = 'EA104-20261005';
      const total = gds.seatMap(soon)!.cabins.flatMap((cabin) => cabin.rows.flatMap((row) => row.seats)).length;
      expect(occupied(gds, soon) / total).toBeGreaterThan(0.1);
      expect(occupied(gds, soon) / total).toBeLessThan(0.6);
      expect(occupied(gds, 'EA104-20261201')).toBe(0);
    });

    it('un vuelo vacío no se llena con el paso de los días (el corte se fija al arrancar)', () => {
      const gds = gdsAt();
      expect(occupied(gds, 'EA104-20261201')).toBe(0);
      gds.now = () => Date.parse('2026-11-28T12:00:00Z');
      expect(occupied(gds, 'EA104-20261201')).toBe(0);
    });
  });

  describe('ventana de venta (91 días)', () => {
    it('vende desde hoy hasta hoy + 90 y nada después', () => {
      const gds = gdsAt(); // 2026-10-03 07:00 en Quito
      expect(gds.salesWindowAt('UIO')).toEqual({ from: '2026-10-03', to: '2027-01-01' });
      expect(gds.findItineraries('UIO', 'BOG', '2026-10-03').length).toBeGreaterThan(0);
      expect(gds.findItineraries('UIO', 'BOG', '2027-01-01').length).toBeGreaterThan(0);
      expect(gds.findItineraries('UIO', 'BOG', '2027-01-02')).toEqual([]);
      expect(gds.flightStatus('EA104', '2027-01-02')).toBeUndefined();
      expect(gds.isSellable(gds.resolveItinerary('EA104-20270102')!)).toBe(false);
    });

    it('al pasar un día entra un día nuevo con el horario de su día de la semana', () => {
      const today = gdsAt();
      const tomorrow = gdsAt(NOW + 86_400_000);
      // Mismos vuelos directos que el sábado anterior (las conexiones del último día no pueden salir de la ventana).
      const directs = (gds: MockGdsService, date: string) =>
        gds.findItineraries('UIO', 'BOG', date).filter((option) => option.segments.length === 1).map((option) => option.itineraryId.slice(0, 5));
      expect(directs(tomorrow, '2027-01-02')).toEqual(['EA104', 'EA105']);
      expect(directs(tomorrow, '2027-01-02')).toEqual(directs(today, '2026-12-26'));
    });

    it('el horario de la flota asigna un avión a cada vuelo del día', () => {
      const schedule = gdsAt().fleetSchedule(DATE);
      expect(schedule.totalFlights).toBe(180);
      expect(schedule.aircraft.reduce((total, aircraft) => total + aircraft.flights.length, 0)).toBe(180);
    });
  });

  describe('estado operativo', () => {
    it('evoluciona con la hora: programado/retrasado → embarcando → en vuelo → aterrizado', () => {
      const departure = Date.parse(`${DATE}T12:30:00Z`); // EA104 07:30 −05:00
      const before = gdsAt(departure - 6 * 3_600_000).flightStatus('EA104', DATE)!;
      const after = gdsAt(departure + 6 * 3_600_000).flightStatus('EA104', DATE)!;

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
