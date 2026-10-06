import { Link } from 'react-router-dom';
import { BRAND } from '../config';
import { LeafLogo } from './LeafLogo';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand brand-footer">
            <LeafLogo size={28} />
            <span>{BRAND.name}</span>
          </div>
          <p className="muted">{BRAND.tagline}.</p>
        </div>
        <nav aria-label="Enlaces del pie">
          <h2 className="footer-title">Viaja</h2>
          <ul>
            <li><Link to="/">Reservar vuelo</Link></li>
            <li><Link to="/mis-viajes">Mis viajes</Link></li>
            <li><Link to="/check-in">Check-in</Link></li>
            <li><Link to="/estado-de-vuelo">Estado de vuelo</Link></li>
          </ul>
        </nav>
        <div>
          <h2 className="footer-title">Sostenibilidad</h2>
          <ul>
            <li><Link to="/compromiso-verde">Nuestro compromiso verde</Link></li>
            <li><Link to="/compromiso-verde#tarifas">Familias tarifarias</Link></li>
          </ul>
        </div>
      </div>
      <div className="container footer-legal">
        <p>
          Proyecto académico. {BRAND.name} es una aerolínea ficticia: vuelos, precios y cifras ambientales son ilustrativos.
        </p>
      </div>
    </footer>
  );
}
