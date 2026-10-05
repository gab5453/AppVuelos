/**
 * Aeropuertos que opera la red (los mismos del GDS simulado de la API). El contrato no expone un
 * catálogo de aeropuertos, así que el frontend mantiene esta lista para los selectores y para
 * estimar distancias (CO₂). Si la red cambia, esta lista debe actualizarse.
 */
export interface AirportInfo {
  code: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export const AIRPORTS: AirportInfo[] = [
  { code: 'UIO', city: 'Quito', country: 'Ecuador', lat: -0.1292, lon: -78.3575 },
  { code: 'GYE', city: 'Guayaquil', country: 'Ecuador', lat: -2.1574, lon: -79.8836 },
  { code: 'CUE', city: 'Cuenca', country: 'Ecuador', lat: -2.8895, lon: -78.9844 },
  { code: 'BOG', city: 'Bogotá', country: 'Colombia', lat: 4.7016, lon: -74.1469 },
  { code: 'MDE', city: 'Medellín', country: 'Colombia', lat: 6.1645, lon: -75.4231 },
  { code: 'LIM', city: 'Lima', country: 'Perú', lat: -12.0219, lon: -77.1143 },
  { code: 'SCL', city: 'Santiago', country: 'Chile', lat: -33.393, lon: -70.7858 },
  { code: 'MIA', city: 'Miami', country: 'Estados Unidos', lat: 25.7959, lon: -80.287 },
  { code: 'MEX', city: 'Ciudad de México', country: 'México', lat: 19.4361, lon: -99.0719 },
  { code: 'MAD', city: 'Madrid', country: 'España', lat: 40.4983, lon: -3.5676 },
];

export const airportByCode = (code: string): AirportInfo | undefined => AIRPORTS.find((airport) => airport.code === code);

export const cityOf = (code: string): string => airportByCode(code)?.city ?? code;
