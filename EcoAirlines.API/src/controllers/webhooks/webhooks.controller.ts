import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { OAuth2AuthGuard } from '../../auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../auth/guards/scopes.guard.js';
import { Scopes } from '../../auth/decorators/scopes.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface.js';
import { WebhooksService } from '@ecoairlines/business/services/webhooks/webhooks.service.js';
import { WebhookSubscriptionRequestDto } from '@ecoairlines/business/dto/webhooks/webhook-subscription.dto.js';
import type { WebhookSubscriptionDto } from '@ecoairlines/business/dto/webhooks/webhook-subscription.dto.js';

@Controller('webhooks')
@UseGuards(OAuth2AuthGuard, ScopesGuard)
@Scopes('flights:webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<WebhookSubscriptionDto[]> {
    return this.webhooksService.list(user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: WebhookSubscriptionRequestDto,
  ): Promise<WebhookSubscriptionDto> {
    return this.webhooksService.create(user.sub, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.webhooksService.delete(user.sub, id);
  }
}
