import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class GetNotificationsQueryDto {
  @ApiPropertyOptional({ description: 'Filter only unread notifications if true' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
