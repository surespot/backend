# Surespot Application Style Guide & Overview

This document outlines the design language and core functionality of the Surespot application. It serves as a comprehensive reference for maintaining visual and functional consistency across the customer application and the upcoming rider-specific application.

## 1. Application Overview

**Surespot** is a modern food delivery platform designed to connect users with their favorite local restaurants and food vendors. The platform focuses on a premium, reliable, and seamless experience for food discovery, ordering, and delivery.

### Core Value Proposition

- **Convenience**: Easy discovery and ordering from nearby spots.
- **Reliability**: Real-time tracking from the kitchen to the customer's door.
- **Personalization**: Tailored recommendations and easy access to favorite/recent orders.

---

## 2. Customer Application Features

The customer app is the primary interface for food discovery and ordering. Key features include:

### 🔐 Authentication & Profile

- **Multi-channel Login**: Secure authentication via phone number or email with OTP verification.
- **Profile Management**: Personalized user profiles with saved preferences and basic information.

### 🗺️ Location & Address Management

- **Smart Geolocation**: Automatic detection of current location for quick ordering.
- **Saved Places**: Users can manage multiple delivery addresses (Home, Office, etc.) for a faster checkout experience.

### 🍕 Discovery & Catalog

- **Category Browsing**: Visual navigation through food categories (e.g., Rice, Snacks, Drinks).
- **Advanced Search**: Find specific dishes or restaurants quickly.
- **Product Details**: Comprehensive view of food items including pricing, ratings, estimated preparation time, and nutritional tags.
- **Favorites & History**: "Saved for Later" and "Recently Viewed" sections for personalized browsing.

### 🛒 Shopping Experience

- **Dynamic Cart**: Real-time updates of subtotals, delivery fees, and total costs.
- **Flexible Checkout**: Support for both Door Delivery and Pickup options, with multiple payment methods including Paystack integration.
- **Promo System**: Integrated discount and promotional code system with visual banners on the home screen.

### 📦 Order Tracking & History

- **Live Status**: Real-time updates on order progress (Pending, Preparing, Ready, Out for Delivery, Delivered).
- **Comprehensive History**: Easy access to past orders with the ability to rate and review specific items.

### 🔔 Communications & Support

- **Notification Center**: Real-time alerts for order status changes and promotional offers.
- **Robust Support**: In-app forms for order disputes, delivery issues, and technical support.

---

## 3. Typography

The application uses **Cerebri Sans Pro** as its primary font family.

- **Font Family:** `CerebriSansPro`
- **Weights & Font Names:**
  - **Bold:** `CerebriSansPro-Bold`
  - **SemiBold:** `CerebriSansPro-SemiBold`
  - **Medium:** `CerebriSansPro-Medium`
  - **Regular:** `CerebriSansPro-Regular`
  - **Light:** `CerebriSansPro-Light`

- **Standard Sizes & Usage:**
  - **Hero Title:** `32px` (Line height: `36px`, Weight: `Bold`)
  - **Screen Header:** `20px` - `24px` (Weight: `Bold` or `SemiBold`)
  - **Section Title:** `20px` (Weight: `SemiBold`)
  - **Card Title:** `18px` (Weight: `Bold`)
  - **Primary Body:** `14px` - `16px` (Weight: `Regular` or `Medium`)
  - **Metadata/Labels:** `10px` - `12px` (Weight: `Medium` or `Regular`)

---

## 4. Color Palette

The palette is built around warm golds, neutral creams, and functional greens/reds.

### Gold & Yellow (Brand Colors)

| Color Name | Hex Code | Usage |
| :--- | :--- | :--- |
| **Main Gold** | `#FFD700` | Primary buttons, active icons, primary highlights |
| **Deep Gold** | `#E6BF00` | Prices, high-contrast labels, primary text accents |
| **CTA Yellow** | `#F9D326` | Onboarding "Get Started" buttons |
| **Muted Gold** | `#FFE074` | Badge backgrounds, secondary highlights |
| **Pale Gold** | `#FFEDB5` | Accent backgrounds, input field borders |
| **Light Cream Gold** | `#FFF1CF` | Subtle row highlights, secondary backgrounds |

### Neutrals (Backgrounds & Text)

| Color Name | Hex Code | Usage |
| :--- | :--- | :--- |
| **App Background** | `#FFFBEA` | Signature cream background used across all screens |
| **Primary Text** | `#1F1F1F` | Main readable content, headers |
| **Secondary Text** | `#7A7A7A` | Descriptions, sub-titles, muted info |
| **Dark Accents** | `#1B1B1B` | Deep contrast text or icons |
| **Card Background** | `#FFFFFF` | Individual item cards, white list items |
| **Surface Gray** | `#F2F2F2` | Background for sections or secondary cards |
| **Divider Gray** | `#E0E0E0` | Borders, separators, disabled buttons |

### Functional Colors (Status)

| Color Name | Hex Code | Usage |
| :--- | :--- | :--- |
| **Success Green** | `#2DBE7E` | Status indicators, success messages |
| **Status Ready** | `#66BB6A` | "Ready" or "Delivered" order status |
| **Error Red** | `#D32F2F` | Critical alerts, "Liked" heart icon, delete actions |
| **Warning Orange** | `#FF9800` | Warnings, "Pending" status |
| **Alert Red** | `#FF6B6B` | Error text, critical warning icons |

---

## 5. Spacing & Grid

A consistent spacing system ensures a clean layout across different screen sizes.

- **Global Screen Margin:** `24px` (Applied to `paddingHorizontal` of the main container).
- **Vertical Section Spacing:** `24px` to `28px` between major UI blocks.
- **Component Gaps:**
  - **Large Gap:** `16px` (Between cards in a list).
  - **Medium Gap:** `12px` (Between grouped elements).
  - **Small Gap:** `8px` (Between labels and their icons).
- **Bottom Navigation Clearance:** Always include a `paddingBottom` of `100px` - `120px` on scrollable content to ensure it isn't hidden by the fixed bottom nav bar.

---

## 6. Component Specifications

### Buttons

* **Primary CTA:** Height `54px`, Border Radius `999px` (Pill), Background `#FFD700`.
- **Secondary/Action:** Height `40px` - `50px`, Border Radius `12px` or `20px`.
- **Back Button:** Circular, `40px` diameter, Background `#E0E0E0` or `#FFFFFF`.

### Cards & Containers

* **Main Cards:** Border Radius `24px`, Background `#FFFFFF`.
- **Secondary Cards:** Border Radius `16px`, Background `#F2F2F2`.
- **Shadow Profile:**
  - `shadowColor: '#2E2E2E'`
  - `shadowOpacity: 0.08`
  - `shadowOffset: { width: 0, height: 8 }`
  - `shadowRadius: 24`
  - `elevation: 3` (Android)

### Input Fields

* **Height:** `52px`
- **Border Radius:** `12px`
- **Background:** `#EDEDED` or `#F2F2F2`
- **Placeholder Color:** `#9E9E9E`

---

## 7. UI Arrangement Rules

- **Header Layout:** Use `flexDirection: 'row'`, `justifyContent: 'space-between'`, and `alignItems: 'center'`.
- **Icons:** Use `Feather` or `Ionicons`. Standard icon size is `18px` to `22px`.
- **Feedback:** All interactive elements (`Pressable`) should have an active opacity or visual change.
- **Loading:** Use Skeleton loaders that match the component's dimensions and border radius exactly.

---

## 8. Backend Architecture & Context

This section provides technical context for the backend API that powers the Surespot applications.

### Technology Stack

- **Framework:** NestJS (Node.js)
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT (JSON Web Tokens) with Passport.js
- **Queue System:** BullMQ with Redis
- **Real-time:** WebSocket (Socket.IO) for live notifications
- **File Storage:** Cloudinary for image uploads
- **Payment Gateway:** Paystack integration
- **Email Service:** Gmail SMTP via @nestjs-modules/mailer
- **SMS Service:** BulkSMS Nigeria API
- **Push Notifications:** Expo Push Notification Service
- **API Documentation:** Swagger/OpenAPI (available at `/docs`)

### API Structure

The backend follows a modular architecture with feature-based modules:

#### Core Modules

- **`auth`** - Authentication, authorization, user management, OTP verification
- **`cart`** - Shopping cart management with automatic expiration
- **`food-items`** - Food catalog, categories, extras, and interactions
- **`orders`** - Order placement, tracking, status management
- **`transactions`** - Payment processing via Paystack
- **`notifications`** - Multi-channel notifications (in-app, email, SMS, push)
- **`saved-locations`** - User address management
- **`pickup-locations`** - Restaurant/pickup point management
- **`promotions`** - Discount codes and promotional campaigns
- **`regions`** - Geographic region management (admin)
- **`mail`** - Email templating and delivery
- **`sms`** - SMS message building and delivery
- **`queue`** - Background job processing with BullMQ

### Database Schema Overview

#### Core Entities

**Users**
- Phone/Email authentication
- Profile information (name, birthday, avatar)
- Email verification status
- Push notification tokens
- Role-based access control

**Orders**
- Order number format: `ORD-YYYY-XXXXXX`
- Status flow: `pending` → `confirmed` → `preparing` → `ready` → `out-for-delivery` → `delivered`
- Delivery types: `door-delivery`, `pickup`
- Payment status: `pending`, `paid`, `failed`, `refunded`
- Pricing in kobo (₦1 = 100 kobo)

**Food Items**
- Categories, extras, and interactions
- Availability and active status
- Estimated preparation time ranges
- Image storage via Cloudinary

**Cart**
- Automatic expiration (scheduled cleanup)
- Support for extras and quantity management
- Promo code application

**Notifications**
- Multi-channel support (in-app, email, SMS, push)
- Type-based categorization
- Read/unread status tracking
- WebSocket real-time delivery

### Notification System

The notification system uses a queue-based architecture for reliable delivery:

#### Channels
- **IN_APP:** Real-time WebSocket + database polling fallback
- **EMAIL:** Gmail SMTP with Handlebars templates
- **SMS:** BulkSMS Nigeria API integration
- **PUSH:** Expo Push Notification Service

#### Notification Types
- Order lifecycle: `order_placed`, `order_confirmed`, `order_preparing`, `order_ready`, `order_out_for_delivery`, `order_delivered`, `order_cancelled`
- Payment: `payment_success`, `payment_failed`
- General: `promotion`, `general`

#### Email Templates
- **OTP Verification:** Registration, password reset, email verification
- **Order Placed:** Order confirmation with items and delivery details
- **Order Delivered:** Delivery confirmation
- **Payment Success/Failed:** Transaction status notifications

### Payment Integration

**Paystack Integration:**
- `POST /transactions/initialize` - Initialize payment, receive authorization URL
- `POST /transactions/verify` - Verify payment status
- Webhook support for payment status updates
- Automatic order status updates based on payment verification

**Payment Flow:**
1. Client initializes payment via `/transactions/initialize`
2. User completes payment on Paystack
3. Backend verifies payment via webhook or manual verification
4. Order status updated to `paid` on successful verification

### File Upload

**Cloudinary Integration:**
- Profile picture uploads
- Food item images
- Automatic optimization and CDN delivery
- Supported formats: JPEG, PNG, WebP
- Max file size: 5MB

### Queue System

**BullMQ with Redis:**
- Background job processing for notifications
- Retry logic with exponential backoff
- Job persistence and monitoring
- Separate queues for different notification channels

### API Response Format

All API responses follow a consistent structure:

```typescript
{
  success: boolean;
  message?: string;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
```
