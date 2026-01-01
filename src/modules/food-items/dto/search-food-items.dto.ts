import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { GetFoodItemsFilterDto, SortBy } from './get-food-items-filter.dto';

export enum SearchFilter {
  ALL = 'all',
  SAVED = 'saved',
  PREVIOUSLY_ORDERED = 'previously-ordered',
}

export class SearchFoodItemsDto extends GetFoodItemsFilterDto {
  @ApiProperty({
    description: 'Search query (searches name, description, tags)',
    example: 'jollof',
  })
  @IsNotEmpty()
  @IsString()
  q: string;

  @ApiPropertyOptional({
    description: 'Filter type',
    enum: SearchFilter,
    example: SearchFilter.ALL,
    default: SearchFilter.ALL,
  })
  @IsOptional()
  @IsEnum(SearchFilter)
  filter?: SearchFilter = SearchFilter.ALL;

  @ApiPropertyOptional({
    description: 'Sort field (defaults to relevance for search)',
    enum: SortBy,
    example: 'relevance',
    default: 'relevance',
  })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.RELEVANCE;
}
