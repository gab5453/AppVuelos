import { useState, type FormEvent } from 'react';
import { confirmDateChange, searchDateChange } from '../../api/endpoints';
import type { BookingDetail, DateChangeSearchResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ProblemAlert } from '../../components/ProblemAlert';
import { formatMoney, localDate, localTime, todayIso } from '../../lib/format';
import { useIdempotencyKey } from '../../lib/request-ids';
import { PaymentReferenceField } from './PaymentReferenceField';

export function DateChangePanel({ booking, onChanged }: { booking: BookingDetail; onChanged: () => Promise<void> }) {
  const { token } = useAuth();
  const itineraries = booking.itineraries ?? [];
  const [itineraryId, setItineraryId] = useState(itineraries[0]?.itineraryId ?? '');
  const [newDate, setNewDate] = useState(todayIso(7));
  const [offers, setOffers] = useState<DateChangeSearchResponse | null>(null);
  const [chosen, setChosen] = useState<string>();
  const [paymentReference, setPaymentReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string>();
  const idempotency = useIdempotencyKey([chosen, paymentReference]);

  const selectedItinerary = itineraries.find((itinerary) => itinerary.itineraryId === itineraryId);
  const changeable = selectedItinerary?.pricingOptions[0]?.fareRules.isChangeable ?? false;
  const chosenOffer = offers?.find((offer) => offer.changeOfferId === chosen);
  const needsPayment = Number(chosenOffer?.priceDifference?.totalToPay ?? 0) > 0;

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setOffers(null);
    setChosen(undefined);
    setMessage(undefined);
    try {
      setOffers(await searchDateChange(token, booking.bookingId, { changes: [{ itineraryId, newDepartureDate: newDate }] }));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!token || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      const response = await confirmDateChange(token, idempotency.key(), booking.bookingId, {
        changeOfferId: chosen,
        ...(needsPayment ? { payment: { paymentReference: paymentReference.trim() } } : {}),
      });
      idempotency.renew();
      setOffers(null);
      setChosen(undefined);
      setMessage(response.status === 202 ? 'Estamos confirmando el pago del cambio.' : '¡Cambio confirmado! Tus boletos fueron reemitidos.');
      await onChanged();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form className="panel-form" onSubmit={search}>
        <label className="field">
          Vuelo a cambiar
          <select value={itineraryId} onChange={(event) => setItineraryId(event.target.value)}>
            {itineraries.map((itinerary, index) => (
              <option key={itinerary.itineraryId} value={itinerary.itineraryId}>
                Vuelo {index + 1}: {itinerary.segments[0]!.departure.iataCode}→{itinerary.segments.at(-1)!.arrival.iataCode} · {localDate(itinerary.segments[0]!.departure.at)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Nueva fecha
          <input type="date" min={todayIso()} value={newDate} onChange={(event) => setNewDate(event.target.value)} required />
        </label>
        {!changeable && <p className="muted small">La tarifa de este vuelo no admite cambios; puedes consultarlo igualmente.</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy && !offers ? 'Buscando…' : 'Buscar opciones'}</button>
      </form>

      {offers && offers.length === 0 && <p className="muted">No hay vuelos disponibles en esa fecha.</p>}
      {offers && offers.length > 0 && (
        <fieldset className="change-offers">
          <legend>Elige tu nuevo vuelo</legend>
          {offers.map((offer) => (
            <label key={offer.changeOfferId} className={`fare ${chosen === offer.changeOfferId ? 'is-selected' : ''}`}>
              <input type="radio" name="change-offer" checked={chosen === offer.changeOfferId} onChange={() => setChosen(offer.changeOfferId)} />
              <span>
                {offer.segments?.map((segment) => `${segment.flightNumber} ${segment.departure.iataCode} ${localTime(segment.departure.at)} → ${segment.arrival.iataCode} ${localTime(segment.arrival.at)}`).join(' · ')}
              </span>
              <span className="small muted">
                Diferencia de tarifa {formatMoney(offer.priceDifference?.fareDifference)} · cargo {formatMoney(offer.priceDifference?.changeFee)}
              </span>
              <strong>A pagar: {formatMoney(offer.priceDifference?.totalToPay)}</strong>
            </label>
          ))}
        </fieldset>
      )}

      {chosen && (
        <div className="panel-form">
          {needsPayment && <PaymentReferenceField value={paymentReference} onChange={setPaymentReference} />}
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy || (needsPayment && !paymentReference.trim())}>
            {busy ? 'Confirmando…' : 'Confirmar cambio'}
          </button>
        </div>
      )}
      {message && <p className="alert alert-success" role="status">{message}</p>}
      {error ? <ProblemAlert error={error} /> : null}
    </div>
  );
}
