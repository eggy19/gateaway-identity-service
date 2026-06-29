import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const buildContext = (): ExecutionContext =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  const buildHandler = (data: unknown): CallHandler => ({ handle: () => of(data) });

  it('wraps the payload in the success envelope with the default message', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const interceptor = new ResponseInterceptor(reflector);

    const result = await firstValueFrom(
      interceptor.intercept(buildContext(), buildHandler({ id: 1 })),
    );

    expect(result).toEqual({ success: true, message: 'Success', data: { id: 1 } });
  });

  it('uses the @ResponseMessage override when present', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('Created'),
    } as unknown as Reflector;
    const interceptor = new ResponseInterceptor(reflector);

    const result = await firstValueFrom(interceptor.intercept(buildContext(), buildHandler('ok')));

    expect(result).toEqual({ success: true, message: 'Created', data: 'ok' });
  });
});
