import { IsNumber, IsPositive } from 'class-validator';

export class FilterPositionsByAreaDto {
  @IsNumber()
  @IsPositive()
  id_area: number;
}
