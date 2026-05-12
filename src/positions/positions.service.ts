import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { CreatePositionDto, PositionPaginationDto, UpdatePositionDto } from './dto';
import { PrismaService } from '@/src/lib/prismaService/prisma';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { NATS_SERVICE } from '@/src/config';
import { status_area_type, status_position_type } from '@prisma/client';
import { AreasService } from '@/src/areas/areas.service';

@Injectable()
export class PositionsService {
  private readonly logger = new Logger('positions service');

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
    private readonly areaService: AreasService,
    private readonly prisma: PrismaService
  ) {}

  private async validateParentHierarchy(positionId: number | null, parentId: number): Promise<void> {
    if (positionId === parentId) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'A position cannot be its own parent',
      });
    }

    const parent = await this.prisma.positions.findUnique({
      where: { id_position: parentId },
    });

    if (!parent) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Parent position with id ${parentId} not found`,
      });
    }

    if (parent.status === status_position_type.inactive) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Parent position must be active',
      });
    }

    if (positionId === null) return;

    // Detectar jerarquía circular: recorrer hacia arriba desde el padre propuesto
    let currentId: number | null = parent.parent_position_id;
    const visited = new Set<number>();

    while (currentId !== null) {
      if (currentId === positionId) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'The hierarchy relationship creates a circular reference',
        });
      }
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const ancestor = await this.prisma.positions.findUnique({
        where: { id_position: currentId },
        select: { parent_position_id: true },
      });

      if (!ancestor) break;
      currentId = ancestor.parent_position_id;
    }
  }

  async create(createPositionDto: CreatePositionDto) {
    try {
      const area = await this.areaService.findOne(createPositionDto.id_area);
      if (area.status == status_area_type.inactive){
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: `The area ${area.name} is inactive`
        })
      }

      if (createPositionDto.parent_position_id !== undefined) {
        await this.validateParentHierarchy(null, createPositionDto.parent_position_id);
      }

      return await this.prisma.positions.create({
        data: {
          name: createPositionDto.name,
          base_salary: createPositionDto.base_salary,
          description: createPositionDto.description,
          vacancies: createPositionDto.vacancies,
          id_administrator: createPositionDto.id_administrator,
          id_area: createPositionDto.id_area,
          parent_position_id: createPositionDto.parent_position_id,
          created_at: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async findAll(paginationDto: PositionPaginationDto) {
    try {
      const where: any = {
        ...(paginationDto.status && { status: paginationDto.status }),
        ...(paginationDto.id_area && { id_area: paginationDto.id_area }),
        ...(paginationDto.parent_position_id && { parent_position_id: paginationDto.parent_position_id }),
        ...(paginationDto.search && {
          OR: [
            { name: { contains: paginationDto.search } },
            { description: { contains: paginationDto.search } },
          ],
        }),
      };

      const total = await this.prisma.positions.count({ where });
      const currentPage = paginationDto.page;
      const perPage = paginationDto.limit;

      return {
        data: await this.prisma.positions.findMany({
          where,
          skip: (currentPage - 1) * perPage,
          take: perPage,
        }),
        meta: {
          total,
          page: currentPage,
          lastPage: Math.ceil(total / perPage),
        },
      };
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async findOne(id: number) {
    try {
      const position = await this.prisma.positions.findUnique({
        where: { id_position: id },
      });

      if (!position) {
        throw new RpcException({
          status: HttpStatus.NOT_FOUND,
          message: `Position with id ${id} not found`,
        });
      }

      return position;
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async update(id: number, updatePositionDto: UpdatePositionDto) {
    try {
      await this.findOne(id);

      if (updatePositionDto.parent_position_id !== undefined) {
        await this.validateParentHierarchy(id, updatePositionDto.parent_position_id);
      }

      const { id: _, ...data } = updatePositionDto;

      return await this.prisma.positions.update({
        where: { id_position: id },
        data,
      });
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Desvincula el cargo de su padre
  async removeHierarchy(id: number) {
    try {
      const position = await this.findOne(id);

      if (position.parent_position_id === null) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: `Position with id ${id} has no parent assigned`,
        });
      }

      const hasSubordinates = await this.prisma.positions.count({
        where: { parent_position_id: id },
      });

      const updated = await this.prisma.positions.update({
        where: { id_position: id },
        data: { parent_position_id: null },
      });

      return {
        ...updated,
        warning: hasSubordinates > 0
          ? `Position unlinked from hierarchy but has ${hasSubordinates} subordinate position(s) that depend on it`
          : undefined,
      };
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async remove(id: number) {
    try {
      const position = await this.findOne(id);

      await this.prisma.positions.update({
        where: {id_position: position.id_position},
        data: {
          status: status_position_type.inactive
        },
      })

      return {
        message: "position deleted successfully",
      }
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getPositionsTree(){
    try {
      
      const [positions, employees] = await Promise.all([
        this.prisma.positions.findMany({
          include: {
            areas: { 
              select: { 
                name: true, 
                description: true 
              } 
            },
            other_positions: { 
              select: { 
                id_position: true 
              } 
            },
          },
        }),
        firstValueFrom(this.client.send({ cmd: 'findAllUsers' }, {})),
      ]);

      const employeeByPosition = new Map<number, { photo_url: string; first_name: string; last_name: string }>(
        employees.map((e: { id_position: number; photo_url: string; first_name: string; last_name: string }) => [
          e.id_position,
          { photo_url: e.photo_url, first_name: e.first_name, last_name: e.last_name },
          ]),
        );

      return positions.map((position) => ({
        ...position,
        employee: employeeByPosition.get(position.id_position) ?? null,
        }));

    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
