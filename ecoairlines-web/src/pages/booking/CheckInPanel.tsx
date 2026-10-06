import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { checkIn, getBoardingPasses } from '../../api/endpoints';
import type { BoardingPass, BookingDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ProblemAlert } from '../../components/ProblemAlert';
import { QrImage } from '../../components/QrImage';
import { cityOf } from '../../data/airports';
import { localDate, localTime } from '../../lib/format';

export function CheckInPanel({ booking, onChanged }: { booking: BookingDetail; onChanged: () => Promise<void> }) {
  const { token } = useAuth();
  const [passes, setPasses] = useState<BoardingPass[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadPasses = async () => {
    if (!token) return;
    try {
      setPasses((await getBoardingPasses(token, booking.bookingId)).boardingPasses);
    } catch (caught) {
      // 404 BOARDING_PASS_NOT_AVAILABLE: todavía no hay check-in; no es un error para el usuario.
      if (caught instanceof ApiError && caught.status === 404) setPasses([]);
      else setError(caught);
    }
  };

  useEffect(() => {
    void loadPasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.bookingId]);

  const doCheckIn = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await checkIn(token, booking.bookingId);
      await Promise.all([loadPasses(), onChanged()]);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const segments = booking.itineraries?.flatMap((itinerary) => itinerary.segments) ?? [];
  const passengerName = (id: string) => {
    const passenger = booking.passengers?.find((candidate) => candidate.passengerId === id);
    return passenger ? `${passenger.firstName} ${passenger.lastName}` : id;
  };

  return (
    <div>
      <p className="muted">El check-in abre 48 horas antes de la salida y cierra 60 minutos antes. Si no elegiste asiento, te asignamos uno.</p>
      <button type="button" className="btn btn-primary" onClick={doCheckIn} disabled={busy}>
        {busy ? 'Procesando…' : passes?.length ? 'Actualizar check-in' : 'Hacer check-in'}
      </button>
      {error ? <ProblemAlert error={error} /> : null}

      {passes && passes.length > 0 && (
        <div className="passes">
          {passes.map((pass) => {
            const segment = segments.find((candidate) => candidate.segmentId === pass.segmentId);
            return (
              <article className="boarding-pass" key={`${pass.passengerId}-${pass.segmentId}`}>
                <header>
                  <span>Pase de abordar</span>
                  <strong>{segment?.flightNumber}</strong>
                </header>
                <div className="pass-body">
                  <div>
                    <p className="pass-name">{passengerName(pass.passengerId)}</p>
                    {segment && (
                      <p className="pass-route">
                        {segment.departure.iataCode} → {segment.arrival.iataCode}
                        <span className="muted small"> {cityOf(segment.departure.iataCode)} – {cityOf(segment.arrival.iataCode)}</span>
                      </p>
                    )}
                    {segment && <p className="small">{localDate(segment.departure.at)} · Sale {localTime(segment.departure.at)}</p>}
                    <dl className="pass-data">
                      <div><dt>Asiento</dt><dd>{pass.seat === 'INF' ? 'En brazos' : pass.seat}</dd></div>
                      <div><dt>Grupo</dt><dd>{pass.boardingGroup ?? '—'}</dd></div>
                      <div><dt>Posición</dt><dd>{pass.boardingPosition ?? '—'}</dd></div>
                    </dl>
                  </div>
                  <QrImage value={pass.barcode} label={`Código QR del pase de ${passengerName(pass.passengerId)}`} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
