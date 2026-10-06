import { Link } from 'react-router-dom';
import { LeafLogo } from '../components/LeafLogo';

export function NotFoundPage() {
  return (
    <div className="container section narrow center">
      <LeafLogo size={64} />
      <h1>Esta página voló lejos</h1>
      <p className="muted">No encontramos lo que buscabas.</p>
      <Link to="/" className="btn btn-primary">Volver al inicio</Link>
    </div>
  );
}
