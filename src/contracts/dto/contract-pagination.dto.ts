import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaginationDto } from '@/src/common';
import { contract_status, StatusContractListDto } from '../enum/contract_status.enum';
import { contract_type, TypeContractListDto } from '../enum/contract_type.enum';

export class ContractPaginationDto extends PaginationDto {
  @IsOptional()
  @IsEnum(StatusContractListDto, {
    message: `valid status are: ${StatusContractListDto}`,
  })
  status?: contract_status;

  @IsOptional()
  @IsEnum(TypeContractListDto, {
    message: `valid types are: ${TypeContractListDto}`,
  })
  contract_type?: contract_type;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  id_employee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  id_manager?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsString()
  search?: string;
}
