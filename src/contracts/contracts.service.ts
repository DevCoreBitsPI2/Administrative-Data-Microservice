import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '@/src/lib/prismaService/prisma';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { CloudinaryResponse } from '@/src/lib/imageProvider/cloudinary-response';
import { ContractPaginationDto, CreateContractDto, RenewContractDto, UpdateContractDto } from './dto';
import { contract_status_enum } from '@prisma/client';
import { NON_EDITABLE_STATUSES } from './enum/contract_status.enum';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NATS_SERVICE } from '@/src/config';
import { firstValueFrom } from 'rxjs';
import { EmailService } from '@/src/lib/email/email';

const streamifier = require('streamifier');

@Injectable()
export class ContractsService {
  private readonly logger = new Logger('contracts service');

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async uploadFile(file: Express.Multer.File): Promise<CloudinaryResponse> {
    const buffer: Buffer | undefined = Buffer.isBuffer(file)
      ? (file as unknown as Buffer)
      : (file as any)?.buffer;
    if (!buffer) {
      return Promise.reject(new Error('No buffer provided to uploadFile'));
    }

    const publicId = `contract_${Date.now()}`;

    return new Promise<CloudinaryResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'image', public_id: publicId, format: 'pdf' },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('No upload result from Cloudinary'));
          resolve(result);
        },
      );
      try {
        streamifier.createReadStream(buffer).pipe(uploadStream);
      } catch (err) {
        reject(err);
      }
    });
  }

  private validateDateRange(startDate: Date, endDate: Date): void {
    if (endDate <= startDate) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'End date must be after start date',
      });
    }
  }

  private async validateNoActiveOverlap(
    idEmployee: number,
    startDate: Date,
    endDate: Date,
    excludeContractId?: number,
  ): Promise<void> {
    const overlapping = await this.prisma.contracts.findFirst({
      where: {
        id_employee: idEmployee,
        status: contract_status_enum.valid,
        start_date: { lt: endDate },
        end_date: { gt: startDate },
        ...(excludeContractId && { id_contract: { not: excludeContractId } }),
      },
    });

    if (overlapping) {
      throw new RpcException({
        status: HttpStatus.CONFLICT,
        message: `Employee already has an active contract (id: ${overlapping.id_contract}) overlapping with the given dates`,
      });
    }
  }

  async create(createContractDto: CreateContractDto) {
    try {
      this.validateDateRange(createContractDto.startDate, createContractDto.endDate);
      await this.validateNoActiveOverlap(
        createContractDto.idEmployee,
        createContractDto.startDate,
        createContractDto.endDate,
      );

      const contract = await this.prisma.contracts.create({
        data: {
          conditions: createContractDto.conditions,
          ...(createContractDto.contractStatus && { status: createContractDto.contractStatus }),
          contract_type: createContractDto.contractType,
          start_date: createContractDto.startDate,
          end_date: createContractDto.endDate,
          id_employee: createContractDto.idEmployee,
          id_manager: createContractDto.idManager,
          pdf_document: createContractDto.pdfDocument,
          public_id: createContractDto.publicId,
          created_at: new Date(),
        },
      });

      await this.createCareerHistory({
        id_employee: contract.id_employee,
        type: 'contract_modification',
        description: `Contrato ${contract.id_contract} creado con tipo ${contract.contract_type}`,
      });

      return contract;
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async findAll(paginationDto: ContractPaginationDto) {
    try {
      const where: any = {
        ...(paginationDto.status && { status: paginationDto.status }),
        ...(paginationDto.contract_type && { contract_type: paginationDto.contract_type }),
        ...(paginationDto.id_employee && { id_employee: paginationDto.id_employee }),
        ...(paginationDto.id_manager && { id_manager: paginationDto.id_manager }),
        ...(paginationDto.startDate && { start_date: { gte: paginationDto.startDate } }),
        ...(paginationDto.endDate && { end_date: { lte: paginationDto.endDate } }),
        ...(paginationDto.search && {
          conditions: { contains: paginationDto.search },
        }),
      };

      const total = await this.prisma.contracts.count({ where });
      const currentPage = paginationDto.page;
      const perPage = paginationDto.limit;

      return {
        data: await this.prisma.contracts.findMany({
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
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async findOne(id: number) {
    try {
      const contract = await this.prisma.contracts.findUnique({
        where: { id_contract: id },
      });

      if (!contract) {
        throw new RpcException({
          status: HttpStatus.NOT_FOUND,
          message: `Contrato con id ${id} no encontrado`,
        });
      }

      return contract;
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getStats() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const in30Days = new Date(today);
      in30Days.setDate(in30Days.getDate() + 30);

      const [active, expiringSoon, renewed, expired, annulled] = await Promise.all([
        this.prisma.contracts.count({ where: { status: contract_status_enum.valid } }),
        this.prisma.contracts.count({
          where: {
            status: contract_status_enum.valid,
            end_date: { gte: today, lte: in30Days },
          },
        }),
        this.prisma.contracts.count({ where: { status: contract_status_enum.renewed } }),
        this.prisma.contracts.count({ where: { status: contract_status_enum.expired } }),
        this.prisma.contracts.count({ where: { status: contract_status_enum.annulled } }),
      ]);

      return {
        active,
        expiringSoon,
        renewed,
        expired,
        annulled,
        expiredOrAnnulled: expired + annulled,
      };
    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async update(id: number, updateContractDto: UpdateContractDto) {
    try {
      const contract = await this.findOne(id);

      if (NON_EDITABLE_STATUSES.includes(contract.status as any)) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: `Contract with status '${contract.status}' cannot be modified`,
        });
      }

      const { id: _, pdfDocument, contractStatus, contractType, startDate, endDate, idEmployee, idManager, conditions } = updateContractDto;

      const resolvedStart = startDate ?? contract.start_date;
      const resolvedEnd   = endDate   ?? contract.end_date;
      const resolvedEmployee = idEmployee ?? contract.id_employee;
      this.validateDateRange(resolvedStart, resolvedEnd);
      await this.validateNoActiveOverlap(resolvedEmployee, resolvedStart, resolvedEnd, id);

      const updated = await this.prisma.contracts.update({
        where: { id_contract: id },
        data: {
          ...(conditions    && { conditions }),
          ...(contractStatus && { status: contractStatus }),
          ...(contractType  && { contract_type: contractType }),
          ...(startDate     && { start_date: startDate }),
          ...(endDate       && { end_date: endDate }),
          ...(pdfDocument   && { pdf_document: pdfDocument }),
          ...(idEmployee    && { id_employee: idEmployee }),
          ...(idManager     && { id_manager: idManager }),
        },
      });

      if (this.hasContractChanges(contract, updated)) {
        await this.createCareerHistory({
          id_employee: updated.id_employee,
          type: 'contract_modification',
          description: `Contrato ${updated.id_contract} actualizado`,
        });
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

  async remove(id: number) {
    try {
      const contract = await this.findOne(id);

      if (contract.status === contract_status_enum.renewed) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Contract cannot be deleted because it has been renewed and is part of the employment history',
        });
      }

      if (contract.public_id) {
        cloudinary.uploader.destroy(contract.public_id).catch(error => {
          this.logger.error(`Failed to delete Cloudinary file: ${error.message}`);
        });
      }

      await this.prisma.contracts.delete({
        where: { id_contract: id },
      });

      return { message: 'Contract deleted successfully' };
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async renewContract(renewContractDto: RenewContractDto) {
    try {
      const contract = await this.findOne(renewContractDto.id);

      if (contract.status !== contract_status_enum.valid) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: `Only active contracts can be renewed. Current status: '${contract.status}'`,
        });
      }

      this.validateDateRange(contract.end_date, renewContractDto.newEndDate);

      const [, newContract] = await this.prisma.$transaction([
        this.prisma.contracts.update({
          where: { id_contract: contract.id_contract },
          data: { status: contract_status_enum.renewed },
        }),
        this.prisma.contracts.create({
          data: {
            conditions:    contract.conditions,
            contract_type: contract.contract_type,
            status:        contract_status_enum.valid,
            start_date:    contract.end_date,
            end_date:      renewContractDto.newEndDate,
            pdf_document:  contract.pdf_document,
            public_id:     contract.public_id,
            id_employee:   contract.id_employee,
            id_manager:    contract.id_manager,
            created_at:    new Date(),
          },
        }),
      ]);

      await this.createCareerHistory({
        id_employee: newContract.id_employee,
        type: 'contract_modification',
        description: `Contrato ${contract.id_contract} renovado hasta ${newContract.end_date.toISOString().slice(0, 10)}`,
      });

      return newContract;
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async findByEmployee(idEmployee: number, paginationDto: ContractPaginationDto) {
    try {
      const where: any = {
        id_employee: idEmployee,
        ...(paginationDto.status && { status: paginationDto.status }),
        ...(paginationDto.contract_type && { contract_type: paginationDto.contract_type }),
        ...(paginationDto.id_manager && { id_manager: paginationDto.id_manager }),
        ...(paginationDto.startDate && { start_date: { gte: paginationDto.startDate } }),
        ...(paginationDto.endDate && { end_date: { lte: paginationDto.endDate } }),
        ...(paginationDto.search && {
          conditions: { contains: paginationDto.search },
        }),
      };
      const currentPage = paginationDto.page ?? 1;
      const perPage = paginationDto.limit ?? 10;
      const total = await this.prisma.contracts.count({ where });

      return {
        data: await this.prisma.contracts.findMany({
          where,
          skip: (currentPage - 1) * perPage,
          take: perPage,
          orderBy: { start_date: 'asc' },
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

  private hasContractChanges(previous: any, updated: any): boolean {
    return previous.conditions !== updated.conditions
      || previous.contract_type !== updated.contract_type
      || previous.status !== updated.status
      || previous.pdf_document !== updated.pdf_document
      || previous.id_employee !== updated.id_employee
      || previous.id_manager !== updated.id_manager
      || previous.start_date.getTime() !== updated.start_date.getTime()
      || previous.end_date.getTime() !== updated.end_date.getTime();
  }

  private async createCareerHistory(payload: {
    id_employee: number;
    type: 'promotion' | 'transfer' | 'contract_modification' | 'salary_change' | 'evaluation';
    description: string;
  }) {
    await firstValueFrom(
      this.client.send(
        { cmd: 'createCareerHistory' },
        {
          ...payload,
          event_date: new Date(),
        },
      ),
    );
  }



  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async verifyContractStatus() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    // Mark expired contracts
    const { count: expiredCount } = await this.prisma.contracts.updateMany({
      where: {
        status: contract_status_enum.valid,
        end_date: { lt: today },
      },
      data: { status: contract_status_enum.expired },
    });

    if (expiredCount > 0) {
      this.logger.log(`${expiredCount} contract(s) marked as expired`);
    }

    // Notify expiring soon contracts
    const expiringContracts = await this.prisma.contracts.findMany({
      where: {
        status: contract_status_enum.valid,
        end_date: { gte: today, lte: in30Days },
        expires_soon_notified_at: null,
      },
    });

    if (expiringContracts.length === 0) return;

    this.logger.log(`${expiringContracts.length} contract(s) expiring within 30 days — sending alerts`);

    const allEmployeeIds = [...new Set([
      ...expiringContracts.map(c => c.id_employee),
      ...expiringContracts.map(c => c.id_manager),
    ])];

    const employees: any[] = await firstValueFrom(
      this.client.send({ cmd: 'findEmployeesByIds' }, allEmployeeIds),
    );

    const employeeMap = new Map(employees.map((e: any) => [e.id_employee, e]));
    const managerMap  = employeeMap;

    await Promise.allSettled(
      expiringContracts.map(async (contract) => {
        const employee = employeeMap.get(contract.id_employee);
        const manager  = managerMap.get(contract.id_manager);

        if (!employee || !manager) {
          this.logger.warn(`Skipping notification for contract ${contract.id_contract}: missing employee or manager data`);
          return;
        }

        const daysLeft = Math.ceil(
          (contract.end_date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );

        await this.emailService.sendEmail({
          type: 'CONTRACT_EXPIRES_SOON',
          params: {
            adminEmail:          manager.email,
            employeeEmail:       employee.email,
            employeeName:        `${employee.first_name} ${employee.last_name}`,
            startDate:           contract.start_date,
            endDate:             contract.end_date,
            daysLeft,
            contractType:        contract.contract_type,
            contractDescription: contract.conditions,
          },
        });

        await this.prisma.contracts.update({
          where: { id_contract: contract.id_contract },
          data: { expires_soon_notified_at: today },
        });

        this.logger.log(`Alert sent for contract ${contract.id_contract} — employee ${employee.first_name} ${employee.last_name} (${daysLeft} days left)`);
      }),
    );
  }
}
