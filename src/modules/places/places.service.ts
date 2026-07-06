import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

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

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  travelMode: 'BICYCLE' | 'TWO_WHEELER';
}

const PLACES_BASE = 'https://places.googleapis.com/v1';
const ROUTES_BASE = 'https://routes.googleapis.com/directions/v2:computeRoutes';

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(private readonly configService: ConfigService) {}

  private get apiKey(): string {
    return this.configService.get<string>('GOOGLE_PLACES_API_KEY') ?? '';
  }

  private ensureApiKey(): string {
    const key = this.apiKey.trim();
    if (!key) {
      this.logger.error('GOOGLE_PLACES_API_KEY is missing for Places API call');
      throw new BadGatewayException('Places service is not configured');
    }
    return key;
  }

  private handlePlacesError(error: unknown, operation: string): never {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const details =
        typeof error.response?.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response?.data ?? {});

      this.logger.error(
        `Google Places ${operation} failed with status ${status ?? 'unknown'}: ${details}`,
      );

      throw new BadGatewayException(
        status === 403
          ? 'Places API request was rejected by Google. Check API key restrictions, billing, and Places API enablement.'
          : 'Failed to fetch data from Places provider',
      );
    }

    throw error;
  }

  async autocomplete(input: string): Promise<AddressSuggestion[]> {
    if (!input.trim()) return [];

    try {
      const { data } = await axios.post(
        `${PLACES_BASE}/places:autocomplete`,
        {
          input,
          includedPrimaryTypes: ['street_address', 'route', 'premise'],
        },
        {
          headers: {
            'X-Goog-Api-Key': this.ensureApiKey(),
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
    } catch (error) {
      this.handlePlacesError(error, 'autocomplete');
    }
  }

  async getPlaceDetails(placeId: string): Promise<GeocodeResult | null> {
    try {
      const { data } = await axios.get(`${PLACES_BASE}/places/${placeId}`, {
        headers: {
          'X-Goog-Api-Key': this.ensureApiKey(),
          'X-Goog-FieldMask':
            'id,displayName,formattedAddress,location,addressComponents',
        },
      });

      if (!data.location) return null;

      return this.extractGeocodeResult(data);
    } catch (error) {
      this.handlePlacesError(error, 'details');
    }
  }

  async geocodeAddress(address: string): Promise<GeocodeResult | null> {
    try {
      const { data } = await axios.post(
        `${PLACES_BASE}/places:searchText`,
        { textQuery: address },
        {
          headers: {
            'X-Goog-Api-Key': this.ensureApiKey(),
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents',
          },
        },
      );

      if (!data.places?.length) return null;

      return this.extractGeocodeResult(data.places[0]);
    } catch (error) {
      this.handlePlacesError(error, 'searchText');
    }
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

  async getRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteResult | null> {
    const key = this.ensureApiKey();

    const callRoutes = async (
      travelMode: 'BICYCLE' | 'TWO_WHEELER',
    ): Promise<RouteResult | null> => {
      const body: Record<string, unknown> = {
        origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
        destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
        travelMode,
      };
      if (travelMode === 'TWO_WHEELER') {
        body.routingPreference = 'TRAFFIC_AWARE';
      }

      const { data } = await axios.post(ROUTES_BASE, body, {
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
        },
      });

      if (!data.routes?.length) return null;

      const route = data.routes[0];
      const durationSeconds = parseInt(
        String(route.duration).replace('s', ''),
        10,
      );
      return { distanceMeters: route.distanceMeters, durationSeconds, travelMode };
    };

    try {
      const bicycleResult = await callRoutes('BICYCLE');
      if (!bicycleResult) return null;

      if (bicycleResult.distanceMeters / 1000 > 5) {
        const motoResult = await callRoutes('TWO_WHEELER');
        return motoResult ?? bicycleResult;
      }

      return bicycleResult;
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.warn(
          `Routes API call failed (${error.response?.status ?? 'network'}): ${JSON.stringify(error.response?.data ?? {})}`,
        );
      } else {
        this.logger.warn(`Routes API unexpected error: ${String(error)}`);
      }
      return null;
    }
  }
}
