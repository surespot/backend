# Frontend Integration Guide - Cart, Checkout & Orders API

This document provides comprehensive integration instructions for the Cart, Checkout, and Orders features based on the **actual backend implementation**. Use this guide to integrate these features into the customer-facing mobile application.

---

## Table of Contents

1. [Base Configuration](#base-configuration)
2. [Cart Management API](#cart-management-api)
3. [Checkout & Order Placement API](#checkout--order-placement-api)
4. [Order Management API](#order-management-api)
5. [Data Schemas](#data-schemas)
6. [Error Handling](#error-handling)
7. [Integration Best Practices](#integration-best-practices)

---

## Base Configuration

### Base URL

```
Development: http://localhost:3000
Production: https://api.surespot.app/v1
```

**Note:** The API version prefix (`/v1`) may be configured via environment variables. Check with the backend team for the exact production URL structure.

### Authentication

All endpoints require authentication. Include the access token in the Authorization header:

```
Authorization: Bearer {accessToken}
```

The access token should be obtained from the authentication endpoints (login/registration flow).

---

## Cart Management API

### 1. Get Cart

**Endpoint:** `GET /cart`

**Description:** Retrieve the current user's cart with all items and calculated totals. Returns an empty cart structure if the user has no cart yet.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: Cart;
}
```

**Example Response:**
```json
{
  "success": true,
  "message": "Cart retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439012",
    "items": [
      {
        "id": "507f1f77bcf86cd799439013",
        "foodItemId": "507f1f77bcf86cd799439014",
        "name": "Jollof Rice",
        "description": "Smoky jollof with grilled chicken wing",
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
            "price": 50000,
            "formattedPrice": "₦500",
            "currency": "NGN",
            "quantity": 1
          }
        ],
        "subtotal": 300000,
        "extrasTotal": 100000,
        "lineTotal": 400000,
        "estimatedTime": {
          "min": 20,
          "max": 25
        },
        "createdAt": "2024-01-15T10:00:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "subtotal": 300000,
    "extrasTotal": 100000,
    "discountAmount": 0,
    "discountPercent": undefined,
    "promoCode": undefined,
    "total": 400000,
    "formattedTotal": "₦4,000",
    "itemCount": 2,
    "extrasCount": 2,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Responses:**
- `401 UNAUTHORIZED`: Missing or invalid authentication token

**Implementation Notes:**
- If the user has no cart, the backend will create an empty cart automatically
- Cart items include `estimatedTime` object with `min` and `max` preparation time in minutes
- All prices are in kobo (smallest currency unit for NGN)

---

### 2. Add Item to Cart

**Endpoint:** `POST /cart/items`

**Description:** Add a food item to the cart. If the item already exists with the same extras, the quantity will be incremented. Otherwise, a new cart item is created.

**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Request Body:**
```typescript
{
  foodItemId: string;            // Required: Food item ID (MongoDB ObjectId)
  quantity?: number;              // Optional: Quantity (default: 1, min: 1, max: 99)
  extras?: Array<{               // Optional: Selected extras
    foodExtraId: string;          // Extra ID (MongoDB ObjectId)
    quantity?: number;            // Optional: Quantity (default: 1)
  }>;
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

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: Cart;  // Updated cart
}
```

**Validation Rules:**
- `foodItemId` must exist and be active
- `quantity` must be between 1 and 99
- All `foodExtraId` values must exist and be available for the food item
- If item already exists with same extras, quantity is incremented instead of creating duplicate

**Error Responses:**
- `400 VALIDATION_ERROR`: Invalid request body or validation failed
- `404 FOOD_ITEM_NOT_FOUND`: Food item not found
- `400 EXTRA_NOT_AVAILABLE`: Extra not available for this food item
- `400 ITEM_NOT_AVAILABLE`: Food item is not available
- `401 UNAUTHORIZED`: Authentication required

---

### 3. Update Cart Item Quantity

**Endpoint:** `PATCH /cart/items/:itemId`

**Description:** Update the quantity of a cart item. If quantity is set to 0, the item is removed from the cart.

**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `itemId` | string | Yes | Cart item ID (MongoDB ObjectId) |

**Request Body:**
```typescript
{
  quantity: number;  // Required: New quantity (min: 0, max: 99)
}
```

**Example Request:**
```json
{
  "quantity": 3
}
```

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: Cart;  // Updated cart
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

### 4. Remove Cart Item

**Endpoint:** `DELETE /cart/items/:itemId`

**Description:** Remove an item from the cart.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `itemId` | string | Yes | Cart item ID (MongoDB ObjectId) |

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: Cart;  // Updated cart
}
```

**Error Responses:**
- `404 CART_ITEM_NOT_FOUND`: Cart item not found
- `401 UNAUTHORIZED`: Authentication required

---

### 5. Clear Cart

**Endpoint:** `DELETE /cart`

**Description:** Remove all items from the cart. The cart structure remains but all items are cleared.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: Cart;  // Empty cart
}
```

**Error Responses:**
- `401 UNAUTHORIZED`: Authentication required

---

### 6. Apply Promo Code

**Endpoint:** `POST /cart/promo-code`

**Description:** Apply a promo code to the cart. The code is validated against active promotions, and discount is calculated and applied to the cart total.

**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Request Body:**
```typescript
{
  code: string;  // Required: Promo code (case-insensitive)
}
```

**Example Request:**
```json
{
  "code": "TGIF224"
}
```

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: {
    cart: Cart;  // Updated cart with discount
    promoCode: {
      code: string;
      discountPercent: number;
      discountAmount: number;
    };
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "message": "Promo code applied successfully",
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
      "discountAmount": 35000
    }
  }
}
```

**Validation Rules:**
- Code must exist in active promotions
- Code must not be expired
- Code must meet minimum order amount (if specified)
- Code must not exceed maximum discount amount (if specified)
- Cart must not be empty

**Error Responses:**
- `400 VALIDATION_ERROR`: Invalid promo code format
- `404 PROMO_CODE_NOT_FOUND`: Promo code not found
- `400 PROMO_CODE_EXPIRED`: Promo code has expired
- `400 PROMO_CODE_INVALID`: Promo code not valid (minimum order not met, etc.)
- `400 CART_EMPTY`: Cart is empty
- `401 UNAUTHORIZED`: Authentication required

**Implementation Notes:**
- Promo codes are validated against the promotions system
- Discount is calculated based on the cart subtotal + extras total
- The promo code is stored in the cart and will be applied when placing an order

---

### 7. Remove Promo Code

**Endpoint:** `DELETE /cart/promo-code`

**Description:** Remove the applied promo code from the cart. Discount is removed and totals are recalculated.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: Cart;  // Updated cart without discount
}
```

**Error Responses:**
- `401 UNAUTHORIZED`: Authentication required

---

## Checkout & Order Placement API

### 1. Validate Checkout

**Endpoint:** `POST /checkout/validate`

**Description:** Validate checkout data before placing an order. This endpoint checks cart validity, delivery address, item availability, calculates delivery fees, and validates promo codes. Use this before showing the final checkout screen to the user.

**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Request Body:**
```typescript
{
  deliveryType: "door-delivery" | "pickup";  // Required
  deliveryAddressId?: string;                 // Required for door-delivery: Saved location ID
  deliveryAddress?: {                         // Alternative to deliveryAddressId (for door-delivery)
    address: string;                           // Required: Full address string
    street?: string;
    city?: string;
    state?: string;
    country?: string;                          // Default: "Nigeria"
    latitude?: number;                         // GPS coordinate
    longitude?: number;                        // GPS coordinate
    instructions?: string;                      // Delivery instructions
    contactPhone?: string;
  };
  pickupLocationId?: string;                   // Required for pickup: Pickup location ID
  promoCode?: string;                          // Optional: Promo code to validate
}
```

**Example Request (Door Delivery):**
```json
{
  "deliveryType": "door-delivery",
  "deliveryAddressId": "507f1f77bcf86cd799439017",
  "promoCode": "TGIF224"
}
```

**Example Request (Pickup):**
```json
{
  "deliveryType": "pickup",
  "pickupLocationId": "507f1f77bcf86cd799439018"
}
```

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: {
    isValid: boolean;
    cart: Cart;                                // Updated cart (if promo code applied)
    deliveryFee: number;                        // Calculated delivery fee (in kobo)
    estimatedDeliveryTime?: string;             // ISO date string
    estimatedPreparationTime: number;          // Minutes
    errors?: Array<{                            // Validation errors (blocking)
      field: string;
      message: string;
    }>;
    warnings?: Array<{                          // Warnings (non-blocking)
      field: string;
      message: string;
    }>;
  };
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
- Delivery address must be provided for door-delivery (either `deliveryAddressId` or `deliveryAddress`)
- Pickup location must be provided for pickup
- Delivery fee is calculated based on delivery type and location
- Promo code is validated (if provided)
- Minimum order amount must be met (if applicable)

**Error Responses:**
- `400 VALIDATION_ERROR`: Invalid checkout data
- `400 CART_EMPTY`: Cart is empty
- `400 ITEM_NOT_AVAILABLE`: One or more items are not available
- `400 DELIVERY_ADDRESS_REQUIRED`: Delivery address required for door-delivery
- `400 PICKUP_LOCATION_REQUIRED`: Pickup location required for pickup
- `401 UNAUTHORIZED`: Authentication required

**Implementation Notes:**
- Always call this endpoint before allowing the user to place an order
- Display validation errors to the user and prevent order placement if `isValid` is `false`
- Show warnings but allow order placement
- Delivery fee is 0 for pickup orders
- The `estimatedDeliveryTime` is only provided for door-delivery orders

---

### 2. Place Order

**Endpoint:** `POST /orders`

**Description:** Place an order from the current cart. The cart is automatically cleared after successful order placement.

**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Request Body:**
```typescript
{
  deliveryType: "door-delivery" | "pickup";  // Required
  deliveryAddressId?: string;                 // Required for door-delivery: Saved location ID
  deliveryAddress?: {                         // Alternative to deliveryAddressId
    address: string;                           // Required
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    instructions?: string;
    contactPhone?: string;
  };
  pickupLocationId?: string;                   // Required for pickup: Pickup location ID
  promoCode?: string;                         // Optional: Promo code
  paymentMethod: string;                      // Required: Payment method (e.g., "card", "cash", "wallet")
  paymentIntentId?: string;                    // Optional: Payment intent ID (for card payments via Paystack)
  instructions?: string;                      // Optional: Special delivery/order instructions (max 500 chars)
}
```

**Example Request:**
```json
{
  "deliveryType": "door-delivery",
  "deliveryAddressId": "507f1f77bcf86cd799439017",
  "promoCode": "TGIF224",
  "paymentMethod": "card",
  "paymentIntentId": "pay_1234567890",
  "instructions": "Please call when you arrive"
}
```

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: Order;  // Created order
}
```

**Example Response:**
```json
{
  "success": true,
  "message": "Order placed successfully",
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
        "description": "Smoky jollof with grilled chicken wing",
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
  }
}
```

**Validation Rules:**
- Cart must not be empty
- All cart items must be available
- Delivery address must be provided for door-delivery
- Pickup location must be provided for pickup
- Payment method must be valid
- Payment must be successful (for card payments - verify `paymentIntentId` with payment provider)
- Promo code must be valid (if provided)

**Post-Order Actions (Handled by Backend):**
- Cart is automatically cleared
- Order record is created
- Order confirmation notification is sent
- Inventory is updated (if applicable)
- Payment processing is triggered (if applicable)

**Error Responses:**
- `400 VALIDATION_ERROR`: Invalid order data
- `400 CART_EMPTY`: Cart is empty
- `400 ITEM_NOT_AVAILABLE`: One or more items are not available
- `400 DELIVERY_ADDRESS_REQUIRED`: Delivery address required
- `400 PAYMENT_FAILED`: Payment processing failed
- `401 UNAUTHORIZED`: Authentication required
- `500 INTERNAL_ERROR`: Order creation failed

**Implementation Notes:**
- Always validate checkout before placing order
- For card payments, ensure payment is successful before calling this endpoint
- The `paymentIntentId` should be the Paystack payment reference
- After successful order placement, navigate the user to the order tracking screen
- The cart will be empty after order placement, so refresh the cart state

---

## Order Management API

### 1. Get Order History

**Endpoint:** `GET /orders`

**Description:** Retrieve a paginated list of the user's orders with optional filtering by status and delivery type.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number (1-indexed) |
| `limit` | number | No | 20 | Items per page (max: 50) |
| `status` | string | No | - | Filter by status: "pending", "confirmed", "preparing", "ready", "out-for-delivery", "delivered", "cancelled" |
| `deliveryType` | string | No | - | Filter by delivery type: "door-delivery", "pickup" |

**Example Request:**
```
GET /orders?page=1&limit=20&status=delivered
```

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
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
}
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

**Implementation Notes:**
- Use pagination for large order lists
- Implement infinite scroll or "Load More" functionality using `hasNext`
- Orders are sorted by creation date (newest first)

---

### 2. Get Order Details

**Endpoint:** `GET /orders/:orderId`

**Description:** Retrieve detailed information about a specific order. The `orderId` can be either the MongoDB ObjectId or the order number (e.g., "ORD-2024-001234").

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | Order ID or order number |

**Example Request:**
```
GET /orders/507f1f77bcf86cd799439018
GET /orders/ORD-2024-001234
```

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: Order;  // Full order details
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
    "status": "delivered",
    "deliveryType": "door-delivery",
    "items": [
      {
        "id": "507f1f77bcf86cd799439019",
        "foodItemId": "507f1f77bcf86cd799439014",
        "name": "Jollof Rice",
        "description": "Smoky jollof with grilled chicken wing",
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

**Implementation Notes:**
- Users can only access their own orders
- The endpoint accepts both ObjectId and order number for convenience
- Use this endpoint to show order details in the order details screen

---

### 3. Cancel Order

**Endpoint:** `POST /orders/:orderId/cancel`

**Description:** Cancel an order. Only orders with status "pending" or "confirmed" can be cancelled. Orders that are already being prepared or delivered cannot be cancelled.

**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | Order ID |

**Request Body:**
```typescript
{
  reason?: string;  // Optional: Cancellation reason
}
```

**Example Request:**
```json
{
  "reason": "Changed my mind"
}
```

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: Order;  // Updated order with status "cancelled"
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

**Implementation Notes:**
- Only show cancel option for orders with status "pending" or "confirmed"
- Display appropriate message if cancellation is not allowed
- After cancellation, update the order status in the UI

---

### 4. Reorder

**Endpoint:** `POST /orders/:orderId/reorder`

**Description:** Add all items from a previous order to the current cart. Items and extras that are no longer available will be skipped with a warning.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | Order ID |

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: Cart;  // Updated cart with reordered items
}
```

**Example Response:**
```json
{
  "success": true,
  "message": "Items added to cart",
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
  }
}
```

**Validation Rules:**
- Order must belong to current user
- Items must still be available (unavailable items are skipped with warning)
- Extras must still be available (unavailable extras are skipped with warning)

**Error Responses:**
- `404 ORDER_NOT_FOUND`: Order not found
- `403 FORBIDDEN`: Order does not belong to current user
- `401 UNAUTHORIZED`: Authentication required

**Implementation Notes:**
- After reordering, navigate the user to the cart screen
- Show a message if some items were skipped due to unavailability
- The promo code from the original order is not applied automatically

---

### 5. Get Order Tracking

**Endpoint:** `GET /orders/:orderId/tracking`

**Description:** Get real-time tracking information for an order, including status history and current location (for out-for-delivery orders).

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | Order ID |

**Response Format:**
```typescript
{
  success: boolean;
  message?: string;
  data: {
    order: Order;  // Order details
    tracking: {
      status: OrderStatus;
      statusHistory: Array<{
        status: OrderStatus;
        timestamp: string;  // ISO date string
        message?: string;  // Optional status message
      }>;
      currentLocation?: {  // For out-for-delivery orders
        latitude: number;
        longitude: number;
        address?: string;
        lastUpdated: string;  // ISO date string
      };
      estimatedDeliveryTime?: string;  // ISO date string
      estimatedTimeRemaining?: number;  // Minutes remaining
    };
  };
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

**Implementation Notes:**
- Poll this endpoint periodically (e.g., every 30 seconds) for active orders
- Display status history as a timeline
- Show current location on a map for "out-for-delivery" orders
- `currentLocation` is only available for door-delivery orders with status "out-for-delivery"
- Stop polling when order status is "delivered" or "cancelled"

---

## Data Schemas

### Cart Schema

```typescript
{
  id: string;                    // Cart ID (MongoDB ObjectId as string)
  userId: string;               // User ID
  items: CartItem[];            // Array of cart items
  subtotal: number;             // Sum of all item prices * quantities (in kobo)
  extrasTotal: number;          // Sum of all extras (in kobo)
  discountAmount: number;       // Discount from promo code (in kobo)
  discountPercent?: number;     // Discount percentage (if promo applied)
  promoCode?: string;           // Applied promo code
  total: number;                // Final total (subtotal + extras - discount) (in kobo)
  formattedTotal: string;       // Formatted total (e.g., "₦4,000")
  itemCount: number;            // Total number of items (sum of quantities)
  extrasCount: number;          // Total number of extras
  createdAt: string;            // ISO date string
  updatedAt: string;            // ISO date string
}
```

### CartItem Schema

```typescript
{
  id: string;                   // Cart item ID (MongoDB ObjectId as string)
  foodItemId: string;           // Reference to FoodItem
  name: string;                 // Product name
  description: string;          // Product description
  slug: string;                 // URL-friendly identifier
  price: number;                // Unit price (in kobo)
  formattedPrice: string;       // Formatted price (e.g., "₦1,500")
  currency: string;             // Currency code (e.g., "NGN")
  imageUrl: string;             // Product image URL
  quantity: number;             // Quantity in cart (min: 1, max: 99)
  extras?: CartExtra[];         // Selected extras for this cart item
  subtotal: number;            // Item price * quantity (in kobo)
  extrasTotal: number;          // Total price of all extras (in kobo)
  lineTotal: number;            // subtotal + extrasTotal (in kobo)
  estimatedTime?: {             // Estimated preparation time
    min: number;                // Minimum minutes
    max: number;                // Maximum minutes
  };
  createdAt: string;            // ISO date string
  updatedAt: string;            // ISO date string
}
```

### CartExtra Schema

```typescript
{
  id: string;                   // Cart extra ID (MongoDB ObjectId as string)
  foodExtraId: string;          // Reference to FoodExtra
  name: string;                 // Extra name
  description?: string;         // Optional description
  price: number;                // Price (in kobo)
  formattedPrice: string;       // Formatted price (e.g., "₦500" or "Free")
  currency: string;             // Currency code
  quantity: number;             // Quantity of this extra (usually 1)
}
```

### Order Schema

```typescript
{
  id: string;                   // Order ID (MongoDB ObjectId as string)
  orderNumber: string;          // Human-readable order number (e.g., "ORD-2024-001234")
  userId: string;               // User ID
  status: OrderStatus;         // Order status
  deliveryType: DeliveryType;  // "door-delivery" | "pickup"
  items: OrderItem[];           // Array of ordered items
  subtotal: number;            // Sum of all item prices (in kobo)
  extrasTotal: number;          // Sum of all extras (in kobo)
  deliveryFee: number;          // Delivery fee (in kobo, 0 for pickup)
  discountAmount: number;       // Discount from promo code (in kobo)
  discountPercent?: number;     // Discount percentage (if promo applied)
  promoCode?: string;           // Applied promo code
  total: number;                // Final total (in kobo)
  formattedTotal: string;       // Formatted total (e.g., "₦3,950")
  itemCount: number;           // Total number of items
  extrasCount: number;          // Total number of extras
  deliveryAddress?: DeliveryAddress;  // Delivery address (for door-delivery)
  pickupLocationId?: string;    // Pickup location ID (for pickup)
  estimatedDeliveryTime?: string;     // ISO date string
  estimatedPreparationTime?: number;  // Minutes
  paymentStatus: PaymentStatus; // "pending" | "paid" | "failed" | "refunded"
  paymentMethod?: string;       // Payment method (e.g., "card", "cash", "wallet")
  paymentIntentId?: string;     // Payment intent ID (for card payments)
  instructions?: string;       // Special delivery/order instructions
  createdAt: string;            // ISO date string
  updatedAt: string;            // ISO date string
  deliveredAt?: string;         // ISO date string (when delivered)
  cancelledAt?: string;         // ISO date string (when cancelled)
  cancellationReason?: string; // Reason for cancellation (if cancelled)
}
```

### OrderItem Schema

```typescript
{
  id: string;                   // Order item ID
  foodItemId: string;           // Reference to FoodItem
  name: string;                 // Product name
  description: string;          // Product description
  slug: string;                 // URL-friendly identifier
  price: number;                // Unit price (in kobo)
  formattedPrice: string;       // Formatted price
  currency: string;             // Currency code
  imageUrl: string;             // Product image URL
  quantity: number;             // Quantity ordered
  extras?: OrderExtra[];        // Selected extras
  lineTotal: number;            // (price * quantity) + extras total (in kobo)
}
```

### OrderExtra Schema

```typescript
{
  id: string;                   // Order extra ID
  foodExtraId: string;          // Reference to FoodExtra
  name: string;                 // Extra name
  price: number;                // Price (in kobo)
  formattedPrice: string;       // Formatted price
  quantity: number;             // Quantity (usually 1)
}
```

### DeliveryAddress Schema

```typescript
{
  id?: string;                  // Saved location ID (if from saved locations)
  address: string;              // Full address string
  street?: string;              // Street address
  city?: string;                // City
  state?: string;               // State
  country: string;               // Country (default: "Nigeria")
  postalCode?: string;          // Postal/ZIP code
  coordinates?: {                // GPS coordinates
    latitude: number;
    longitude: number;
  };
  instructions?: string;        // Delivery instructions
  contactPhone?: string;        // Contact phone for delivery
}
```

### OrderStatus Enum

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

### DeliveryType Enum

```typescript
type DeliveryType = "door-delivery" | "pickup";
```

### PaymentStatus Enum

```typescript
type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
```

---

## Error Handling

### Standard Error Response Format

All error responses follow this format:

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

### Error Handling Best Practices

1. **Always check the `success` field** in responses before accessing `data`
2. **Display user-friendly error messages** from the `error.message` field
3. **Handle network errors** gracefully (timeout, no connection, etc.)
4. **Retry failed requests** for transient errors (5xx status codes)
5. **Validate input** on the frontend before sending requests
6. **Show loading states** during API calls
7. **Handle 401 errors** by redirecting to login and refreshing tokens

---

## Integration Best Practices

### 1. Cart Management

- **Sync cart on app start**: Fetch the user's cart when the app initializes
- **Optimistic updates**: Update UI immediately, then sync with backend
- **Handle conflicts**: If cart is modified on another device, show a conflict resolution UI
- **Persist cart state**: Cache cart locally for offline viewing (but always sync when online)
- **Auto-refresh**: Refresh cart after each cart operation

### 2. Checkout Flow

- **Validate before showing checkout**: Call `/checkout/validate` before displaying the checkout screen
- **Show delivery fee**: Display calculated delivery fee prominently
- **Show estimated time**: Display estimated delivery/preparation time
- **Handle validation errors**: Show errors clearly and prevent order placement if invalid
- **Payment integration**: Ensure payment is successful before calling place order
- **Clear cart after order**: Refresh cart state after successful order placement

### 3. Order Management

- **Poll tracking for active orders**: Poll `/orders/:orderId/tracking` every 30 seconds for orders with status "pending", "confirmed", "preparing", "ready", or "out-for-delivery"
- **Stop polling**: Stop polling when order is "delivered" or "cancelled"
- **Show status history**: Display order status history as a timeline
- **Map integration**: Show current location on map for "out-for-delivery" orders
- **Infinite scroll**: Implement infinite scroll or "Load More" for order history
- **Filter and search**: Allow users to filter orders by status and delivery type

### 4. Promo Codes

- **Validate before applying**: Show validation feedback when user enters a promo code
- **Clear error messages**: Show specific error messages for invalid codes
- **Display discount**: Show discount amount and percentage clearly
- **Remove option**: Always provide option to remove promo code

### 5. Price Formatting

- **Always use formatted prices**: Display `formattedPrice` to users, use `price` (in kobo) for calculations
- **Currency display**: Show currency symbol (₦ for NGN)
- **Consistent formatting**: Use the same formatting across the app

### 6. Offline Handling

- **Queue operations**: Queue cart operations when offline, sync when online
- **Show offline indicator**: Inform users when they're offline
- **Cache data**: Cache order history and cart for offline viewing
- **Sync on reconnect**: Automatically sync when connection is restored

### 7. Performance

- **Debounce search**: Debounce search inputs to reduce API calls
- **Pagination**: Always use pagination for lists
- **Lazy loading**: Load order details only when needed
- **Image optimization**: Use appropriate image sizes for thumbnails vs. full images

### 8. User Experience

- **Loading states**: Show loading indicators during API calls
- **Success feedback**: Show success messages after operations
- **Error recovery**: Provide clear actions to recover from errors
- **Empty states**: Show helpful empty states for empty carts/order lists
- **Optimistic updates**: Update UI immediately for better perceived performance

---

## Important Notes

1. **No Separate Promo Code Validation Endpoint**: The spec document mentions `POST /promo-codes/validate`, but this endpoint is not implemented. Promo code validation happens automatically when applying to cart via `POST /cart/promo-code`.

2. **Order Status Updates**: Order status updates are handled by admin/restaurant staff via `PATCH /orders/:orderId/status` (not available to customers). Customers should poll the tracking endpoint to get status updates.

3. **Cart Expiry**: Carts expire after 1 month of inactivity (handled automatically by the backend).

4. **Price Units**: All prices are in kobo (smallest currency unit). 1 NGN = 100 kobo. Always use `formattedPrice` for display and `price` for calculations.

5. **Delivery Fee**: Delivery fee is 0 for pickup orders. For door-delivery, the fee is calculated based on location and distance.

6. **Payment Integration**: For card payments, ensure you have a valid `paymentIntentId` from your payment provider (Paystack) before calling place order.

7. **Order Number Format**: Order numbers follow the format `ORD-YYYY-XXXXXX` where YYYY is the year and XXXXXX is a sequential number.

---

## Testing Checklist

Before releasing to production, ensure you've tested:

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
- [ ] Cart totals calculation

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
- [ ] Polling stops when order delivered/cancelled

### Error Handling
- [ ] 400 errors (validation, bad request)
- [ ] 401 errors (unauthorized - redirect to login)
- [ ] 403 errors (forbidden)
- [ ] 404 errors (not found)
- [ ] 500 errors (server error - retry logic)

---

## Support

For questions or issues with the API integration, contact the backend development team or refer to the Swagger documentation at:
- Development: `http://localhost:3000/docs`
- Production: `https://api.surespot.app/docs` (when available)

---

*Last updated: Based on actual codebase implementation - December 2025*

