import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { OAuth2AuthGuard } from '../../../common/auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../../common/auth/guards/scopes.guard.js';
import { Scopes } from '../../../common/auth/decorators/scopes.decorator.js';
import { CurrentUser } from '../../../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../common/auth/interfaces/authenticated-user.interface.js';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor.js';
import { HoldService } from '../application/hold.service.js';
import { HoldRequestDto } from './dto/hold-request.dto.js';
import type { HoldResponseDto, HoldStatusResponseDto } from './dto/hold-response.dto.js';

@Controller('offers/hold')
@UseGuards(OAuth2AuthGuard, ScopesGuard)
export class HoldController {
  constructor(private readonly holdService: HoldService) {}

  @Post()
  @Scopes('flights:hold')
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  createHold(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: HoldRequestDto,
  ): Promise<HoldResponseDto> {
    return this.holdService.createHold(user.sub, body);
  }

  @Get(':holdId')
  @Scopes('flights:read')
  getHoldStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('holdId', new ParseUUIDPipe()) holdId: string,
  ): Promise<HoldStatusResponseDto> {
    return this.holdService.getHoldStatus(user.sub, holdId);
  }

  @Delete(':holdId')
  @Scopes('flights:hold')
  @HttpCode(HttpStatus.NO_CONTENT)
  releaseHold(
    @CurrentUser() user: AuthenticatedUser,
    @Param('holdId', new ParseUUIDPipe()) holdId: string,
  ): Promise<void> {
    return this.holdService.releaseHold(user.sub, holdId);
  }
}
