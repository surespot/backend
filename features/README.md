# Features Documentation

This folder contains detailed API specifications and integration guides for backend features.

## Purpose

Each feature document provides:

- **Data schemas** - The exact data structure the frontend expects
- **API endpoints** - Complete endpoint specifications with request/response formats
- **Pagination & sorting** - How data should be ordered and paginated
- **Filtering options** - Available filters and their behavior
- **Error handling** - Expected error responses
- **Integration notes** - Frontend-specific considerations

## Current Features

- **[FoodItems-Catalog.md](./FoodItems-Catalog.md)** - Product listing, details, categories, and search APIs
- **[RIDER_WALLET_API_DOCUMENTATION.md](./RIDER_WALLET_API_DOCUMENTATION.md)** - Rider wallet balance, transactions, payment details, and withdrawals APIs

## How to Use

1. Backend developers should reference these documents when implementing APIs
2. Frontend developers can use these as a reference for expected API behavior
3. Both teams should update these documents as requirements evolve

## Document Structure

Each feature document follows this structure:

1. **Overview** - High-level description
2. **Data Schema** - Expected data structures
3. **API Endpoints** - Detailed endpoint specifications
4. **Pagination Guidelines** - How pagination works
5. **Display Order Logic** - How items should be sorted
6. **Error Handling** - Error response formats
7. **Additional Considerations** - Edge cases and special requirements
8. **Testing Checklist** - What to test

---

*These documents serve as the single source of truth for API contracts between frontend and backend.*
