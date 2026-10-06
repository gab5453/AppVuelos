import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createBooking, getHold, releaseHold } from '../api/endpoints';
import { getMyProfile } from '../api/extensions';
import type { PassengerItem, PassengerType } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useBookingFlow, type BookingFlow } from '../booking/BookingFlowContext';
import { Countdown } from '../components/Countdown';
import { Field, SelectField } from '../components/FormFields';
import { ItinerarySummary } from '../components/ItinerarySummary';
import { ProblemAlert } from '../components/ProblemAlert';
import { SeatMapPicker } from '../components/SeatMapPicker';
import { PASSENGER_LABELS, formatMoney, todayIso } from '../lib/format';
import { useIdempotencyKey } from '../lib/request-ids';

interface PassengerForm {
  passengerId: string;
  passengerType: PassengerType;
  associatedAdultId: string;
  firstName: string;
  lastName: string;
  documentType: 'PASSPORT' | 'NATIONAL_ID';
  documentNumber: string;
  nationality: string;
  documentExpiryDate: string;
  birthDate: string;
  gender: 'M' | 'F' | 'X';
  email: string;
  phone: string;
}

export function CheckoutPage() {
  const { flow } = useBookingFlow();
  if (!flow) {
    return (
      <div className="container section narrow">
        <h1>No hay una reserva en curso</h1>
        <p className="muted">Busca un vuelo y elige tu tarifa para continuar.</p>
        <Link to="/" className="btn btn-primary">Buscar vuelos</Link>
      </div>
    );
  }
  return <Checkout flow={flow} />;
}

function buildPassengers(flow: BookingFlow): PassengerForm[] {
  const types: [PassengerType, number, string][] = [
    ['ADULT', flow.passengers.adults, 'a'],
    ['YOUTH', flow.passengers.youths, 'y'],
    ['CHILD', flow.passengers.children, 'c'],
    ['INFANT', flow.passengers.infants, 'i'],
  ];
  return types.flatMap(([passengerType, count, prefix]) =>
    Array.from({ length: count }, (_, index) => ({
      passengerId: `${prefix}${index + 1}`,
      passengerType,
      associatedAdultId: passengerType === 'INFANT' ? `a${index + 1}` : '',
      firstName: '',
      lastName: '',
      documentType: 'PASSPORT' as const,
      documentNumber: '',
      nationality: 'EC',
      documentExpiryDate: '',
      birthDate: '',
      gender: 'F' as const,
      email: '',
      phone: '',
    })),
  );
}

function Checkout({ flow }: { flow: BookingFlow }) {
  const { token } = useAuth();
  const { setFlow } = useBookingFlow();
  const navigate = useNavigate();
  const [passengers, setPassengers] = useState<PassengerForm[]>(() => buildPassengers(flow));
  /** seats[passengerId][segmentId] = seatNumber */
  const [seats, setSeats] = useState<Record<string, Record<string, string>>>({});
  /** bags[passengerId][itineraryId] = cantidad */
  const [bags, setBags] = useState<Record<string, Record<string, number>>>({});
  const [openSeatMap, setOpenSeatMap] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState<string>();
  const [prefilled, setPrefilled] = useState(false);

  // Autocompleta al primer adulto con el perfil del cliente (extensión GET /customers/me), si lo registró.
  useEffect(() => {
    if (!token) return;
    let active = true;
    getMyProfile(token)
      .then((profile) => {
        if (!active) return;
        setPassengers((current) =>
          current.map((passenger, index) =>
            index === 0 && passenger.passengerType === 'ADULT' && !passenger.firstName && !passenger.documentNumber
              ? {
                  ...passenger,
                  firstName: profile.firstName,
                  lastName: profile.lastName,
                  documentType: profile.documentType,
                  documentNumber: profile.documentNumber,
                  nationality: profile.nationality,
                  documentExpiryDate: profile.documentExpiryDate ?? '',
                  birthDate: profile.birthDate,
                  gender: profile.gender,
                  email: profile.contact.email,
                  phone: profile.contact.phone,
                }
              : passenger,
          ),
        );
        setPrefilled(true);
      })
      .catch(() => undefined); // Sin perfil (404) o sin el scope: el cliente completa el formulario a mano.
    return () => {
      active = false;
    };
  }, [token]);

  const segments = flow.offer.itineraries.flatMap((itinerary, index) =>
    itinerary.segments.map((segment) => ({ segment, cabinClass: flow.choices[index]!.pricing.cabinClass })),
  );
  const seated = passengers.filter((passenger) => passenger.passengerType !== 'INFANT');
  const adults = passengers.filter((passenger) => passenger.passengerType === 'ADULT');

  const request = useMemo(
    () => ({
      holdId: flow.hold.holdId,
      payment: { paymentReference: paymentReference.trim() },
      passengers: passengers.map((form): PassengerItem => {
        const assignedSeats = Object.entries(seats[form.passengerId] ?? {}).map(([segmentId, seatNumber]) => ({ segmentId, seatNumber }));
        const extraBaggage = Object.entries(bags[form.passengerId] ?? {})
          .filter(([, quantity]) => quantity > 0)
          .map(([itineraryId, quantity]) => ({ itineraryId, quantity }));
        return {
          passengerId: form.passengerId,
          passengerType: form.passengerType,
          ...(form.passengerType === 'INFANT' ? { associatedAdultId: form.associatedAdultId } : {}),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          documentType: form.documentType,
          documentNumber: form.documentNumber.trim(),
          nationality: form.nationality.trim().toUpperCase(),
          ...(form.documentExpiryDate ? { documentExpiryDate: form.documentExpiryDate } : {}),
          birthDate: form.birthDate,
          gender: form.gender,
          contact: { email: form.email.trim(), phone: form.phone.trim() },
          ...(assignedSeats.length ? { assignedSeats } : {}),
          ...(extraBaggage.length ? { extraBaggage } : {}),
        };
      }),
    }),
    [flow.hold.holdId, passengers, seats, bags, paymentReference],
  );
  const idempotency = useIdempotencyKey([JSON.stringify(request)]);

  const bagsTotal = flow.choices.reduce((sum, choice) => {
    const price = Number(choice.pricing.extraCheckedBaggagePrice?.total ?? 0);
    const quantity = Object.values(bags).reduce((acc, perItinerary) => acc + (perItinerary[choice.itineraryId] ?? 0), 0);
    return sum + price * quantity;
  }, 0);
  const total = Number(flow.hold.lockedPrice.total) + bagsTotal;

  const update = (index: number, patch: Partial<PassengerForm>) =>
    setPassengers((current) => current.map((passenger, position) => (position === index ? { ...passenger, ...patch } : passenger)));

  const release = async () => {
    if (token) await releaseHold(token, flow.hold.holdId).catch(() => undefined);
    setFlow(null);
    navigate('/');
  };

  const onExpire = async () => {
    if (!token) return;
    const status = await getHold(token, flow.hold.holdId).catch(() => null);
    if (!status || status.status !== 'HELD') setExpired(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const missing = passengers.find((p) => !p.firstName.trim() || !p.lastName.trim() || !p.documentNumber.trim() || !p.birthDate || !p.email.trim() || !p.phone.trim());
    if (missing) return setFormError(`Completa los datos de ${PASSENGER_LABELS[missing.passengerType]} ${missing.passengerId}.`);
    if (!/^pay_[A-Za-z0-9_-]{3,64}$/.test(paymentReference.trim())) {
      return setFormError('Ingresa la referencia de pago entregada por la pasarela (formato pay_…).');
    }
    setFormError(undefined);
    setBusy(true);
    setError(null);
    try {
      const response = await createBooking(token, idempotency.key(), request);
      idempotency.renew();
      setFlow(null);
      navigate(`/mis-viajes/${response.data.bookingId}`, { state: { justBooked: response.status } });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  if (expired) {
    return (
      <div className="container section narrow">
        <h1>Tu reserva temporal expiró</h1>
        <p className="muted">Liberamos los asientos para otros viajeros. Puedes volver a buscar y elegir tu vuelo.</p>
        <Link to="/" className="btn btn-primary" onClick={() => setFlow(null)}>Buscar de nuevo</Link>
      </div>
    );
  }

  return (
    <div className="container section checkout">
      <form className="checkout-main" onSubmit={submit} noValidate>
        <h1>Completa tu reserva</h1>

        <section className="card" aria-labelledby="vuelos-title">
          <h2 id="vuelos-title">Tus vuelos</h2>
          {flow.offer.itineraries.map((itinerary, index) => (
            <div key={itinerary.itineraryId} className="checkout-itinerary">
              <ItinerarySummary itinerary={itinerary} cabinClass={flow.choices[index]!.pricing.cabinClass} label={`Vuelo ${index + 1}`} />
              <p className="small">Tarifa <strong>{flow.choices[index]!.pricing.fareBrand}</strong></p>
            </div>
          ))}
        </section>

        <section aria-labelledby="pasajeros-title">
          <h2 id="pasajeros-title">Pasajeros</h2>
          {prefilled && <p className="muted small">Completamos al pasajero 1 con los datos de tu perfil. Puedes cambiarlos para esta reserva.</p>}
          {passengers.map((passenger, index) => (
            <fieldset key={passenger.passengerId} className="card passenger">
              <legend>
                {PASSENGER_LABELS[passenger.passengerType]} {index + 1}
              </legend>
              <div className="grid-2">
                <Field label="Nombres" value={passenger.firstName} onChange={(firstName) => update(index, { firstName })} autoComplete="given-name" maxLength={60} />
                <Field label="Apellidos" value={passenger.lastName} onChange={(lastName) => update(index, { lastName })} autoComplete="family-name" maxLength={60} />
                <SelectField label="Tipo de documento" value={passenger.documentType} onChange={(documentType) => update(index, { documentType: documentType as PassengerForm['documentType'] })}
                  options={[['PASSPORT', 'Pasaporte'], ['NATIONAL_ID', 'Cédula / DNI']]} />
                <Field label="Número de documento" value={passenger.documentNumber} onChange={(documentNumber) => update(index, { documentNumber })} maxLength={20} />
                <Field label="Nacionalidad (código de país)" value={passenger.nationality} onChange={(nationality) => update(index, { nationality })} maxLength={3} placeholder="EC" />
                <Field label="Vencimiento del documento (opcional)" type="date" min={todayIso()} value={passenger.documentExpiryDate} onChange={(documentExpiryDate) => update(index, { documentExpiryDate })} required={false} />
                <Field label="Fecha de nacimiento" type="date" max={todayIso()} value={passenger.birthDate} onChange={(birthDate) => update(index, { birthDate })} autoComplete="bday" />
                <SelectField label="Género" value={passenger.gender} onChange={(gender) => update(index, { gender: gender as PassengerForm['gender'] })}
                  options={[['F', 'Femenino'], ['M', 'Masculino'], ['X', 'No binario / prefiero no decir']]} />
                <Field label="Correo" type="email" value={passenger.email} onChange={(email) => update(index, { email })} autoComplete="email" maxLength={120} />
                <Field label="Teléfono" type="tel" value={passenger.phone} onChange={(phone) => update(index, { phone })} autoComplete="tel" maxLength={20} placeholder="+593…" />
                {passenger.passengerType === 'INFANT' && (
                  <SelectField label="Viaja en brazos de" value={passenger.associatedAdultId} onChange={(associatedAdultId) => update(index, { associatedAdultId })}
                    options={adults.map((adult, position) => [adult.passengerId, adult.firstName ? `${adult.firstName} ${adult.lastName}` : `Adulto ${position + 1}`])} />
                )}
              </div>
              {index > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => update(index, { email: passengers[0]!.email, phone: passengers[0]!.phone })}>
                  Usar el contacto del pasajero 1
                </button>
              )}

              {passenger.passengerType !== 'INFANT' && (
                <div className="extras">
                  <h3>Asientos (opcional)</h3>
                  {segments.map(({ segment, cabinClass }) => {
                    const key = `${passenger.passengerId}|${segment.segmentId}`;
                    const current = seats[passenger.passengerId]?.[segment.segmentId];
                    return (
                      <div key={key} className="extra-row">
                        <span className="small">
                          {segment.flightNumber} {segment.departure.iataCode}→{segment.arrival.iataCode}: <strong>{current ?? 'sin elegir'}</strong>
                        </span>
                        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={openSeatMap === key} onClick={() => setOpenSeatMap(openSeatMap === key ? null : key)}>
                          {openSeatMap === key ? 'Cerrar mapa' : 'Elegir asiento'}
                        </button>
                        {openSeatMap === key && (
                          <SeatMapPicker
                            offerId={flow.offer.offerId}
                            segmentId={segment.segmentId}
                            cabinClass={cabinClass}
                            selected={current}
                            takenByOthers={seated
                              .filter((other) => other.passengerId !== passenger.passengerId)
                              .map((other) => seats[other.passengerId]?.[segment.segmentId])
                              .filter((seat): seat is string => Boolean(seat))}
                            onSelect={(seat) =>
                              setSeats((all) => {
                                const mine = { ...all[passenger.passengerId] };
                                if (seat) mine[segment.segmentId] = seat;
                                else delete mine[segment.segmentId];
                                return { ...all, [passenger.passengerId]: mine };
                              })
                            }
                          />
                        )}
                      </div>
                    );
                  })}

                  <h3>Maletas extra (opcional)</h3>
                  {flow.choices.map((choice, position) => (
                    <div key={choice.itineraryId} className="extra-row">
                      <label className="inline-field">
                        Vuelo {position + 1} · {formatMoney(choice.pricing.extraCheckedBaggagePrice)} c/u
                        <select
                          value={bags[passenger.passengerId]?.[choice.itineraryId] ?? 0}
                          onChange={(event) =>
                            setBags((all) => ({
                              ...all,
                              [passenger.passengerId]: { ...all[passenger.passengerId], [choice.itineraryId]: Number(event.target.value) },
                            }))
                          }
                        >
                          {[0, 1, 2, 3].map((quantity) => (
                            <option key={quantity} value={quantity}>{quantity}</option>
                          ))}
                        </select>
                      </label>
                      <span className="muted small">Incluidas en tu tarifa: {choice.pricing.baggageAllowance.checkedBaggageIncluded ?? 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
        </section>

        <section className="card" aria-labelledby="pago-title">
          <h2 id="pago-title">Pago</h2>
          <p className="muted small">
            El pago lo procesa nuestra pasarela segura (Payment API). EcoAirlines nunca recibe ni guarda datos de tarjeta: solo la referencia del pago aprobado.
          </p>
          <div className="grid-2">
            <Field label="Referencia de pago" value={paymentReference} onChange={setPaymentReference} placeholder="pay_…" maxLength={68} />
            <div className="field field-end">
              <button type="button" className="btn btn-ghost" onClick={() => setPaymentReference(`pay_demo_${crypto.randomUUID().slice(0, 8)}`)}>
                Generar referencia de prueba
              </button>
            </div>
          </div>
          <p className="muted small">Entorno de pruebas: <code>pay_async_…</code> simula un pago en proceso y <code>pay_declined_…</code> uno rechazado.</p>
        </section>

        {formError && <p className="form-error" role="alert">{formError}</p>}
        {error ? <ProblemAlert error={error} /> : null}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'Confirmando…' : `Pagar y reservar ${formatMoney(String(total.toFixed(2)), flow.hold.lockedPrice.currency)}`}
        </button>
      </form>

      <aside className="checkout-aside">
        <div className="card sticky">
          <p className="small muted">Tu precio está congelado por</p>
          <Countdown expiresAt={flow.hold.expiresAt} onExpire={onExpire} />
          <dl className="price-list">
            <div><dt>Vuelos</dt><dd>{formatMoney(flow.hold.lockedPrice)}</dd></div>
            {bagsTotal > 0 && <div><dt>Maletas extra</dt><dd>{formatMoney(String(bagsTotal.toFixed(2)))}</dd></div>}
            <div className="price-total"><dt>Total</dt><dd>{formatMoney(String(total.toFixed(2)), flow.hold.lockedPrice.currency)}</dd></div>
          </dl>
          <button type="button" className="btn btn-ghost btn-sm" onClick={release}>Cancelar y liberar asientos</button>
        </div>
      </aside>
    </div>
  );
}
