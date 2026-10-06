import { Link } from 'react-router-dom';
import { BRAND } from '../config';
import { FARE_DESCRIPTIONS } from '../lib/format';

const FARES = [
  { brand: 'SEMILLA', icon: '🌱', note: 'Ideal si viajas solo con tu mochila.' },
  { brand: 'BROTE', icon: '🌿', note: 'El equilibrio para la mayoría de viajes.' },
  { brand: 'BOSQUE', icon: '🌳', note: 'Flexibilidad total en Economy.' },
  { brand: 'DOSEL', icon: '🏞️', note: 'La experiencia Business.' },
];

export function GreenCommitmentPage() {
  return (
    <div className="container section green-page">
      <h1>Nuestro compromiso verde</h1>
      <p className="lead">
        En {BRAND.name} creemos que viajar y cuidar el planeta no están peleados. Por eso cada decisión, desde la flota hasta las tarifas,
        busca reducir nuestra huella.
      </p>

      <section className="pillars" aria-label="Compromisos">
        <article className="pillar">
          <span className="pillar-icon" aria-hidden="true">🌳</span>
          <h2>Compensación del 100%</h2>
          <p>Calculamos las emisiones estimadas de cada vuelo y las compensamos con proyectos de reforestación en los Andes y la Amazonía.</p>
        </article>
        <article className="pillar">
          <span className="pillar-icon" aria-hidden="true">✈️</span>
          <h2>Flota de nueva generación</h2>
          <p>Airbus A220, A320neo y Boeing 787-9: motores más eficientes y menos ruido.</p>
        </article>
        <article className="pillar">
          <span className="pillar-icon" aria-hidden="true">⛽</span>
          <h2>Combustible sostenible</h2>
          <p>Rutas piloto con combustible de aviación sostenible (SAF) a partir de residuos.</p>
        </article>
        <article className="pillar">
          <span className="pillar-icon" aria-hidden="true">♻️</span>
          <h2>Cero plásticos de un solo uso</h2>
          <p>Vajilla compostable a bordo y separación de residuos en cada vuelo.</p>
        </article>
      </section>

      <section id="tarifas" className="section" aria-labelledby="tarifas-title">
        <h2 id="tarifas-title">Familias tarifarias: de la semilla al dosel</h2>
        <p className="muted">Menos peso a bordo significa menos combustible. Nuestras tarifas premian viajar ligero.</p>
        <div className="fare-families">
          {FARES.map((fare) => (
            <article key={fare.brand} className="card fare-family">
              <span className="pillar-icon" aria-hidden="true">{fare.icon}</span>
              <h3>{fare.brand.charAt(0) + fare.brand.slice(1).toLowerCase()}</h3>
              <p>{FARE_DESCRIPTIONS[fare.brand]}</p>
              <p className="muted small">{fare.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card how-co2">
        <h2>¿Cómo estimamos el CO₂?</h2>
        <p>
          Distancia del vuelo × un factor por pasajero según la cabina (Economy ocupa menos espacio que Business), con un ajuste por
          rutas reales. Es una estimación ilustrativa para dimensionar el impacto de tu viaje.
        </p>
      </section>

      <Link to="/" className="btn btn-primary">Buscar mi próximo vuelo</Link>
      <p className="muted small disclaimer">{BRAND.name} es una aerolínea ficticia de un proyecto académico; los compromisos y cifras son ilustrativos.</p>
    </div>
  );
}
