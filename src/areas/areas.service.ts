import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { NATS_SERVICE } from '@/src/config';
import { PrismaService } from '@/src/lib/prismaService/prisma';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PaginationDto } from '@/src/common';
import { Prisma, status_area_type } from '@prisma/client';

@Injectable()
export class AreasService {

  private readonly logger = new Logger('areas service')
  
  constructor(
    // @Inject(NATS_SERVICE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService
  ){}

  async create(createAreaDto: CreateAreaDto) {
    try {
      return await this.prisma.areas.create({
        data:{
          name: createAreaDto.name,
          description: createAreaDto.description,
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


  async findAll(paginationDto: PaginationDto) {
    try {
      const total = await this.prisma.areas.count();
      const currentPage = paginationDto.page;
      const perPage = paginationDto.limit;

      return {
        data: await this.prisma.areas.findMany({
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

      return await this.prisma.areas.update({
        where: { id_area: id },
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

  async remove(id: number) {
    try {
      const area = await this.findOne(id);

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
