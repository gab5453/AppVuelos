import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CatalogService } from '../application/catalog.service.js';
import { SearchRequestDto } from './dto/search-request.dto.js';
import type { SearchResponseDto } from './dto/search-response.dto.js';
import { DeviceFingerprintGuard } from './guards/device-fingerprint.guard.js';
import { ForbidUnknownPropertiesGuard } from '../../../common/validation/forbid-unknown-properties.guard.js';
import { SearchRateLimit } from '../../../common/security/rate-limit.decorators.js';

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
