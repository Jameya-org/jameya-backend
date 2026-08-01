import { IsNotEmpty, IsString } from 'class-validator';

export class MarkDefaultedDto {
  @IsNotEmpty({ message: 'reason is required when marking a membership as defaulted' })
  @IsString()
  reason: string;
}
