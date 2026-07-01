import { Global, Module } from '@nestjs/common';
import { InternalJwtService } from './internal-jwt.service';

@Global()
@Module({
  providers: [InternalJwtService],
  exports: [InternalJwtService],
})
export class InternalJwtModule {}
