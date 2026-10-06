import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAdmin } from './auth/RequireAdmin';
import { RequireAuth } from './auth/RequireAuth';
import { BookingFlowProvider } from './booking/BookingFlowContext';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminObservabilityPage } from './pages/admin/AdminObservabilityPage';
import { BookingDetailPage } from './pages/BookingDetailPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { FlightStatusPage } from './pages/FlightStatusPage';
import { GreenCommitmentPage } from './pages/GreenCommitmentPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MyTripsPage } from './pages/MyTripsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { ResultsPage } from './pages/ResultsPage';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BookingFlowProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Header />
          <main id="contenido" tabIndex={-1}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/vuelos" element={<ResultsPage />} />
              <Route path="/reserva" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
              <Route path="/mis-viajes" element={<RequireAuth><MyTripsPage /></RequireAuth>} />
              <Route path="/mis-viajes/:bookingId" element={<RequireAuth><BookingDetailPage /></RequireAuth>} />
              <Route
                path="/check-in"
                element={
                  <RequireAuth>
                    <MyTripsPage title="Check-in" hint="Elige tu reserva confirmada para hacer el check-in y obtener tus pases de abordar." />
                  </RequireAuth>
                }
              />
              <Route path="/estado-de-vuelo" element={<FlightStatusPage />} />
              <Route path="/compromiso-verde" element={<GreenCommitmentPage />} />
              <Route path="/ingresar" element={<LoginPage />} />
              <Route path="/mi-perfil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
              <Route path="/admin" element={<RequireAdmin><AdminDashboardPage /></RequireAdmin>} />
              <Route path="/admin/observabilidad" element={<RequireAdmin><AdminObservabilityPage /></RequireAdmin>} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
          <Footer />
        </BrowserRouter>
      </BookingFlowProvider>
    </AuthProvider>
  );
}
