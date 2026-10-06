import { IsString } from 'class-validator';

/** Referencia de pago gestionada por la Payment API. Esta API no procesa tarjetas ni 3DS. */
export class PaymentReferenceDto {
  @IsString()
  paymentReference!: string;
}
