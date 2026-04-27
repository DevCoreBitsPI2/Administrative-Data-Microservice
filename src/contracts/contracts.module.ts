import { Module } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { NatsModule } from 'src/transports/nats.module';
import { PrismaService } from 'src/lib/prismaService/prisma';
import { CloudinaryProvider } from 'src/lib/imageProvider/cloudinary.provider';
import { EmailService } from 'src/lib/email/email';

@Module({
  controllers: [ContractsController],
  providers: [ContractsService, PrismaService, CloudinaryProvider, EmailService],
  imports: [NatsModule],
})
export class ContractsModule {}
