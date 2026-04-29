import { Module } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { PositionsController } from './positions.controller';
import { NatsModule } from '@/src/transports/nats.module';
import { PrismaService } from '@/src/lib/prismaService/prisma';
import { AreasModule } from '@/src/areas/areas.module';

@Module({
  controllers: [PositionsController],
  providers: [PositionsService, PrismaService],
  imports: [
    NatsModule,
    AreasModule
  ]
})
export class PositionsModule {}
