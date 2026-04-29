import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { NATS_SERVICE, envs } from '@/src/config';

@Module({
  imports: [
    ClientsModule.register([{
      name: NATS_SERVICE,
      transport: Transport.NATS,
      options: {
        servers: envs.natsServers,
        maxPayload: 20971520,
      }
    }])
  ],
  exports: [
    ClientsModule.register([{
      name: NATS_SERVICE,
      transport: Transport.NATS,
      options: {
        servers: envs.natsServers,
        maxPayload: 20971520,
      }
    }])
  ]
})
export class NatsModule {}
