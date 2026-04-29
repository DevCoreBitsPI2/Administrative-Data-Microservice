import { Module } from '@nestjs/common';
import { AreasService } from './areas.service';
import { AreasController } from './areas.controller';
import { NatsModule } from '@/src/transports/nats.module';
import { PrismaService } from '@/src/lib/prismaService/prisma';

@Module({
  controllers: [AreasController],
  providers: [AreasService, PrismaService],
  imports: [
    NatsModule
  ],
  exports: [AreasService]
})
export class AreasModule {}
