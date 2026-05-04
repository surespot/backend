import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface GeocodeResult {
  address: string;
  coordinates: { latitude: number; longitude: number };
  state?: string;
  country?: string;
}

export interface AddressSuggestion {
  description: string;
  placeId: string;
}

const PLACES_BASE = 'https://places.googleapis.com/v1';

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(private readonly configService: ConfigService) {}

  private get apiKey(): string {
    return this.configService.get<string>('GOOGLE_PLACES_API_KEY') ?? '';
  }

  async autocomplete(input: string): Promise<AddressSuggestion[]> {
    if (!input.trim()) return [];

    const { data } = await axios.post(
      `${PLACES_BASE}/places:autocomplete`,
      {
        input,
        includedPrimaryTypes: ['street_address', 'route', 'premise'],
      },
      {
        headers: {
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask':
            'suggestions.placePrediction.placeId,suggestions.placePrediction.text',
        },
      },
    );

    if (!data.suggestions?.length) return [];

    return data.suggestions
      .filter((s: any) => s.placePrediction)
      .map((s: any) => ({
        description: s.placePrediction.text.text,
        placeId: s.placePrediction.placeId,
      }));
  }

  async getPlaceDetails(placeId: string): Promise<GeocodeResult | null> {
    const { data } = await axios.get(`${PLACES_BASE}/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask':
          'id,displayName,formattedAddress,location,addressComponents',
      },
    });

    if (!data.location) return null;

    return this.extractGeocodeResult(data);
  }

  async geocodeAddress(address: string): Promise<GeocodeResult | null> {
    const { data } = await axios.post(
      `${PLACES_BASE}/places:searchText`,
      { textQuery: address },
      {
        headers: {
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents',
        },
      },
    );

    if (!data.places?.length) return null;

    return this.extractGeocodeResult(data.places[0]);
  }

  private extractGeocodeResult(place: any): GeocodeResult {
    let state: string | undefined;
    let country: string | undefined;

    for (const component of place.addressComponents ?? []) {
      if (component.types?.includes('administrative_area_level_1')) {
        state = component.longText;
      }
      if (component.types?.includes('country')) {
        country = component.longText;
      }
    }

    return {
      address: place.formattedAddress,
      coordinates: {
        latitude: place.location.latitude,
        longitude: place.location.longitude,
      },
      state,
      country,
    };
  }
}
