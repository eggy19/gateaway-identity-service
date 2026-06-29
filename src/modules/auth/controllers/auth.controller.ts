import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CurrentSession,
  CurrentUser,
} from '../../../shared/auth/decorators/current-user.decorator';
import { Public } from '../../../shared/auth/decorators/public.decorator';
import { ResponseMessage } from '../../../shared/decorators/response-message.decorator';
import type { SessionInfo, SessionUser } from '../../../shared/auth/auth.types';
import { UserResponseDto } from '../../user/dto/user-response.dto';
import { UserMapper } from '../../user/mappers/user.mapper';
import { UserService } from '../../user/services/user.service';
import { LoginDto } from '../dto/login.dto';
import { SessionResponseDto } from '../dto/session-response.dto';
import { AuthService, LoginContext } from '../services/auth.service';

function extractContext(req: Request): LoginContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Login successful')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponseDto> {
    const user = await this.authService.login(dto, extractContext(req), res);
    const branchIds = await this.userService.findBranchIds(user.id);
    return UserMapper.toResponse(user, branchIds);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Logout successful')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ loggedOut: true }> {
    await this.authService.logout(req.headers, res);
    return { loggedOut: true };
  }

  @Get('me')
  async me(@CurrentUser() user: SessionUser): Promise<UserResponseDto> {
    const entity = await this.userService.findByIdOrThrow(user.id);
    const branchIds = await this.userService.findBranchIds(user.id);
    return UserMapper.toResponse(entity, branchIds);
  }

  @Get('session')
  getSession(@CurrentSession() session: SessionInfo): SessionResponseDto {
    return {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? null,
      createdAt: session.createdAt,
      current: true,
    };
  }

  @Delete('session/:id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Session revoked')
  async revokeSession(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ): Promise<{ revoked: true }> {
    await this.authService.revokeSession(id, user.id, req.headers);
    return { revoked: true };
  }
}
