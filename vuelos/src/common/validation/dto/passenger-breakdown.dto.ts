import { IsInt, IsOptional, Min } from 'class-validator';

/** Forma reutilizada por SearchRequest y HoldRequest en el contrato. */
export class PassengerBreakdownDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  adults?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  youths?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  infants?: number;
}
