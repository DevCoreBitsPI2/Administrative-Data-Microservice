import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ContractsService } from './contracts.service';
import { ContractPaginationDto, CreateContractDto, CreateContractWithPdfDto, RenewContractDto, UpdateContractDto } from './dto';

@Controller()
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @MessagePattern({ cmd: 'createContract' })
  async createContract(@Payload() payload: CreateContractWithPdfDto) {
    const buffer = Buffer.from(payload.bufferBase64, 'base64');

    const file = {
      fieldname: payload.fieldname || 'file',
      originalname: payload.originalname,
      encoding: payload.encoding || '7bit',
      mimetype: payload.mimetype,
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    const uploadedPdf = await this.contractsService.uploadFile(file);

    const contractData: CreateContractDto = {
      conditions: payload.conditions,
      contractStatus: payload.contractStatus,
      contractType: payload.contractType,
      startDate: payload.startDate,
      endDate: payload.endDate,
      pdfDocument: uploadedPdf.secure_url,
      publicId: uploadedPdf.public_id,
      idEmployee: payload.idEmployee,
      idManager: payload.idManager,
    };

    return this.contractsService.create(contractData);
  }

  @MessagePattern({ cmd: 'findAllContracts' })
  findAll(@Payload() paginationDto: ContractPaginationDto) {
    return this.contractsService.findAll(paginationDto);
  }

  @MessagePattern({ cmd: 'findOneContract' })
  findOne(@Payload() id: number) {
    return this.contractsService.findOne(id);
  }

  @MessagePattern({ cmd: 'getContractStats' })
  getStats() {
    return this.contractsService.getStats();
  }

  @MessagePattern({ cmd: 'updateContract' })
  update(@Payload() updateContractDto: UpdateContractDto) {
    return this.contractsService.update(updateContractDto.id, updateContractDto);
  }

  @MessagePattern({ cmd: 'removeContract' })
  remove(@Payload() id: number) {
    return this.contractsService.remove(id);
  }

  @MessagePattern({ cmd: 'renewContract' })
  renew(@Payload() renewContractDto: RenewContractDto) {
    return this.contractsService.renewContract(renewContractDto);
  }

  @MessagePattern({ cmd: 'findContractsByEmployee' })
  findByEmployee(@Payload() idEmployee: number) {
    return this.contractsService.findByEmployee(idEmployee);
  }
}
