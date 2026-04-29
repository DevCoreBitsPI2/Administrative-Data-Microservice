import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PositionsService } from './positions.service';
import { PaginationDto } from '@/src/common';
import { CreatePositionDto, UpdatePositionDto } from './dto';

@Controller()
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @MessagePattern({ cmd: 'createPosition' })
  create(@Payload() createPositionDto: CreatePositionDto) {
    return this.positionsService.create(createPositionDto);
  }

  @MessagePattern({ cmd: 'findAllPositions' })
  findAll(@Payload() paginationDto: PaginationDto) {
    return this.positionsService.findAll(paginationDto);
  }

  @MessagePattern({ cmd: 'findOnePosition' })
  findOne(@Payload() id: number) {
    return this.positionsService.findOne(id);
  }

  @MessagePattern({ cmd: 'updatePosition' })
  update(@Payload() updatePositionDto: UpdatePositionDto) {
    return this.positionsService.update(updatePositionDto.id, updatePositionDto);
  }

  @MessagePattern({ cmd: 'removePosition' })
  remove(@Payload() id: number) {
    return this.positionsService.remove(id);
  }

  @MessagePattern({ cmd: 'positionsTree' })
  positionsTree(){
    return this.positionsService.getPositionsTree();
  }

  @MessagePattern({ cmd: 'removePositionHierarchy' })
  removeHierarchy(@Payload() id: number) {
    return this.positionsService.removeHierarchy(id);
  }
}
