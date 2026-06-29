import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from '../../shared/decorators/response-message.decorator';
import { Public } from '../../shared/auth/decorators/public.decorator';

interface HealthStatus {
  readonly status: 'ok';
  readonly service: string;
  readonly timestamp: string;
}

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ResponseMessage('Service is healthy')
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'gateway-identity-service',
      timestamp: new Date().toISOString(),
    };
  }
}
