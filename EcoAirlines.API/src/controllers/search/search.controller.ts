import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CatalogService } from '@ecoairlines/business/services/search/catalog.service.js';
import { SearchRequestDto } from '@ecoairlines/business/dto/search/search-request.dto.js';
import type { SearchResponseDto } from '@ecoairlines/business/dto/search/search-response.dto.js';
import { DeviceFingerprintGuard } from './device-fingerprint.guard.js';
import { ForbidUnknownPropertiesGuard } from '../../guards/forbid-unknown-properties.guard.js';
import { SearchRateLimit } from '../../security/rate-limit.decorators.js';

const SEARCH_REQUEST_KEYS = ['itineraries', 'passengers'] as const;

@Controller('search')
export class SearchController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @UseGuards(DeviceFingerprintGuard, new ForbidUnknownPropertiesGuard({ root: SEARCH_REQUEST_KEYS }))
  @SearchRateLimit()
  @HttpCode(HttpStatus.OK)
  search(@Body() body: SearchRequestDto): Promise<SearchResponseDto> {
    return this.catalogService.search(body);
  }
}
