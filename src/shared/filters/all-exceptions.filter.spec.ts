import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  let json: jest.Mock;
  let status: jest.Mock;
  let captured: Record<string, unknown>;

  const buildHost = (): ArgumentsHost => {
    captured = {};
    json = jest.fn((body: Record<string, unknown>) => {
      captured = body;
    });
    status = jest.fn(() => ({ json }));
    return {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/x', method: 'GET' }),
      }),
    } as unknown as ArgumentsHost;
  };

  it('maps a known HttpException to the error envelope', () => {
    filter.catch(new BadRequestException('bad input'), buildHost());

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'bad input',
        error: 'BadRequestException',
        path: '/api/v1/x',
      }),
    );
  });

  it('maps an unknown error to a generic 500 without leaking details', () => {
    filter.catch(new Error('db credentials leaked'), buildHost());

    expect(status).toHaveBeenCalledWith(500);
    expect(captured.message).toBe('Internal server error');
    expect(JSON.stringify(captured)).not.toContain('db credentials leaked');
  });
});
