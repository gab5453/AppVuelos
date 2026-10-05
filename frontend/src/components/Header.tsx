import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BRAND } from '../config';
import { LeafLogo } from './LeafLogo';

const LINKS = [
  { to: '/', label: 'Reservar', end: true },
  { to: '/mis-viajes', label: 'Mis viajes' },
  { to: '/check-in', label: 'Check-in' },
  { to: '/estado-de-vuelo', label: 'Estado de vuelo' },
  { to: '/compromiso-verde', label: 'Compromiso verde' },
];

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <div className="container header-inner">
        <Link to="/" className="brand" aria-label={`${BRAND.name}, inicio`}>
          <LeafLogo />
          <span>{BRAND.name}</span>
        </Link>

        <button
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">☰</span>
          <span className="visually-hidden">Menú</span>
        </button>

        <nav id="main-nav" className={`main-nav ${open ? 'is-open' : ''}`} aria-label="Principal">
          <ul>
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} end={link.end} onClick={() => setOpen(false)}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="session">
            {user ? (
              <>
                <span className="session-name" title={user.email}>
                  Hola, {user.name.split(' ')[0]}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    logout();
                    setOpen(false);
                    navigate('/');
                  }}
                >
                  Salir
                </button>
              </>
            ) : (
              <Link to="/ingresar" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
                Ingresar
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
