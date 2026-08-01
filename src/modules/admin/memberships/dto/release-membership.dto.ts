import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ReleaseMembershipDto {
  @ApiProperty({ description: 'Reason for manually releasing stuck reservation', example: 'Customer support request to abandon stuck join attempt' })
  @IsString()
  @IsNotEmpty({ message: 'reason is required when releasing a membership reservation' })
  reason: string;
}
