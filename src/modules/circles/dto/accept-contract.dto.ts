import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

export class AcceptContractDto {
  @ApiProperty({ description: 'Consent to terms & conditions', example: true })
  @Equals(true, { message: 'agreedToTerms must be true' })
  agreedToTerms: boolean;

  @ApiProperty({ description: 'Consent to installment schedule', example: true })
  @Equals(true, { message: 'agreedToInstallmentSchedule must be true' })
  agreedToInstallmentSchedule: boolean;

  @ApiProperty({ description: 'Consent to late fees policy', example: true })
  @Equals(true, { message: 'agreedToLateFees must be true' })
  agreedToLateFees: boolean;
}
