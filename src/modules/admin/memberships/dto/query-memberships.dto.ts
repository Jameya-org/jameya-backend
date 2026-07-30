import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsBooleanString } from 'class-validator';
import { MembershipStatus } from '@prisma/client';

export class QueryMembershipsDto {
  @ApiPropertyOptional({ enum: MembershipStatus, description: 'Filter by membership status' })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @ApiPropertyOptional({ description: 'Filter memberships that used manual eligibility override' })
  @IsOptional()
  @IsBooleanString()
  usedEligibilityOverride?: string;
}
