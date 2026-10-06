import type { DocumentType, Gender } from '../../common/contract/common.types.js';

/**
 * Perfil del cliente (extensión fuera del contrato). Usa los mismos campos que `PassengerItem` del contrato
 * y que la plantilla del grupo de vuelos, para autocompletar al pasajero y para integrarse con el booking.
 * `ownerId` es el `sub` del JWT: cada cliente tiene un solo perfil. **Base de datos futura: `customers`.**
 */
export interface CustomerProfileRecord {
  ownerId: string;
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  nationality: string;
  documentExpiryDate?: string;
  birthDate: string;
  gender: Gender;
  contact: { email: string; phone: string };
  updatedAt: string;
}
