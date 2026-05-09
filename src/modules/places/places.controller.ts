import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PlacesService } from './places.service';
import { AutocompleteDto } from './dto/autocomplete.dto';
import { GeocodeDto } from './dto/geocode.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('places')
@Controller('places')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Post('autocomplete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get address autocomplete suggestions' })
  @ApiResponse({ status: 200, description: 'Suggestions returned' })
  async autocomplete(@Body() dto: AutocompleteDto) {
    const suggestions = await this.placesService.autocomplete(dto.input);
    return { success: true, data: suggestions };
  }

  @Get('details/:placeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get full address details for a place ID' })
  @ApiResponse({ status: 200, description: 'Place details returned' })
  async getPlaceDetails(@Param('placeId') placeId: string) {
    const result = await this.placesService.getPlaceDetails(placeId);
    return { success: true, data: result };
  }

  @Post('geocode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Geocode a free-text address to coordinates' })
  @ApiResponse({ status: 200, description: 'Geocode result returned' })
  async geocode(@Body() dto: GeocodeDto) {
    const result = await this.placesService.geocodeAddress(dto.address);
    return { success: true, data: result };
  }
}
