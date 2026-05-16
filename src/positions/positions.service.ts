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

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (normalized.length < 3 || normalized.length > 100) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Position name must be between 3 and 100 characters',
      });
    }
    return normalized;
  }

  private async validateUniqueNameByArea(name: string, areaId: number, positionId?: number): Promise<void> {
    const position = await this.prisma.positions.findFirst({
      where: {
        name,
        id_area: areaId,
        ...(positionId && { id_position: { not: positionId } }),
      },
    });

    if (position) {
      throw new RpcException({
        status: HttpStatus.CONFLICT,
        message: 'A position with this name already exists in the selected area',
      });
    }
  }

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

      const name = this.normalizeName(createPositionDto.name);
      await this.validateUniqueNameByArea(name, createPositionDto.id_area);

      return await this.prisma.positions.create({
        data: {
          name,
          base_salary: createPositionDto.base_salary,
          description: createPositionDto.description.trim(),
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
      const position = await this.findOne(id);

      if (updatePositionDto.parent_position_id !== undefined) {
        await this.validateParentHierarchy(id, updatePositionDto.parent_position_id);
      }

      const { id: _, ...data } = updatePositionDto;
      if (data.name !== undefined) data.name = this.normalizeName(data.name);
      if (data.description !== undefined) data.description = data.description.trim();

      if (data.name !== undefined || data.id_area !== undefined) {
        await this.validateUniqueNameByArea(
          data.name ?? position.name,
          data.id_area ?? position.id_area,
          id,
        );
      }

      const updated = await this.prisma.positions.update({
        where: { id_position: id },
        data,
      });

      if (updated.id_area !== position.id_area) {
        await this.createCareerHistoryForPositionEmployees(
          updated.id_position,
          'transfer',
          `Traslado del cargo ${updated.name} del área ${position.id_area} al área ${updated.id_area}`,
        );
      }

      if ((updated.base_salary ?? null) !== (position.base_salary ?? null)) {
        await this.createCareerHistoryForPositionEmployees(
          updated.id_position,
          'salary_change',
          `Cambio salarial del cargo ${updated.name} de ${position.base_salary ?? 'sin salario'} a ${updated.base_salary ?? 'sin salario'}`,
        );
      }

      return updated;
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

  private async createCareerHistoryForPositionEmployees(
    positionId: number,
    type: 'promotion' | 'transfer' | 'contract_modification' | 'salary_change' | 'evaluation',
    description: string,
  ) {
    const employees: { id_employee: number }[] = await firstValueFrom(
      this.client.send({ cmd: 'findEmployeesByPositionIds' }, { positionIds: [positionId] }),
    );

    if (employees.length === 0) return;

    const eventDate = new Date();

    // One bulk message avoids blocking this update with one NATS round-trip per employee.
    await firstValueFrom(
      this.client.send(
        { cmd: 'createManyCareerHistory' },
        employees.map((employee) => ({
          description,
          event_date: eventDate,
          type,
          id_employee: employee.id_employee,
        })),
      ),
    );
  }

  async findByArea(id_area: number) {
    try {
      return await this.prisma.positions.findMany({
        where: { id_area, status: status_position_type.active },
      });
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

      const [employees, subordinatePositions] = await Promise.all([
        firstValueFrom(this.client.send({ cmd: 'findEmployeesByPositionIds' }, { positionIds: [position.id_position] })),
        this.prisma.positions.count({ where: { parent_position_id: position.id_position } }),
      ]);

      if (employees.length > 0) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Position cannot be removed because it has active employees assigned',
        });
      }

      if (position.parent_position_id !== null) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Position cannot be removed because it has a parent position assigned',
        });
      }

      if (subordinatePositions > 0) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Position cannot be removed because it has subordinate positions',
        });
      }

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
