import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { RoleModule } from '../role/role.module';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

@Module({
  imports: [HttpModule, RoleModule],
  controllers: [GatewayController],
  providers: [GatewayService],
})
export class GatewayModule {}
