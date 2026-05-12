import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AreasService } from './areas.service';
import { AreaPaginationDto, CreateAreaDto, UpdateAreaDto } from './dto';

@Controller()
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @MessagePattern({cmd:'createArea'})
  create(@Payload() createAreaDto: CreateAreaDto) {
    return this.areasService.create(createAreaDto);
  }

  @MessagePattern({cmd:'findAllAreas'})
  findAll(@Payload() paginationDto: AreaPaginationDto) {
    return this.areasService.findAll(paginationDto);
  }

  @MessagePattern({cmd:'findOneArea'})
  findOne(@Payload() id: number) {
    return this.areasService.findOne(id);
  }

  @MessagePattern({cmd:'updateArea'})
  update(@Payload() updateAreaDto: UpdateAreaDto) {
    return this.areasService.update(updateAreaDto.id, updateAreaDto);
  }

  @MessagePattern({cmd:'removeArea'})
  remove(@Payload() id: number) {
    return this.areasService.remove(id);
  }
}
