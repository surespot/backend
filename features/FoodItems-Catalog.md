# Food Items & Catalog API - Backend Integration Guide

## Overview

This document specifies the API requirements for the Food Items & Catalog feature. The frontend needs endpoints to fetch products, categories, search functionality, and product details with proper pagination, filtering, and sorting.

---

## Data Schema

The frontend expects the following data structure for food items:

### FoodItem Response Schema

```typescript
{
  id: string;                    // Unique identifier (MongoDB ObjectId as string)
  name: string;                  // Product name (e.g., "Jollof Rice")
  description: string;           // Product description
  slug: string;                  // URL-friendly identifier
  price: number;                 // Price in smallest currency unit (kobo for NGN)
  formattedPrice: string;        // Formatted price string (e.g., "₦1,500")
  currency: string;              // Currency code (e.g., "NGN")
  imageUrl: string;              // Main product image URL
  imageUrls?: string[];          // Additional image URLs
  category: string;              // Category name: "Food" | "Protein" | "Side Meal" | "Drinks" | "Economy"
  tags: string[];                // Array of tags (e.g., ["RICE", "CHICKEN", "SPICY"])
  averageRating: number;         // Average rating (0-5)
  ratingCount: number;           // Number of ratings
  estimatedTime: {               // Preparation time range
    min: number;                  // Minimum minutes
    max: number;                  // Maximum minutes
  };
  eta: string;                   // Formatted ETA string (e.g., "20-25 mins")
  isAvailable: boolean;          // Whether item is currently available
  isActive: boolean;             // Whether item is active/published
  extras?: FoodExtra[];          // Available extras for this item (populated)
  relatedItems?: FoodItem[];     // Related items (for "People Also Order")
  viewCount?: number;            // Number of views
  orderCount?: number;           // Number of orders
  isPopular?: boolean;           // Whether marked as popular
  createdAt: string;             // ISO date string
  updatedAt: string;            // ISO date string
}
```

### FoodExtra Schema (for extras array)

```typescript
{
  id: string;                    // Unique identifier
  name: string;                  // Extra name (e.g., "Chicken", "Pepsi")
  description?: string;           // Optional description
  price: number;                 // Price in smallest currency unit
  formattedPrice: string;         // Formatted price (e.g., "₦500" or "Free")
  currency: string;              // Currency code
  isAvailable: boolean;          // Whether extra is available
  category?: string;             // Optional category (e.g., "Protein", "Sauce")
}
```

---

## API Endpoints

### Base URL
```
Development: http://localhost:3000
Production: https://api.surespot.app/v1
```

### Authentication
All endpoints require authentication. Include the access token in the Authorization header:
```
Authorization: Bearer {accessToken}
```

---

## 1. Product Listing API

**Endpoint:** `GET /food-items`

**Description:** Fetch a paginated list of food items with optional filtering and sorting.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number (1-indexed) |
| `limit` | number | No | 20 | Items per page (max: 50) |
| `category` | string | No | - | Filter by category: "Food", "Protein", "Side Meal", "Drinks", "Economy" |
| `tags` | string | No | - | Comma-separated tags to filter by (e.g., "RICE,CHICKEN") |
| `minPrice` | number | No | - | Minimum price filter (in kobo) |
| `maxPrice` | number | No | - | Maximum price filter (in kobo) |
| `minRating` | number | No | - | Minimum average rating (0-5) |
| `isAvailable` | boolean | No | true | Filter by availability |
| `isPopular` | boolean | No | - | Filter popular items only |
| `sortBy` | string | No | "default" | Sort field: "default", "price", "rating", "popularity", "newest", "name" |
| `sortOrder` | string | No | "asc" | Sort order: "asc" or "desc" |
| `search` | string | No | - | Search query (searches name, description, tags) |

### Display Order Considerations

**Default Sort (`sortBy=default`):**
1. Items marked as `isPopular: true` first
2. Then by `sortOrder` field (ascending) if set
3. Then by `orderCount` (descending) - most ordered first
4. Then by `createdAt` (descending) - newest first

**Popular Items:**
- When `isPopular=true` filter is used, return items with `isPopular: true`
- Sort by `orderCount` descending, then by `averageRating` descending

**Category Pages:**
- Filter by `category` parameter
- Sort by `sortOrder` if available, otherwise by `orderCount` descending

**Home Screen Sections:**
- **Popular Items**: `isPopular=true`, sorted by `orderCount` descending
- **Quick Bites**: Category-specific items, sorted by `estimatedTime.min` ascending (fastest first)

### Response Format

```typescript
{
  success: boolean;
  data: {
    items: FoodItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;           // Total number of items matching filters
      totalPages: number;      // Total number of pages
      hasNext: boolean;       // Whether there's a next page
      hasPrev: boolean;       // Whether there's a previous page
    };
  };
  message?: string;
}
```

### Example Request

```
GET /food-items?page=1&limit=20&category=Food&sortBy=popularity&sortOrder=desc
```

### Example Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "name": "Jollof Rice",
        "description": "Smoky jollof with grilled chicken wing spiced with local spices.",
        "slug": "jollof-rice",
        "price": 150000,
        "formattedPrice": "₦1,500",
        "currency": "NGN",
        "imageUrl": "https://cdn.surespot.app/images/jollof-rice.jpg",
        "imageUrls": ["https://cdn.surespot.app/images/jollof-rice-2.jpg"],
        "category": "Food",
        "tags": ["RICE", "CHICKEN", "JOLLOF", "SPICY"],
        "averageRating": 4.8,
        "ratingCount": 245,
        "estimatedTime": {
          "min": 20,
          "max": 25
        },
        "eta": "20-25 mins",
        "isAvailable": true,
        "isActive": true,
        "extras": [
          {
            "id": "507f1f77bcf86cd799439012",
            "name": "Extra chicken",
            "description": "Additional grilled chicken pieces",
            "price": 50000,
            "formattedPrice": "₦500",
            "currency": "NGN",
            "isAvailable": true,
            "category": "Protein"
          }
        ],
        "viewCount": 1250,
        "orderCount": 89,
        "isPopular": true,
        "createdAt": "2024-01-15T10:00:00.000Z",
        "updatedAt": "2024-01-20T14:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### Error Responses

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameters",
    "details": {
      "page": "Page must be a positive integer",
      "limit": "Limit must be between 1 and 50"
    }
  }
}
```

---

## 2. Product Details API

**Endpoint:** `GET /food-items/:id`

**Description:** Fetch detailed information about a specific food item, including populated extras and related items.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Food item ID (slug or ObjectId) |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `includeExtras` | boolean | No | true | Include populated extras array |
| `includeRelated` | boolean | No | true | Include related items (for "People Also Order") |
| `relatedLimit` | number | No | 3 | Number of related items to return |

### Response Format

```typescript
{
  success: boolean;
  data: FoodItem;  // Full FoodItem with populated extras and relatedItems
  message?: string;
}
```

### Example Request

```
GET /food-items/507f1f77bcf86cd799439011?includeExtras=true&includeRelated=true&relatedLimit=3
```

### Example Response

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Jollof Rice",
    "description": "Smoky jollof with grilled chicken wing spiced with local spices.",
    "slug": "jollof-rice",
    "price": 150000,
    "formattedPrice": "₦1,500",
    "currency": "NGN",
    "imageUrl": "https://cdn.surespot.app/images/jollof-rice.jpg",
    "imageUrls": [
      "https://cdn.surespot.app/images/jollof-rice-2.jpg",
      "https://cdn.surespot.app/images/jollof-rice-3.jpg"
    ],
    "category": "Food",
    "tags": ["RICE", "CHICKEN", "JOLLOF", "SPICY"],
    "averageRating": 4.8,
    "ratingCount": 245,
    "estimatedTime": {
      "min": 20,
      "max": 25
    },
    "eta": "20-25 mins",
    "isAvailable": true,
    "isActive": true,
    "extras": [
      {
        "id": "507f1f77bcf86cd799439012",
        "name": "Extra chicken",
        "description": "Additional grilled chicken pieces",
        "price": 50000,
        "formattedPrice": "₦500",
        "currency": "NGN",
        "isAvailable": true,
        "category": "Protein"
      },
      {
        "id": "507f1f77bcf86cd799439013",
        "name": "Extra sauce",
        "description": "Additional spicy sauce",
        "price": 0,
        "formattedPrice": "Free",
        "currency": "NGN",
        "isAvailable": true,
        "category": "Sauce"
      }
    ],
    "relatedItems": [
      {
        "id": "507f1f77bcf86cd799439014",
        "name": "Fried Rice",
        "description": "Mixed vegetables fried rice with chicken",
        "slug": "fried-rice",
        "price": 160000,
        "formattedPrice": "₦1,600",
        "currency": "NGN",
        "imageUrl": "https://cdn.surespot.app/images/fried-rice.jpg",
        "category": "Food",
        "tags": ["RICE", "CHICKEN", "VEGETABLES"],
        "averageRating": 4.7,
        "ratingCount": 189,
        "estimatedTime": {
          "min": 20,
          "max": 25
        },
        "eta": "20-25 mins",
        "isAvailable": true
      }
    ],
    "viewCount": 1250,
    "orderCount": 89,
    "isPopular": true,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-20T14:30:00.000Z"
  }
}
```

### Error Responses

```json
{
  "success": false,
  "error": {
    "code": "FOOD_ITEM_NOT_FOUND",
    "message": "Food item not found"
  }
}
```

---

## 3. Categories API

**Endpoint:** `GET /categories`

**Description:** Fetch list of available food categories with optional metadata.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `includeCount` | boolean | No | false | Include item count per category |
| `includeImage` | boolean | No | false | Include category image URL |

### Response Format

```typescript
{
  success: boolean;
  data: {
    categories: Category[];
  };
  message?: string;
}

type Category = {
  name: string;                  // "Food" | "Protein" | "Side Meal" | "Drinks" | "Economy"
  slug: string;                  // URL-friendly identifier
  displayName: string;           // Display name (may differ from name)
  description?: string;           // Category description
  imageUrl?: string;             // Category image URL (if includeImage=true)
  itemCount?: number;            // Number of active items in category (if includeCount=true)
  sortOrder?: number;           // Display order
};
```

### Example Request

```
GET /categories?includeCount=true&includeImage=true
```

### Example Response

```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "name": "Food",
        "slug": "food",
        "displayName": "Food",
        "description": "Main dishes and meals",
        "imageUrl": "https://cdn.surespot.app/categories/food.png",
        "itemCount": 25,
        "sortOrder": 1
      },
      {
        "name": "Protein",
        "slug": "protein",
        "displayName": "Protein",
        "description": "Protein-rich dishes",
        "imageUrl": "https://cdn.surespot.app/categories/protein.png",
        "itemCount": 15,
        "sortOrder": 2
      },
      {
        "name": "Side Meal",
        "slug": "side-meal",
        "displayName": "Side Meal",
        "description": "Side dishes and accompaniments",
        "imageUrl": "https://cdn.surespot.app/categories/sidemeal.png",
        "itemCount": 12,
        "sortOrder": 3
      },
      {
        "name": "Drinks",
        "slug": "drinks",
        "displayName": "Drinks",
        "description": "Beverages and drinks",
        "imageUrl": "https://cdn.surespot.app/categories/drinks.png",
        "itemCount": 18,
        "sortOrder": 4
      },
      {
        "name": "Economy",
        "slug": "economy",
        "displayName": "Economy",
        "description": "Budget-friendly options",
        "imageUrl": "https://cdn.surespot.app/categories/economy.png",
        "itemCount": 20,
        "sortOrder": 5
      }
    ]
  }
}
```

---

## 4. Search API

**Endpoint:** `GET /food-items/search`

**Description:** Search food items by query string with advanced filtering options.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query (searches name, description, tags) |
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 20 | Items per page (max: 50) |
| `category` | string | No | - | Filter by category |
| `tags` | string | No | - | Comma-separated tags |
| `minPrice` | number | No | - | Minimum price (in kobo) |
| `maxPrice` | number | No | - | Maximum price (in kobo) |
| `minRating` | number | No | - | Minimum rating |
| `filter` | string | No | "all" | Filter type: "all", "saved", "previously-ordered" |
| `sortBy` | string | No | "relevance" | Sort: "relevance", "price", "rating", "popularity", "newest" |
| `sortOrder` | string | No | "desc" | Sort order: "asc" or "desc" |

### Special Filter Options

**`filter=saved`:**
- Return only items that the authenticated user has saved (requires user context)
- Must check user's saved items list

**`filter=previously-ordered`:**
- Return only items the user has previously ordered (requires user context)
- Must check user's order history

### Response Format

Same as Product Listing API response format.

### Example Request

```
GET /food-items/search?q=jollof&category=Food&filter=all&sortBy=relevance&page=1&limit=20
```

### Example Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "name": "Jollof Rice",
        "description": "Smoky jollof with grilled chicken",
        "slug": "jollof-rice",
        "price": 150000,
        "formattedPrice": "₦1,500",
        "currency": "NGN",
        "imageUrl": "https://cdn.surespot.app/images/jollof-rice.jpg",
        "category": "Food",
        "tags": ["RICE", "CHICKEN", "JOLLOF", "SPICY"],
        "averageRating": 4.8,
        "ratingCount": 245,
        "estimatedTime": {
          "min": 20,
          "max": 25
        },
        "eta": "20-25 mins",
        "isAvailable": true,
        "isActive": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

---

## Pagination Guidelines

### Default Pagination
- **Default page size**: 20 items
- **Maximum page size**: 50 items
- **Page numbering**: 1-indexed (first page is 1, not 0)

### Pagination Response
Always include pagination metadata in list responses:
```typescript
{
  page: number;           // Current page number
  limit: number;          // Items per page
  total: number;          // Total matching items
  totalPages: number;     // Total pages (Math.ceil(total / limit))
  hasNext: boolean;       // Whether there's a next page
  hasPrev: boolean;       // Whether there's a previous page
}
```

### Performance Considerations
- Use database indexes for common queries (category, isActive, isAvailable, isPopular)
- Implement cursor-based pagination for very large datasets (optional optimization)
- Cache popular queries (home page popular items, categories)

---

## Display Order Logic

### Home Screen - Popular Items
- Filter: `isPopular=true`
- Sort: `orderCount DESC, averageRating DESC`
- Limit: 5-10 items (frontend will slice)

### Home Screen - Quick Bites
- Filter: Category-specific items
- Sort: `estimatedTime.min ASC` (fastest preparation time first)
- Limit: 5-10 items

### Category Pages
- Filter: `category={categoryName}`
- Sort: `sortOrder ASC` (if available), then `orderCount DESC`
- Pagination: Full pagination support

### Search Results
- Sort by relevance first (if `sortBy=relevance`)
- Then apply secondary sort (price, rating, etc.)
- Relevance scoring should consider:
  - Exact name match (highest)
  - Name contains query (high)
  - Description contains query (medium)
  - Tags contain query (medium)
  - Partial matches (low)

---

## Error Handling

### Standard Error Response Format

```typescript
{
  success: false;
  error: {
    code: string;              // Error code (e.g., "VALIDATION_ERROR", "NOT_FOUND")
    message: string;           // Human-readable error message
    details?: Record<string, unknown>;  // Additional error details
  };
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid query parameters |
| `NOT_FOUND` | 404 | Resource not found |
| `FOOD_ITEM_NOT_FOUND` | 404 | Food item not found |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Additional Considerations

### Price Formatting
- Prices are stored in smallest currency unit (kobo for NGN)
- Always return both `price` (number) and `formattedPrice` (string)
- Format: `₦${(price / 100).toLocaleString('en-NG')}`
- Example: `150000` → `"₦1,500"`

### ETA Formatting
- Store `estimatedTime` as `{ min: number, max: number }`
- Return formatted `eta` string: `"${min}-${max} mins"`
- Example: `{ min: 20, max: 25 }` → `"20-25 mins"`

### Image URLs
- Always return absolute URLs (not relative paths)
- Support CDN URLs for better performance
- Include fallback/default image if item has no image

### Extras Population
- When `includeExtras=true`, populate the `extras` array with full FoodExtra objects
- Only include extras where `isAvailable=true` and `isActive=true`
- Sort extras by `sortOrder` if available, otherwise by name

### Related Items
- Return items from same category or with similar tags
- Exclude the current item from related items
- Limit to 3-5 items for "People Also Order" section
- Sort by `orderCount DESC` or `averageRating DESC`

### User-Specific Filters
- `filter=saved`: Requires user authentication
- `filter=previously-ordered`: Requires user authentication and order history access
- Return empty array if user has no saved/ordered items (don't error)

### Caching Recommendations
- Cache popular items queries (TTL: 5-10 minutes)
- Cache category lists (TTL: 1 hour)
- Cache individual product details (TTL: 5 minutes)
- Invalidate cache on product updates

---

## Testing Checklist

- [ ] Product listing with pagination
- [ ] Product listing with category filter
- [ ] Product listing with price range filter
- [ ] Product listing with rating filter
- [ ] Product listing with search query
- [ ] Product listing with sorting options
- [ ] Product details by ID
- [ ] Product details by slug
- [ ] Product details with populated extras
- [ ] Product details with related items
- [ ] Categories list
- [ ] Categories with item counts
- [ ] Search with query string
- [ ] Search with filters (saved, previously-ordered)
- [ ] Search with multiple filters combined
- [ ] Empty results handling
- [ ] Error handling (404, 400, 500)
- [ ] Authentication required endpoints
- [ ] Pagination edge cases (last page, empty pages)

---

## Frontend Integration Notes

The frontend will:
1. Call these endpoints using `authenticatedFetch` from `src/services/apiClient.ts`
2. Transform responses to match existing frontend types
3. Handle pagination with "Load More" or infinite scroll
4. Cache responses locally for offline support
5. Update view counts when items are viewed (separate endpoint if needed)

---

*Last updated: Based on codebase analysis and frontend requirements*
