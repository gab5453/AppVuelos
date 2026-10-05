import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchWidget } from '../components/SearchWidget';
import { BRAND } from '../config';

const DESTINATIONS = [
  { code: 'MAD', city: 'Madrid', blurb: 'Vuelo directo desde Quito y Bogotá en nuestro 787-9.', hue: 'dest-1' },
  { code: 'LIM', city: 'Lima', blurb: 'La capital gastronómica, a poco más de 2 horas.', hue: 'dest-2' },
  { code: 'MIA', city: 'Miami', blurb: 'Playa y ciudad, con conexión en Bogotá.', hue: 'dest-3' },
  { code: 'MDE', city: 'Medellín', blurb: 'La ciudad de la eterna primavera.', hue: 'dest-4' },
  { code: 'SCL', city: 'Santiago', blurb: 'Cordillera, vinos y montaña.', hue: 'dest-5' },
  { code: 'GYE', city: 'Guayaquil', blurb: 'Puerta del Pacífico, a 55 minutos de Quito.', hue: 'dest-6' },
];

export function HomePage() {
  const [destination, setDestination] = useState<string>();

  return (
    <>
      <section className="hero">
        <HeroArt />
        <div className="container hero-content">
          <p className="eyebrow">Aerolínea 100% compensada en carbono*</p>
          <h1>{BRAND.tagline}</h1>
          <p className="hero-lead">Flota de nueva generación, tarifas claras y cada kilómetro compensado. Así se siente volar ligero.</p>
          <SearchWidget initialDestination={destination} />
        </div>
      </section>

      <section className="container section" aria-labelledby="destinos">
        <div className="section-head">
          <h2 id="destinos">Destinos para tu próximo viaje</h2>
          <p className="muted">Elige uno y lo cargamos en el buscador.</p>
        </div>
        <div className="destinations">
          {DESTINATIONS.map((item) => (
            <button
              key={item.code}
              type="button"
              className={`destination ${item.hue}`}
              onClick={() => {
                setDestination(item.code);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <span className="destination-code" aria-hidden="true">{item.code}</span>
              <span className="destination-city">{item.city}</span>
              <span className="destination-blurb">{item.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section section-tint" aria-labelledby="verde">
        <div className="container">
          <div className="section-head">
            <h2 id="verde">Volar distinto: nuestro compromiso verde</h2>
            <p className="muted">Lo que nos hace diferentes no se ve en el ala, se ve en el planeta.</p>
          </div>
          <div className="pillars">
            <Pillar icon="🌳" title="Cada vuelo, compensado" text="Mostramos el CO₂ estimado de cada vuelo y lo compensamos con reforestación certificada." />
            <Pillar icon="✈️" title="Flota eficiente" text="A220, A320neo y 787-9: hasta 25% menos combustible que la generación anterior." />
            <Pillar icon="♻️" title="Cabina sin plásticos" text="Vajilla compostable y cero plásticos de un solo uso a bordo." />
            <Pillar icon="🧳" title="Viaja ligero" text="Tarifas Semilla y Brote premian viajar con menos peso, que es menos combustible." />
          </div>
          <Link to="/compromiso-verde" className="btn btn-ghost">Conoce más</Link>
          <p className="muted small disclaimer">*{BRAND.name} es una aerolínea ficticia de un proyecto académico; las cifras son ilustrativas.</p>
        </div>
      </section>
    </>
  );
}

function Pillar({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <article className="pillar">
      <span className="pillar-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

/** Ilustración propia del hero: colinas, hojas y la estela de un avión. */
function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 1440 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0F3D17" />
          <stop offset="0.6" stopColor="#1B5E20" />
          <stop offset="1" stopColor="#2E7D32" />
        </linearGradient>
      </defs>
      <rect width="1440" height="520" fill="url(#sky)" />
      <circle cx="1180" cy="120" r="70" fill="#C8E6C9" opacity="0.25" />
      <path d="M0 420 C 240 340, 420 460, 720 400 S 1200 330, 1440 400 L1440 520 L0 520Z" fill="#2E7D32" opacity="0.7" />
      <path d="M0 470 C 300 410, 600 500, 900 450 S 1300 420, 1440 460 L1440 520 L0 520Z" fill="#388E3C" opacity="0.8" />
      <path d="M180 260 C 520 160, 900 220, 1240 110" stroke="#E8F5E9" strokeWidth="3" strokeDasharray="2 14" strokeLinecap="round" fill="none" opacity="0.7" />
      <g transform="translate(1236 104) rotate(-18)" fill="#FFFFFF">
        <path d="M0 0 L-34 -6 L-30 0 L-34 6Z" />
        <path d="M-14 0 L-24 -18 L-18 -18 L-4 0Z" />
        <path d="M-14 0 L-24 18 L-18 18 L-4 0Z" />
      </g>
      {[
        [120, 120, 18],
        [320, 80, -12],
        [980, 300, 24],
        [1320, 260, -30],
        [640, 140, 8],
      ].map(([x, y, rotation], index) => (
        <path key={index} transform={`translate(${x} ${y}) rotate(${rotation}) scale(1.1)`} d="M0 24C0 10 9 0 24 0c0 15-10 24-24 24Z" fill="#81C784" opacity="0.35" />
      ))}
    </svg>
  );
}
