import { useEffect, useState, type FormEvent } from 'react';
import { addBaggage, getBaggageOptions } from '../../api/endpoints';
import type { BaggageOptionsResponse, BookingDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ProblemAlert } from '../../components/ProblemAlert';
import { formatMoney } from '../../lib/format';
import { useIdempotencyKey } from '../../lib/request-ids';
import { PaymentReferenceField } from './PaymentReferenceField';

export function BaggagePanel({ booking, onChanged }: { booking: BookingDetail; onChanged: () => Promise<void> }) {
  const { token } = useAuth();
  const [options, setOptions] = useState<BaggageOptionsResponse | null>(null);
  const [selected, setSelected] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [paymentReference, setPaymentReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string>();
  const idempotency = useIdempotencyKey([selected, quantity, paymentReference]);

  const load = async () => {
    if (!token) return;
    try {
      setOptions(await getBaggageOptions(token, booking.bookingId));
    } catch (caught) {
      setError(caught);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.bookingId, booking.updatedAt]);

  const option = options?.[selected];
  const remaining = option ? (option.maxAllowed ?? 0) - (option.alreadyPurchased ?? 0) : 0;
  const passengerName = (id?: string) => {
    const passenger = booking.passengers?.find((candidate) => candidate.passengerId === id);
    return passenger ? `${passenger.firstName} ${passenger.lastName}` : id;
  };
  const flightLabel = (itineraryId?: string) => {
    const index = booking.itineraries?.findIndex((itinerary) => itinerary.itineraryId === itineraryId) ?? -1;
    const itinerary = booking.itineraries?.[index];
    return itinerary ? `Vuelo ${index + 1} (${itinerary.segments[0]!.departure.iataCode}→${itinerary.segments.at(-1)!.arrival.iataCode})` : itineraryId;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !option?.passengerId || !option.itineraryId) return;
    setBusy(true);
    setError(null);
    setMessage(undefined);
    try {
      const response = await addBaggage(token, idempotency.key(), booking.bookingId, {
        passengerId: option.passengerId,
        itineraryId: option.itineraryId,
        quantity,
        payment: { paymentReference: paymentReference.trim() },
      });
      idempotency.renew();
      setPaymentReference('');
      setMessage(
        response.status === 202
          ? 'Estamos confirmando el pago; la maleta se agregará en unos segundos.'
          : `Listo: ${response.data?.totalBaggage ?? quantity} maleta(s) facturada(s) en total para este vuelo.`,
      );
      await onChanged();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  if (!options) return error ? <ProblemAlert error={error} /> : <p className="muted">Cargando opciones…</p>;
  if (options.length === 0) return <p className="muted">No hay vuelos pendientes donde agregar maletas.</p>;

  return (
    <form onSubmit={submit} className="panel-form">
      <p className="muted">Viajar ligero ahorra combustible 🌱. Si necesitas más espacio, agrega hasta {option?.maxAllowed ?? 3} maletas extra por vuelo.</p>
      <label className="field">
        Pasajero y vuelo
        <select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
          {options.map((item, index) => (
            <option key={`${item.passengerId}-${item.itineraryId}`} value={index}>
              {passengerName(item.passengerId)} · {flightLabel(item.itineraryId)} · compradas {item.alreadyPurchased ?? 0}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Cantidad ({formatMoney(option?.price)} c/u)
        <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} disabled={remaining <= 0}>
          {Array.from({ length: Math.max(1, remaining) }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
      <PaymentReferenceField value={paymentReference} onChange={setPaymentReference} />
      <button type="submit" className="btn btn-primary" disabled={busy || remaining <= 0 || !paymentReference.trim()}>
        {remaining <= 0 ? 'Límite alcanzado' : busy ? 'Agregando…' : `Agregar y pagar ${formatMoney(String((Number(option?.price?.total ?? 0) * quantity).toFixed(2)))}`}
      </button>
      {message && <p className="alert alert-success" role="status">{message}</p>}
      {error ? <ProblemAlert error={error} /> : null}
    </form>
  );
}
