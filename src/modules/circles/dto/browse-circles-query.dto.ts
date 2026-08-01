import { IsOptional, IsInt, Min, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { CircleStatus } from '@prisma/client';

export class BrowseCirclesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  durationMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number;

  @IsOptional()
  @IsEnum(CircleStatus)
  status?: CircleStatus;
}
