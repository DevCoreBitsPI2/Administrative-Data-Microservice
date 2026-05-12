import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaginationDto } from '@/src/common';
import { position_status, TypePositionListDto } from '../enum/status_position.enum';

export class PositionPaginationDto extends PaginationDto {
  @IsOptional()
  @IsEnum(TypePositionListDto, {
    message: `valid types are: ${TypePositionListDto}`,
  })
  status?: position_status;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  id_area?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  parent_position_id?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
