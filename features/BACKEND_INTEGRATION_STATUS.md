# Backend Integration Status

A simple overview of features that have been backend integrated and those that still need backend integration.

---

## ✅ Backend Integrated Features

### Authentication
- Phone registration (send OTP, verify OTP, resend OTP)
- Email registration (send OTP, verify OTP, resend OTP)
- Password creation
- Profile completion
- Login (email/phone + password)
- Password reset (phone & email)
- Token refresh
- Logout

### Saved Locations
- Create saved location
- Get all saved locations
- Get saved location by ID
- Update saved location
- Delete saved location

### Promotions
- Fetch active promotions

### Products & Catalog
- Food items listing with pagination, filtering, and sorting
- Product details (by ID or slug)
- Search functionality with relevance scoring
- Categories API with item counts
- Related items ("People Also Order")
- Extras/add-ons support

### Cart & Checkout
- Get cart
- Add item to cart
- Update cart item quantity
- Remove cart item
- Clear cart
- Apply promo code
- Remove promo code
- Validate checkout (delivery fee calculation, address validation)

### Orders
- Place order (door-delivery & pickup)
- Get order history (paginated, filtered by status/delivery type)
- Get order details (by ID or order number)
- Cancel order
- Reorder items
- Order tracking (with status history and location updates)
- Update order status (Admin/Rider only)

### Notifications
- Fetch notifications (paginated, filtered by read status and type)
- Get unread notification count
- Mark notification as read
- Mark all notifications as read
- Delete notification
- Delete all notifications

---

## ❌ Features Needing Backend Integration

### User Data
- Recently viewed items (local storage only)
- Saved for later items (local storage only)
- Profile updates (change email/phone - UI exists but no API calls)
- User preferences/settings

### Reviews & Ratings
- Submit reviews/ratings (UI exists but no API calls)
- View reviews/ratings

### Notification Preferences
- User notification preferences/settings (channels, types)

### Support
- Contact support (UI exists but no API calls)
- Order disputes (UI exists but no API calls)
- Delivery problems (UI exists but no API calls)

---

*Last updated: December 2025 - Based on current codebase analysis*

