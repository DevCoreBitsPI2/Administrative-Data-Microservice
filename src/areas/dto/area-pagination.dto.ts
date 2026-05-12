import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '@/src/common';
import { area_status, TypeStatusAreaListDto } from '../enum/status_area.enum';

export class AreaPaginationDto extends PaginationDto {
  @IsOptional()
  @IsEnum(TypeStatusAreaListDto, {
    message: `valid types are: ${TypeStatusAreaListDto}`,
  })
  status?: area_status;

  @IsOptional()
  @IsString()
  search?: string;
}
