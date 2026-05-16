import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AreaPaginationDto, CreateAreaDto, UpdateAreaDto } from './dto';
import { NATS_SERVICE } from '@/src/config';
import { PrismaService } from '@/src/lib/prismaService/prisma';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { Prisma, status_area_type } from '@prisma/client';

@Injectable()
export class AreasService {

  private readonly logger = new Logger('areas service')
  
  constructor(
    // @Inject(NATS_SERVICE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService
  ){}

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (normalized.length < 3 || normalized.length > 100) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Area name must be between 3 and 100 characters',
      });
    }
    return normalized;
  }

  async create(createAreaDto: CreateAreaDto) {
    try {
      const name = this.normalizeName(createAreaDto.name);

      return await this.prisma.areas.create({
        data:{
          name,
          description: createAreaDto.description.trim(),
          id_administrator: createAreaDto.id_administrator,
          created_at: new Date()
        }
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new RpcException({
          status: HttpStatus.CONFLICT,
          message: 'Area with that name already exists',
        });
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2004'
      ){
        throw new RpcException({
          status: HttpStatus.CONFLICT,
          message: error.message
        })
      }
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error,
      });
    }
  }


  async findAll(paginationDto: AreaPaginationDto) {
    try {
      const where: any = {
        ...(paginationDto.status && { status: paginationDto.status }),
        ...(paginationDto.search && {
          OR: [
            { name: { contains: paginationDto.search } },
            { description: { contains: paginationDto.search } },
          ],
        }),
      };

      const total = await this.prisma.areas.count({ where });
      const currentPage = paginationDto.page;
      const perPage = paginationDto.limit;

      return {
        data: await this.prisma.areas.findMany({
          where,
          skip: (currentPage - 1) * perPage,
          take: perPage,
          include: {
            _count: {
              select: { positions: true },
            },
          },
        }),
        meta: {
          total,
          page: currentPage,
          lastPage: Math.ceil(total / perPage),
        },
      };
    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async findOne(id: number) {
    try {
      const area = await this.prisma.areas.findUnique({
        where: { id_area: id },
        include: {
          _count: {
            select: { positions: true },
          },
        },
      });

      if (!area) {
        throw new RpcException({
          status: HttpStatus.NOT_FOUND,
          message: `Área con id ${id} no encontrada`,
        });
      }

      return area;
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async update(id: number, updateAreaDto: UpdateAreaDto) {
    try {
      await this.findOne(id);

      const { id: _, ...data } = updateAreaDto;
      if (data.name !== undefined) data.name = this.normalizeName(data.name);
      if (data.description !== undefined) data.description = data.description.trim();

      return await this.prisma.areas.update({
        where: { id_area: id },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new RpcException({
          status: HttpStatus.CONFLICT,
          message: 'Area with that name already exists',
        });
      }
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async remove(id: number) {
    try {
      const area = await this.findOne(id);

      const positions = await this.prisma.positions.count({
        where: { id_area: area.id_area },
      });

      if (positions > 0) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Area cannot be removed because it has associated positions',
        });
      }

      await this.prisma.areas.update({
        where: { id_area: id },
        data: {
          status: status_area_type.inactive
        }
      });
    
      return {
        message: "area deleted successfully"
      }

    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
