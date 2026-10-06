export interface AuthenticatedUser {
  /** Subject del token (sub). Es el único origen válido de ownerId/customerId. */
  sub: string;
  scopes: string[];
  clientId?: string;
}
