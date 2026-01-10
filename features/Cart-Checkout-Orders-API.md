# Cart, Checkout & Orders API - Backend Integration Guide

## Overview

This document specifies the API requirements for the Cart, Checkout, and Orders features. The frontend needs endpoints to manage cart items, validate promo codes, place orders, track order status, and retrieve order history with proper data structures, validation, and error handling.

---

## Data Schema

The frontend expects the following data structures for cart items, orders, and related entities.

### CartItem Response Schema

```typescript
{
  id: string;                    // Unique identifier (MongoDB ObjectId as string)
  foodItemId: string;            // Reference to FoodItem
  name: string;                  // Product name (e.g., "Jollof Rice")
  description: string;           // Product description
  slug: string;                  // URL-friendly identifier
  price: number;                 // Price in smallest currency unit (kobo for NGN)
  formattedPrice: string;        // Formatted price string (e.g., "₦1,500")
  currency: string;              // Currency code (e.g., "NGN")
  imageUrl: string;             // Product image URL
  quantity: number;              // Quantity in cart (min: 1, max: 99)
  extras?: CartExtra[];          // Selected extras for this cart item
  subtotal: number;              // Item price * quantity (in kobo)
  extrasTotal: number;           // Total price of all extras (in kobo)
  lineTotal: number;             // subtotal + extrasTotal (in kobo)
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
}
```

### CartExtra Schema (for extras array)

```typescript
{
  id: string;                    // Unique identifier (MongoDB ObjectId as string)
  foodExtraId: string;           // Reference to FoodExtra
  name: string;                  // Extra name (e.g., "Extra chicken")
  description?: string;          // Optional description
  price: number;                 // Price in smallest currency unit
  formattedPrice: string;         // Formatted price (e.g., "₦500" or "Free")
  currency: string;              // Currency code
  quantity: number;              // Quantity of this extra (usually 1)
}
```

### Cart Response Schema

```typescript
{
  id: string;                    // Cart ID (user-specific)
  userId: string;                // User ID
  items: CartItem[];             // Array of cart items
  subtotal: number;              // Sum of all line totals (in kobo)
  extrasTotal: number;           // Sum of all extras (in kobo)
  discountAmount: number;         // Discount from promo code (in kobo)
  discountPercent?: number;      // Discount percentage (if promo applied)
  promoCode?: string;            // Applied promo code
  total: number;                 // Final total (subtotal + extras - discount) (in kobo)
  formattedTotal: string;        // Formatted total (e.g., "₦8,300")
  itemCount: number;             // Total number of items (sum of quantities)
  extrasCount: number;           // Total number of extras
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
}
```

### Order Response Schema

```typescript
{
  id: string;                    // Unique order identifier (MongoDB ObjectId as string)
  orderNumber: string;           // Human-readable order number (e.g., "ORD-2024-001234")
  userId: string;                // User ID
  status: OrderStatus;           // Order status: "pending" | "confirmed" | "preparing" | "ready" | "out-for-delivery" | "delivered" | "cancelled"
  deliveryType: DeliveryType;     // "door-delivery" | "pickup"
  items: OrderItem[];            // Array of ordered items
  subtotal: number;              // Sum of all item prices (in kobo)
  extrasTotal: number;           // Sum of all extras (in kobo)
  deliveryFee: number;            // Delivery fee (in kobo, 0 for pickup)
  discountAmount: number;         // Discount from promo code (in kobo)
  discountPercent?: number;      // Discount percentage (if promo applied)
  promoCode?: string;            // Applied promo code
  total: number;                 // Final total (in kobo)
  formattedTotal: string;        // Formatted total (e.g., "₦8,300")
  itemCount: number;             // Total number of items
  extrasCount: number;           // Total number of extras
  deliveryAddress?: DeliveryAddress;  // Delivery address (for door-delivery)
  pickupLocation?: PickupLocation;    // Pickup location (for pickup)
  estimatedDeliveryTime?: string;     // Estimated delivery time (ISO date string)
  estimatedPreparationTime?: number;   // Estimated preparation time in minutes
  paymentStatus: PaymentStatus;   // "pending" | "paid" | "failed" | "refunded"
  paymentMethod?: string;        // Payment method (e.g., "card", "cash", "wallet")
  createdAt: string;             // ISO date string (order placed time)
  updatedAt: string;             // ISO date string (last update)
  deliveredAt?: string;          // ISO date string (when delivered)
  cancelledAt?: string;          // ISO date string (when cancelled)
  cancellationReason?: string;    // Reason for cancellation (if cancelled)
}
```

### OrderItem Schema

```typescript
{
  id: string;                    // Unique identifier
  foodItemId: string;            // Reference to FoodItem
  name: string;                  // Product name
  description: string;           // Product description
  slug: string;                  // URL-friendly identifier
  price: number;                 // Unit price (in kobo)
  formattedPrice: string;        // Formatted price
  currency: string;              // Currency code
  imageUrl: string;              // Product image URL
  quantity: number;              // Quantity ordered
  extras?: OrderExtra[];         // Selected extras
  lineTotal: number;             // (price * quantity) + extras total (in kobo)
}
```

### OrderExtra Schema

```typescript
{
  id: string;                    // Unique identifier
  foodExtraId: string;           // Reference to FoodExtra
  name: string;                  // Extra name
  price: number;                 // Price (in kobo)
  formattedPrice: string;         // Formatted price
  quantity: number;              // Quantity (usually 1)
}
```

### DeliveryAddress Schema

```typescript
{
  id: string;                    // Saved location ID (if from saved locations)
  address: string;                // Full address string
  street?: string;               // Street address
  city?: string;                 // City
  state?: string;                // State
  country: string;                // Country (default: "Nigeria")
  postalCode?: string;           // Postal/ZIP code
  coordinates?: {                 // GPS coordinates
    latitude: number;
    longitude: number;
  };
  instructions?: string;          // Delivery instructions
  contactPhone?: string;          // Contact phone for delivery
}
```

### PickupLocation Schema

```typescript
{
  id: string;                    // Pickup location ID
  name: string;                  // Location name (e.g., "Surespot, Iba, Ojo")
  address: string;                // Full address
  region?: string;               // Region/area
  coordinates?: {                 // GPS coordinates
    latitude: number;
    longitude: number;
  };
}
```

### OrderStatus Type

```typescript
type OrderStatus = 
  | "pending"           // Order placed, awaiting confirmation
  | "confirmed"        // Order confirmed by restaurant
  | "preparing"        // Order being prepared
  | "ready"            // Order ready (for pickup) or ready for delivery
  | "out-for-delivery" // Order out for delivery (door-delivery only)
  | "delivered"        // Order delivered
  | "cancelled";       // Order cancelled
```

### DeliveryType Type

```typescript
type DeliveryType = "door-delivery" | "pickup";
```

### PaymentStatus Type

```typescript
type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
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

## 1. Cart Management API

### 1.1 Get Cart

**Endpoint:** `GET /cart`

**Description:** Retrieve the current user's cart with all items and calculated totals.

**Response Format:**

```typescript
{
  success: boolean;
  data: Cart;
  message?: string;
}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439012",
    "items": [
      {
        "id": "507f1f77bcf86cd799439013",
        "foodItemId": "507f1f77bcf86cd799439014",
        "name": "Jollof Rice",
        "description": "Smoky jollof with grilled chicken wing spiced with local spices.",
        "slug": "jollof-rice",
        "price": 150000,
        "formattedPrice": "₦1,500",
        "currency": "NGN",
        "imageUrl": "https://cdn.surespot.app/images/jollof-rice.jpg",
        "quantity": 2,
        "extras": [
          {
            "id": "507f1f77bcf86cd799439015",
            "foodExtraId": "507f1f77bcf86cd799439016",
            "name": "Extra chicken",
            "description": "Additional grilled chicken pieces",
            "price": 50000,
            "formattedPrice": "₦500",
            "currency": "NGN",
            "quantity": 1
          }
        ],
        "subtotal": 300000,
        "extrasTotal": 50000,
        "lineTotal": 350000,
        "createdAt": "2024-01-15T10:00:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "subtotal": 300000,
    "extrasTotal": 50000,
    "discountAmount": 0,
    "total": 350000,
    "formattedTotal": "₦3,500",
    "itemCount": 2,
    "extrasCount": 1,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Responses:**

- `404 NOT_FOUND`: Cart not found (should create empty cart)
- `401 UNAUTHORIZED`: Authentication required

---

### 1.2 Add Item to Cart

**Endpoint:** `POST /cart/items`

**Description:** Add a food item to the cart. If the item already exists (same foodItemId and same extras), increment quantity. Otherwise, add as new item.

**Request Body:**

```typescript
{
  foodItemId: string;            // Required: Food item ID
  quantity?: number;            // Optional: Quantity (default: 1, min: 1, max: 99)
  extras?: Array<{              // Optional: Selected extras
    foodExtraId: string;         // Extra ID
    quantity?: number;          // Optional: Quantity (default: 1)
  }>;
}
```

**Response Format:**

```typescript
{
  success: boolean;
  data: Cart;                   // Updated cart
  message?: string;
}
```

**Example Request:**

```json
{
  "foodItemId": "507f1f77bcf86cd799439014",
  "quantity": 1,
  "extras": [
    {
      "foodExtraId": "507f1f77bcf86cd799439016",
      "quantity": 1
    }
  ]
}
```

**Validation Rules:**

- `foodItemId` must exist and be active
- `quantity` must be between 1 and 99
- All `foodExtraId` values must exist and be available for the food item
- If item already exists with same extras, increment quantity instead of creating duplicate

**Error Responses:**

- `400 VALIDATION_ERROR`: Invalid request body
- `404 FOOD_ITEM_NOT_FOUND`: Food item not found
- `400 EXTRA_NOT_AVAILABLE`: Extra not available for this food item
- `400 ITEM_NOT_AVAILABLE`: Food item is not available
- `401 UNAUTHORIZED`: Authentication required

---

### 1.3 Update Cart Item Quantity

**Endpoint:** `PATCH /cart/items/:itemId`

**Description:** Update the quantity of a cart item. If quantity is 0, remove the item.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `itemId` | string | Yes | Cart item ID |

**Request Body:**

```typescript
{
  quantity: number;             // Required: New quantity (min: 0, max: 99)
}
```

**Response Format:**

```typescript
{
  success: boolean;
  data: Cart;                   // Updated cart
  message?: string;
}
```

**Example Request:**

```json
{
  "quantity": 3
}
```

**Validation Rules:**

- `quantity` must be between 0 and 99
- If `quantity` is 0, item is removed from cart
- `itemId` must exist in user's cart

**Error Responses:**

- `400 VALIDATION_ERROR`: Invalid quantity
- `404 CART_ITEM_NOT_FOUND`: Cart item not found
- `401 UNAUTHORIZED`: Authentication required

---

### 1.4 Remove Cart Item

**Endpoint:** `DELETE /cart/items/:itemId`

**Description:** Remove an item from the cart.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `itemId` | string | Yes | Cart item ID |

**Response Format:**

```typescript
{
  success: boolean;
  data: Cart;                   // Updated cart
  message?: string;
}
```

**Error Responses:**

- `404 CART_ITEM_NOT_FOUND`: Cart item not found
- `401 UNAUTHORIZED`: Authentication required

---

### 1.5 Clear Cart

**Endpoint:** `DELETE /cart`

**Description:** Remove all items from the cart.

**Response Format:**

```typescript
{
  success: boolean;
  data: Cart;                   // Empty cart
  message?: string;
}
```

**Error Responses:**

- `401 UNAUTHORIZED`: Authentication required

---

### 1.6 Apply Promo Code

**Endpoint:** `POST /cart/promo-code`

**Description:** Apply a promo code to the cart. Validate the code and calculate discount. Should check in promotions if code is active and how much discount to apply.

**Request Body:**

```typescript
{
  code: string;                 // Required: Promo code (case-insensitive)
}
```

**Response Format:**

```typescript
{
  success: boolean;
  data: {
    cart: Cart;                  // Updated cart with discount
    promoCode: {
      code: string;
      discountPercent: number;
      discountAmount: number;
      validUntil?: string;       // ISO date string (if code has expiry)
      minOrderAmount?: number;   // Minimum order amount required (in kobo)
      maxDiscountAmount?: number; // Maximum discount amount (in kobo)
    };
  };
  message?: string;
}
```

**Example Request:**

```json
{
  "code": "TGIF224"
}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "507f1f77bcf86cd799439011",
      "subtotal": 300000,
      "extrasTotal": 50000,
      "discountAmount": 35000,
      "discountPercent": 10,
      "promoCode": "TGIF224",
      "total": 315000,
      "formattedTotal": "₦3,150"
    },
    "promoCode": {
      "code": "TGIF224",
      "discountPercent": 10,
      "discountAmount": 35000,
      "validUntil": "2024-12-31T23:59:59.000Z",
      "minOrderAmount": 100000
    }
  }
}
```

**Validation Rules:**

- Code must exist and be active
- Code must not be expired
- Code must meet minimum order amount (if specified)
- Code must not exceed maximum discount amount (if specified)
- User must not have already used this code (if one-time use)
- Code must be valid for current user (if user-specific)

**Error Responses:**

- `400 VALIDATION_ERROR`: Invalid promo code format
- `404 PROMO_CODE_NOT_FOUND`: Promo code not found
- `400 PROMO_CODE_EXPIRED`: Promo code has expired
- `400 PROMO_CODE_INVALID`: Promo code not valid (minimum order not met, already used, etc.)
- `401 UNAUTHORIZED`: Authentication required

---

### 1.7 Remove Promo Code

**Endpoint:** `DELETE /cart/promo-code`

**Description:** Remove the applied promo code from the cart.

**Response Format:**

```typescript
{
  success: boolean;
  data: Cart;                   // Updated cart without discount
  message?: string;
}
```

**Error Responses:**

- `401 UNAUTHORIZED`: Authentication required

---

## 2. Checkout & Order Placement API

### 2.1 Validate Checkout

**Endpoint:** `POST /checkout/validate`

**Description:** Validate checkout data before placing order. Checks cart, delivery address, availability, etc.

**Request Body:**

```typescript
{
  deliveryType: DeliveryType;   // Required: "door-delivery" | "pickup"
  deliveryAddressId?: string;   // Required for door-delivery: Saved location ID
  deliveryAddress?: DeliveryAddress; // Alternative: Inline delivery address
  pickupLocationId?: string;    // Required for pickup: Pickup location ID, create a schema for this managed by the admins. should be the pickup location geographically closest to the user's coordinates.
  promoCode?: string;          // Optional: Promo code to apply
}
```

**Response Format:**

```typescript
{
  success: boolean;
  data: {
    isValid: boolean;
    cart: Cart;                 // Updated cart (if promo code applied)
    deliveryFee: number;         // Calculated delivery fee (in kobo)
    estimatedDeliveryTime?: string; // ISO date string
    estimatedPreparationTime: number; // Minutes
    errors?: Array<{            // Validation errors
      field: string;
      message: string;
    }>;
    warnings?: Array<{          // Warnings (non-blocking)
      field: string;
      message: string;
    }>;
  };
  message?: string;
}
```

**Example Request:**

```json
{
  "deliveryType": "door-delivery",
  "deliveryAddressId": "507f1f77bcf86cd799439017",
  "promoCode": "TGIF224"
}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "isValid": true,
    "cart": {
      "subtotal": 300000,
      "extrasTotal": 50000,
      "discountAmount": 35000,
      "total": 315000
    },
    "deliveryFee": 80000,
    "estimatedDeliveryTime": "2024-01-15T12:30:00.000Z",
    "estimatedPreparationTime": 25,
    "warnings": [
      {
        "field": "items",
        "message": "Some items may take longer to prepare"
      }
    ]
  }
}
```

**Validation Checks:**

- Cart must not be empty
- All cart items must be available
- Delivery address must be provided for door-delivery
- Pickup location must be provided for pickup
- Delivery fee must be calculated
- Promo code must be valid (if provided)
- Minimum order amount must be met (if applicable)

**Error Responses:**

- `400 VALIDATION_ERROR`: Invalid checkout data
- `400 CART_EMPTY`: Cart is empty
- `400 ITEM_NOT_AVAILABLE`: One or more items are not available
- `400 DELIVERY_ADDRESS_REQUIRED`: Delivery address required for door-delivery
- `400 PICKUP_LOCATION_REQUIRED`: Pickup location required for pickup
- `401 UNAUTHORIZED`: Authentication required

---

### 2.2 Place Order

**Endpoint:** `POST /orders`

**Description:** Place an order from the current cart. Cart is cleared after successful order placement.

**Request Body:**

```typescript
{
  deliveryType: DeliveryType;   // Required: "door-delivery" | "pickup"
  deliveryAddressId?: string;   // Required for door-delivery: Saved location ID
  deliveryAddress?: DeliveryAddress; // Alternative: Inline delivery address
  pickupLocationId?: string;    // Required for pickup: Pickup location ID
  promoCode?: string;          // Optional: Promo code
  paymentMethod: string;        // Required: Payment method (e.g., "card", "cash", "wallet")
  paymentIntentId?: string;    // Optional: Payment intent ID (for card payments)
  instructions?: string;        // Optional: Special delivery/order instructions
}
```

**Response Format:**

```typescript
{
  success: boolean;
  data: Order;                  // Created order
  message?: string;
}
```

**Example Request:**

```json
{
  "deliveryType": "door-delivery",
  "deliveryAddressId": "507f1f77bcf86cd799439017",
  "promoCode": "TGIF224",
  "paymentMethod": "card",
  "paymentIntentId": "pi_1234567890",
  "instructions": "Please call when you arrive"
}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439018",
    "orderNumber": "ORD-2024-001234",
    "userId": "507f1f77bcf86cd799439012",
    "status": "pending",
    "deliveryType": "door-delivery",
    "items": [
      {
        "id": "507f1f77bcf86cd799439019",
        "foodItemId": "507f1f77bcf86cd799439014",
        "name": "Jollof Rice",
        "description": "Smoky jollof with grilled chicken wing spiced with local spices.",
        "slug": "jollof-rice",
        "price": 150000,
        "formattedPrice": "₦1,500",
        "currency": "NGN",
        "imageUrl": "https://cdn.surespot.app/images/jollof-rice.jpg",
        "quantity": 2,
        "extras": [
          {
            "id": "507f1f77bcf86cd799439020",
            "foodExtraId": "507f1f77bcf86cd799439016",
            "name": "Extra chicken",
            "price": 50000,
            "formattedPrice": "₦500",
            "quantity": 1
          }
        ],
        "lineTotal": 350000
      }
    ],
    "subtotal": 300000,
    "extrasTotal": 50000,
    "deliveryFee": 80000,
    "discountAmount": 35000,
    "discountPercent": 10,
    "promoCode": "TGIF224",
    "total": 395000,
    "formattedTotal": "₦3,950",
    "itemCount": 2,
    "extrasCount": 1,
    "deliveryAddress": {
      "id": "507f1f77bcf86cd799439017",
      "address": "Crown's road, Ojo, Lagos",
      "street": "Crown's road",
      "city": "Lagos",
      "state": "Lagos",
      "country": "Nigeria",
      "coordinates": {
        "latitude": 6.5244,
        "longitude": 3.3792
      },
      "instructions": "Please call when you arrive"
    },
    "estimatedDeliveryTime": "2024-01-15T12:30:00.000Z",
    "estimatedPreparationTime": 25,
    "paymentStatus": "paid",
    "paymentMethod": "card",
    "createdAt": "2024-01-15T11:00:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  },
  "message": "Order placed successfully"
}
```

**Validation Rules:**

- Cart must not be empty
- All cart items must be available
- Delivery address must be provided for door-delivery
- Pickup location must be provided for pickup
- Payment method must be valid
- Payment must be successful (for card payments)
- Promo code must be valid (if provided)

**Post-Order Actions:**

- Clear user's cart
- Create order record
- Send order confirmation notification
- Update inventory (if applicable)
- Trigger payment processing (if applicable)

**Error Responses:**

- `400 VALIDATION_ERROR`: Invalid order data
- `400 CART_EMPTY`: Cart is empty
- `400 ITEM_NOT_AVAILABLE`: One or more items are not available
- `400 DELIVERY_ADDRESS_REQUIRED`: Delivery address required
- `400 PAYMENT_FAILED`: Payment processing failed
- `401 UNAUTHORIZED`: Authentication required
- `500 INTERNAL_ERROR`: Order creation failed

---

## 3. Order Management API

### 3.1 Get Order History

**Endpoint:** `GET /orders`

**Description:** Retrieve paginated list of user's orders.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number (1-indexed) |
| `limit` | number | No | 20 | Items per page (max: 50) |
| `status` | string | No | - | Filter by status: "pending", "confirmed", "preparing", "ready", "out-for-delivery", "delivered", "cancelled" |
| `deliveryType` | string | No | - | Filter by delivery type: "door-delivery", "pickup" |

**Response Format:**

```typescript
{
  success: boolean;
  data: {
    orders: Order[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
  message?: string;
}
```

**Example Request:**

```
GET /orders?page=1&limit=20&status=delivered
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "507f1f77bcf86cd799439018",
        "orderNumber": "ORD-2024-001234",
        "status": "delivered",
        "deliveryType": "door-delivery",
        "total": 395000,
        "formattedTotal": "₦3,950",
        "itemCount": 2,
        "extrasCount": 1,
        "createdAt": "2024-01-15T11:00:00.000Z",
        "deliveredAt": "2024-01-15T12:25:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 15,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

**Error Responses:**

- `400 VALIDATION_ERROR`: Invalid query parameters
- `401 UNAUTHORIZED`: Authentication required

---

### 3.2 Get Order Details

**Endpoint:** `GET /orders/:orderId`

**Description:** Retrieve detailed information about a specific order.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | Order ID or order number |

**Response Format:**

```typescript
{
  success: boolean;
  data: Order;                  // Full order details
  message?: string;
}
```

**Example Request:**

```
GET /orders/507f1f77bcf86cd799439018
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439018",
    "orderNumber": "ORD-2024-001234",
    "userId": "507f1f77bcf86cd799439012",
    "status": "delivered",
    "deliveryType": "door-delivery",
    "items": [
      {
        "id": "507f1f77bcf86cd799439019",
        "foodItemId": "507f1f77bcf86cd799439014",
        "name": "Jollof Rice",
        "description": "Smoky jollof with grilled chicken wing spiced with local spices.",
        "slug": "jollof-rice",
        "price": 150000,
        "formattedPrice": "₦1,500",
        "currency": "NGN",
        "imageUrl": "https://cdn.surespot.app/images/jollof-rice.jpg",
        "quantity": 2,
        "extras": [
          {
            "id": "507f1f77bcf86cd799439020",
            "foodExtraId": "507f1f77bcf86cd799439016",
            "name": "Extra chicken",
            "price": 50000,
            "formattedPrice": "₦500",
            "quantity": 1
          }
        ],
        "lineTotal": 350000
      }
    ],
    "subtotal": 300000,
    "extrasTotal": 50000,
    "deliveryFee": 80000,
    "discountAmount": 35000,
    "discountPercent": 10,
    "promoCode": "TGIF224",
    "total": 395000,
    "formattedTotal": "₦3,950",
    "itemCount": 2,
    "extrasCount": 1,
    "deliveryAddress": {
      "id": "507f1f77bcf86cd799439017",
      "address": "Crown's road, Ojo, Lagos",
      "street": "Crown's road",
      "city": "Lagos",
      "state": "Lagos",
      "country": "Nigeria",
      "coordinates": {
        "latitude": 6.5244,
        "longitude": 3.3792
      },
      "instructions": "Please call when you arrive"
    },
    "estimatedDeliveryTime": "2024-01-15T12:30:00.000Z",
    "estimatedPreparationTime": 25,
    "paymentStatus": "paid",
    "paymentMethod": "card",
    "createdAt": "2024-01-15T11:00:00.000Z",
    "updatedAt": "2024-01-15T12:25:00.000Z",
    "deliveredAt": "2024-01-15T12:25:00.000Z"
  }
}
```

**Error Responses:**

- `404 ORDER_NOT_FOUND`: Order not found
- `403 FORBIDDEN`: Order does not belong to current user
- `401 UNAUTHORIZED`: Authentication required

---

### 3.3 Cancel Order

**Endpoint:** `POST /orders/:orderId/cancel`

**Description:** Cancel an order. Only pending or confirmed orders can be cancelled.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | Order ID |

**Request Body:**

```typescript
{
  reason?: string;              // Optional: Cancellation reason
}
```

**Response Format:**

```typescript
{
  success: boolean;
  data: Order;                  // Updated order with status "cancelled"
  message?: string;
}
```

**Validation Rules:**

- Order must belong to current user
- Order status must be "pending" or "confirmed"
- Order cannot be cancelled if already being prepared or delivered

**Error Responses:**

- `404 ORDER_NOT_FOUND`: Order not found
- `400 ORDER_CANNOT_BE_CANCELLED`: Order cannot be cancelled (already preparing/delivering)
- `403 FORBIDDEN`: Order does not belong to current user
- `401 UNAUTHORIZED`: Authentication required

---

### 3.4 Update Order Status (Admin/Restaurant Only)

**Endpoint:** `PATCH /orders/:orderId/status`

**Description:**  
Update the status of an order. This endpoint is only available to admin and restaurant staff. When an order is set to "ready", it triggers notifications to nearby riders (for door delivery orders) and customers.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | Order ID |

**Request Body:**

```typescript
{
  status: DeliveryStatus;        // Required: New delivery status
  message?: string;              // Optional: Status message (max 500 chars)
  latitude?: number;            // Optional: Latitude coordinate (-90 to 90)
  longitude?: number;           // Optional: Longitude coordinate (-180 to 180)
}
```

**DeliveryStatus Enum:**

```typescript
type DeliveryStatus = 
  | "pending"           // Order is pending
  | "preparing"         // Order is being prepared
  | "ready"             // Order is ready for pickup/delivery
  | "rider_requested"   // Rider has been requested
  | "rider_present"     // Rider is present at pickup location
  | "rider_picked_up"   // Rider has picked up the order
  | "delivered"         // Order has been delivered
  | "cancelled";        // Order has been cancelled
```

**Example Request - Set Order to Ready:**

```http
PATCH /orders/507f1f77bcf86cd799439013/status
Authorization: Bearer <admin_or_restaurant_token>
Content-Type: application/json

{
  "status": "ready",
  "message": "Order is ready for pickup"
}
```

**Response Format:**

```typescript
{
  success: boolean;
  message: string;
  data: Order;                  // Updated order with new status
}
```

**Example Response:**

```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "id": "507f1f77bcf86cd799439013",
    "orderNumber": "ORD-2024-001234",
    "status": "ready",
    "deliveryType": "door-delivery",
    "items": [...],
    "total": 640000,
    "formattedTotal": "₦6,400.00",
    "paymentStatus": "paid",
    "createdAt": "2024-01-15T10:25:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Status Update Behavior:**

- **`preparing`**: Sends "Order is being prepared" notification to customer
- **`ready`**: 
  - Sends "Order is ready" notification to customer
  - For door delivery orders: Automatically finds and notifies nearby active riders (within 5KM of both pickup and delivery locations) via WebSocket
  - For pickup orders: Customer is notified to come pick up
- **`rider_picked_up`**: Sends "Order is out for delivery" notification to customer
- **`delivered`**: Sends "Order has been delivered" notification to customer and sets `deliveredAt` timestamp
- **`cancelled`**: Cancels the order and sends cancellation notification

**Validation Rules:**

- User must have ADMIN or RESTAURANT role
- Order must exist
- Status must be a valid DeliveryStatus enum value
- Message (if provided) must be max 500 characters
- Latitude must be between -90 and 90
- Longitude must be between -180 and 180

**Error Responses:**

- `404 ORDER_NOT_FOUND`: Order not found
- `403 FORBIDDEN`: User does not have admin/restaurant permissions
- `400 BAD_REQUEST`: Invalid status or validation error
- `401 UNAUTHORIZED`: Authentication required

**Notes:**

- When setting status to "ready" for door delivery orders, the system automatically:
  1. Finds active riders in the same region
  2. Checks if riders are within 5KM of both pickup location and delivery address
  3. Sends WebSocket notifications to eligible riders
  4. Riders can then see the order in their eligible orders list and accept it
- Status updates create a delivery status entry for tracking history
- All status changes trigger appropriate notifications to customers

---

### 3.5 Reorder

**Endpoint:** `POST /orders/:orderId/reorder`

**Description:** Add all items from a previous order to the current cart.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | Order ID |

**Response Format:**

```typescript
{
  success: boolean;
  data: Cart;                   // Updated cart with reordered items
  message?: string;
}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "items": [
      {
        "id": "507f1f77bcf86cd799439021",
        "foodItemId": "507f1f77bcf86cd799439014",
        "name": "Jollof Rice",
        "quantity": 2,
        "extras": [
          {
            "foodExtraId": "507f1f77bcf86cd799439016",
            "name": "Extra chicken",
            "quantity": 1
          }
        ]
      }
    ],
    "subtotal": 300000,
    "extrasTotal": 50000,
    "total": 350000
  },
  "message": "Items added to cart"
}
```

**Validation Rules:**

- Order must belong to current user
- Items must still be available (skip unavailable items with warning)
- Extras must still be available (skip unavailable extras with warning)

**Error Responses:**

- `404 ORDER_NOT_FOUND`: Order not found
- `403 FORBIDDEN`: Order does not belong to current user
- `401 UNAUTHORIZED`: Authentication required

---

## 4. Order Tracking API

### 4.1 Get Order Tracking

**Endpoint:** `GET /orders/:orderId/tracking`

**Description:** Get real-time tracking information for an order. Use an Order Delivery Status schema with the orderId. can be written to by the restaurant or the pickup rider.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | Order ID |

**Response Format:**

```typescript
{
  success: boolean;
  data: {
    order: Order;               // Order details
    tracking: {
      status: OrderStatus;
      statusHistory: Array<{    // Status change history
        status: OrderStatus;
        timestamp: string;       // ISO date string
        message?: string;        // Optional status message
      }>;
      currentLocation?: {        // For out-for-delivery orders
        latitude: number;
        longitude: number;
        address?: string;
        lastUpdated: string;     // ISO date string
      };
      estimatedDeliveryTime?: string; // ISO date string
      estimatedTimeRemaining?: number; // Minutes remaining
    };
  };
  message?: string;
}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "order": {
      "id": "507f1f77bcf86cd799439018",
      "orderNumber": "ORD-2024-001234",
      "status": "out-for-delivery"
    },
    "tracking": {
      "status": "out-for-delivery",
      "statusHistory": [
        {
          "status": "pending",
          "timestamp": "2024-01-15T11:00:00.000Z",
          "message": "Order placed"
        },
        {
          "status": "confirmed",
          "timestamp": "2024-01-15T11:05:00.000Z",
          "message": "Order confirmed by restaurant"
        },
        {
          "status": "preparing",
          "timestamp": "2024-01-15T11:10:00.000Z",
          "message": "Order is being prepared"
        },
        {
          "status": "out-for-delivery",
          "timestamp": "2024-01-15T11:35:00.000Z",
          "message": "Order is on the way"
        }
      ],
      "currentLocation": {
        "latitude": 6.5244,
        "longitude": 3.3792,
        "address": "Lagos Island",
        "lastUpdated": "2024-01-15T11:40:00.000Z"
      },
      "estimatedDeliveryTime": "2024-01-15T12:30:00.000Z",
      "estimatedTimeRemaining": 50
    }
  }
}
```

**Error Responses:**

- `404 ORDER_NOT_FOUND`: Order not found
- `403 FORBIDDEN`: Order does not belong to current user
- `401 UNAUTHORIZED`: Authentication required

---

## 5. Promo Codes API (integrate into existing promotions flow)

### 5.1 Validate Promo Code

**Endpoint:** `POST /promo-codes/validate`

**Description:** Validate a promo code without applying it to cart. Useful for checking code validity before checkout.

**Request Body:**

```typescript
{
  code: string;                 // Required: Promo code
  cartTotal?: number;           // Optional: Cart total (in kobo) for validation
}
```

**Response Format:**

```typescript
{
  success: boolean;
  data: {
    isValid: boolean;
    promoCode?: {
      code: string;
      discountPercent: number;
      discountAmount: number;   // Calculated based on cartTotal
      validUntil?: string;
      minOrderAmount?: number;
      maxDiscountAmount?: number;
      description?: string;
    };
    error?: string;             // Error message if invalid
  };
  message?: string;
}
```

**Example Request:**

```json
{
  "code": "TGIF224",
  "cartTotal": 350000
}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "isValid": true,
    "promoCode": {
      "code": "TGIF224",
      "discountPercent": 10,
      "discountAmount": 35000,
      "validUntil": "2024-12-31T23:59:59.000Z",
      "minOrderAmount": 100000,
      "description": "10% off on Fridays"
    }
  }
}
```

**Error Responses:**

- `400 VALIDATION_ERROR`: Invalid promo code format
- `404 PROMO_CODE_NOT_FOUND`: Promo code not found
- `400 PROMO_CODE_EXPIRED`: Promo code has expired
- `400 PROMO_CODE_INVALID`: Promo code not valid (minimum order not met, etc.)

---

## Standard Error Response Format

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
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `NOT_FOUND` | 404 | Resource not found |
| `CART_EMPTY` | 400 | Cart is empty |
| `CART_ITEM_NOT_FOUND` | 404 | Cart item not found |
| `FOOD_ITEM_NOT_FOUND` | 404 | Food item not found |
| `EXTRA_NOT_AVAILABLE` | 400 | Extra not available for this food item |
| `ITEM_NOT_AVAILABLE` | 400 | Food item is not available |
| `ORDER_NOT_FOUND` | 404 | Order not found |
| `ORDER_CANNOT_BE_CANCELLED` | 400 | Order cannot be cancelled |
| `PROMO_CODE_NOT_FOUND` | 404 | Promo code not found |
| `PROMO_CODE_EXPIRED` | 400 | Promo code has expired |
| `PROMO_CODE_INVALID` | 400 | Promo code not valid |
| `DELIVERY_ADDRESS_REQUIRED` | 400 | Delivery address required |
| `PICKUP_LOCATION_REQUIRED` | 400 | Pickup location required |
| `PAYMENT_FAILED` | 400 | Payment processing failed |
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

### Cart Persistence

- Cart should be persisted per user
- Cart should be cleared after successful order placement
- Cart should expire after 7 days of inactivity (optional)
- Cart should sync across devices for same user

### Order Number Generation

- Format: `ORD-{YYYY}-{SEQUENTIAL}`
- Example: `ORD-2024-001234`
- Sequential number resets annually or continues incrementing

### Delivery Fee Calculation

- Base delivery fee: 800 kobo (₦8.00) for door-delivery
- May vary based on distance, location, or order value
- Delivery fee is 0 for pickup orders
- Delivery fee should be calculated during checkout validation

### Promo Code Rules

- Codes are case-insensitive
- Codes can have expiry dates
- Codes can have minimum order amounts
- Codes can have maximum discount amounts
- Codes can be one-time use or multi-use
- Codes can be user-specific or general
- Codes can be percentage-based or fixed amount

### Order Status Flow

1. `pending` → Order placed, awaiting confirmation
2. `confirmed` → Order confirmed by restaurant
3. `preparing` → Order being prepared
4. `ready` → Order ready (for pickup) or ready for delivery
5. `out-for-delivery` → Order out for delivery (door-delivery only)
6. `delivered` → Order delivered
7. `cancelled` → Order cancelled (can occur at any stage before delivery)

### Payment Integration

- Support multiple payment methods: card, cash, wallet
- For card payments, require payment intent ID
- Payment status should be tracked separately from order status
- Refunds should update payment status to "refunded"

### Extras Handling

- Extras are optional additions to food items
- Extras have their own prices
- Extras must be available for the specific food item
- Extras are included in cart item and order item
- Extras total is calculated separately from item subtotal

### Inventory Management

- Check item availability before adding to cart
- Check item availability before placing order
- Update inventory after order placement (if applicable)
- Handle out-of-stock items gracefully

### Notifications

- Send order confirmation notification after order placement
- Send status update notifications when order status changes
- Send delivery tracking updates (for door-delivery)
- Send order ready notification (for pickup)

---

## Testing Checklist

### Cart Management

- [ ] Get empty cart
- [ ] Add item to cart
- [ ] Add item with extras to cart
- [ ] Add duplicate item (increment quantity)
- [ ] Update cart item quantity
- [ ] Remove cart item
- [ ] Clear cart
- [ ] Apply valid promo code
- [ ] Apply invalid promo code
- [ ] Apply expired promo code
- [ ] Remove promo code
- [ ] Cart totals calculation (subtotal, extras, discount, total)

### Checkout

- [ ] Validate checkout with door-delivery
- [ ] Validate checkout with pickup
- [ ] Validate checkout with promo code
- [ ] Validate checkout with invalid address
- [ ] Validate checkout with empty cart
- [ ] Validate checkout with unavailable items
- [ ] Place order with door-delivery
- [ ] Place order with pickup
- [ ] Place order with promo code
- [ ] Place order with payment
- [ ] Place order with unavailable items (should fail)
- [ ] Cart cleared after order placement

### Orders

- [ ] Get order history (paginated)
- [ ] Get order history with status filter
- [ ] Get order history with delivery type filter
- [ ] Get order details by ID
- [ ] Get order details by order number
- [ ] Cancel pending order
- [ ] Cancel confirmed order
- [ ] Cancel order that cannot be cancelled (should fail)
- [ ] Reorder from previous order
- [ ] Reorder with unavailable items (should skip with warning)

### Order Tracking

- [ ] Get tracking for pending order
- [ ] Get tracking for preparing order
- [ ] Get tracking for out-for-delivery order
- [ ] Get tracking for delivered order
- [ ] Get tracking with location updates

### Promo Codes

- [ ] Validate valid promo code
- [ ] Validate invalid promo code
- [ ] Validate expired promo code
- [ ] Validate promo code with minimum order requirement
- [ ] Validate promo code with maximum discount

### Error Handling

- [ ] 400 errors (validation, bad request)
- [ ] 401 errors (unauthorized)
- [ ] 403 errors (forbidden)
- [ ] 404 errors (not found)
- [ ] 500 errors (server error)

---

## Frontend Integration Notes

The frontend will:

1. Call these endpoints using `authenticatedFetch` from `src/services/apiClient.ts`
2. Transform responses to match existing frontend types (`CartItem`, `Order`, etc.)
3. Update cart store to sync with backend cart
4. Handle cart persistence across app restarts
5. Display real-time order tracking updates
6. Handle payment integration (if applicable)
7. Show order status updates via notifications
8. Implement optimistic updates for better UX
9. Handle offline scenarios (queue cart updates, sync when online)

### Cart Store Integration

- Replace local cart state with API-backed cart
- Sync cart on app start
- Sync cart after each cart operation
- Handle cart conflicts (if cart modified on another device)

### Checkout Flow Integration

- Validate checkout before showing checkout screen
- Show delivery fee calculation
- Show estimated delivery time
- Handle payment processing
- Clear cart after successful order
- Navigate to order tracking after order placement

### Order History Integration

- Fetch orders with pagination
- Filter orders by status
- Show order details
- Implement reorder functionality
- Show order tracking for active orders

---

*Last updated: Based on codebase analysis and requirements*
