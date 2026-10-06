import { useState } from 'react';
import { changeSeat } from '../../api/extensions';
import type { BookingDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ProblemAlert } from '../../components/ProblemAlert';
import { SeatMapPicker } from '../../components/SeatMapPicker';

/**
 * Cambio de asiento (extensión fuera del contrato: `PUT /bookings/{bookingId}/seat`, de la plantilla del grupo).
 * El mapa sale de `GET /offers/{offerId}/seatmap` del contrato: el `offerId` de una reserva se arma con sus
 * itinerarios, que el GDS reconstruye a partir de sus ids.
 */
export function SeatChangePanel({ booking, onChanged }: { booking: BookingDetail; onChanged: () => Promise<void> }) {
  const { token } = useAuth();
  const seated = (booking.passengers ?? []).filter((passenger) => passenger.passengerType !== 'INFANT');
  const segments = (booking.itineraries ?? []).flatMap((itinerary) =>
    itinerary.segments.map((segment) => ({ segment, cabinClass: itinerary.pricingOptions[0]?.cabinClass ?? 'ECONOMY' })),
  );
  const offerId = (booking.itineraries ?? []).map((itinerary) => itinerary.itineraryId).join('~');

  const [passengerId, setPassengerId] = useState(seated[0]?.passengerId ?? '');
  const [segmentId, setSegmentId] = useState(segments[0]?.segment.segmentId ?? '');
  const [choice, setChoice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<unknown>(null);

  const passenger = seated.find((candidate) => candidate.passengerId === passengerId);
  const current = passenger?.assignedSeats?.find((seat) => seat.segmentId === segmentId)?.seatNumber;
  const cabinClass = segments.find(({ segment }) => segment.segmentId === segmentId)?.cabinClass ?? 'ECONOMY';
  const takenByOthers = seated
    .filter((candidate) => candidate.passengerId !== passengerId)
    .flatMap((candidate) => candidate.assignedSeats?.filter((seat) => seat.segmentId === segmentId).map((seat) => seat.seatNumber) ?? []);

  const reset = () => {
    setChoice(undefined);
    setMessage(undefined);
    setError(null);
  };

  const confirm = async () => {
    if (!token || !choice) return;
    setBusy(true);
    setError(null);
    try {
      const result = await changeSeat(token, booking.bookingId, { passengerId, segmentId, newSeatNumber: choice });
      setMessage(result.message);
      setChoice(undefined);
      await onChanged();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  if (seated.length === 0 || segments.length === 0) return <p className="muted">Esta reserva no tiene asientos que cambiar.</p>;

  return (
    <div className="panel-form">
      <p className="muted">Elige un asiento libre de tu cabina. El anterior se libera para otros viajeros y, si ya hiciste el check-in, tu pase de abordar se actualiza.</p>
      <div className="grid-2">
        <label className="field">
          Pasajero
          <select value={passengerId} onChange={(event) => { setPassengerId(event.target.value); reset(); }}>
            {seated.map((candidate) => (
              <option key={candidate.passengerId} value={candidate.passengerId}>{candidate.firstName} {candidate.lastName}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Vuelo
          <select value={segmentId} onChange={(event) => { setSegmentId(event.target.value); reset(); }}>
            {segments.map(({ segment }) => (
              <option key={segment.segmentId} value={segment.segmentId}>
                {segment.flightNumber} · {segment.departure.iataCode} → {segment.arrival.iataCode}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="small">Asiento actual: <strong>{current ?? 'sin asignar'}</strong></p>
      <SeatMapPicker
        key={`${segmentId}|${message ?? ''}`}
        offerId={offerId}
        segmentId={segmentId}
        cabinClass={cabinClass}
        selected={choice}
        takenByOthers={takenByOthers}
        onSelect={setChoice}
      />
      {error ? <ProblemAlert error={error} /> : null}
      {message && <p className="alert alert-success" role="status">{message}</p>}
      <button type="button" className="btn btn-primary" onClick={confirm} disabled={!choice || choice === current || busy}>
        {busy ? 'Cambiando…' : choice ? `Cambiar a ${choice}` : 'Elige un asiento'}
      </button>
    </div>
  );
}
