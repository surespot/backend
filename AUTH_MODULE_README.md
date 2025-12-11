# Auth Module Implementation

This document summarizes the auth module implementation based on the plan.md specification.

## What Was Implemented

### 1. Folder Structure
- Moved Cloudinary to `src/common/cloudinary`
- Created `src/modules/auth` for all authentication-related code

### 2. Mongoose Schemas
Three schemas were created following the plan.md data models:

- **User Schema** (`src/modules/auth/schemas/user.schema.ts`)
  - Fields: firstName, lastName, phone, email, password, birthday, avatar, googleId
  - Verification flags: isPhoneVerified, isEmailVerified
  - User roles: user, restaurant, admin
  - Soft delete support with deletedAt field
  - Proper indexes on phone, email, googleId

- **OTP Code Schema** (`src/modules/auth/schemas/otp-code.schema.ts`)
  - Fields: phone, code, purpose (registration/password_reset), attempts, expiresAt
  - TTL index on expiresAt for automatic cleanup
  - Max 5 attempts before invalidation

- **Refresh Token Schema** (`src/modules/auth/schemas/refresh-token.schema.ts`)
  - Fields: userId, token, family, isRevoked, expiresAt
  - Token rotation support via family tracking
  - TTL index for automatic cleanup

### 3. Repository Layer
**AuthRepository** (`src/modules/auth/auth.repository.ts`) provides data access methods:

**User operations:**
- findUserByPhone, findUserByEmail, findUserById, findUserByGoogleId
- createUser, updateUser, updateLastLoginAt, softDeleteUser

**OTP operations:**
- createOtpCode, findLatestOtpCode, incrementOtpAttempts
- markOtpAsVerified, invalidateOtpCodes

**Refresh token operations:**
- createRefreshToken, findRefreshToken, revokeRefreshToken
- revokeTokenFamily, revokeAllUserTokens

### 4. DTOs with Validation
Created 11 DTOs with class-validator decorators and Swagger annotations:

- `send-otp.dto.ts` - Phone and country code validation
- `verify-otp.dto.ts` - 6-digit OTP validation
- `resend-otp.dto.ts` - Phone validation
- `create-password.dto.ts` - Password strength validation (8+ chars, uppercase, lowercase, number, special)
- `complete-profile.dto.ts` - Name, birthday, phone validation
- `login.dto.ts` - Phone and password
- `refresh-token.dto.ts` - Refresh token string
- `logout.dto.ts` - Refresh token for revocation
- `password-reset-send-otp.dto.ts` - Phone validation
- `password-reset-verify-otp.dto.ts` - Phone and OTP
- `password-reset-update.dto.ts` - New password with validation

All DTOs include:
- `@ApiProperty()` decorators for Swagger documentation
- Phone number regex validation for international format
- Password complexity requirements matching plan.md

### 5. Auth Service
**AuthService** (`src/modules/auth/auth.service.ts`) implements business logic for:

#### Registration Flow
1. `sendOtp()` - Generate and send 6-digit OTP (rate limited to 1 per 30s)
2. `verifyOtp()` - Verify OTP code (max 5 attempts, 5 min expiry)
3. `resendOtp()` - Resend new OTP, invalidating previous ones
4. `createPassword()` - Create user with hashed password (bcrypt rounds: 12)
5. `completeProfile()` - Update user profile and return JWT tokens

#### Login Flow
6. `login()` - Authenticate with phone+password, return tokens
7. `refresh()` - Token rotation with family tracking for theft detection
8. `logout()` - Revoke refresh token

#### Password Reset Flow
9. `passwordResetSendOtp()` - Send OTP for password reset
10. `passwordResetVerifyOtp()` - Verify reset OTP
11. `passwordResetUpdate()` - Update password and auto-login

#### Security Features
- Bcrypt password hashing (12 rounds)
- JWT token generation with configurable expiry
- Token rotation on refresh (invalidates old token)
- Token family tracking to detect theft
- Rate limiting on OTP requests
- OTP expiry and max attempts
- Validation that new password differs from old

### 6. Auth Controller
**AuthController** (`src/modules/auth/auth.controller.ts`) provides 11 REST endpoints:

- `POST /auth/phone/send-otp` - Start registration
- `POST /auth/phone/verify-otp` - Verify phone number
- `POST /auth/phone/resend-otp` - Resend OTP
- `POST /auth/password/create` - Create password (requires X-Verification-Token header)
- `POST /auth/profile/complete` - Complete profile (requires X-Verification-Token header)
- `POST /auth/login` - Login with phone+password
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout and revoke refresh token
- `POST /auth/password/reset/send-otp` - Start password reset
- `POST /auth/password/reset/verify-otp` - Verify reset OTP
- `POST /auth/password/reset/update` - Update password (requires X-Reset-Token header)

All endpoints include:
- Swagger `@ApiOperation()` and `@ApiResponse()` decorators
- Example request/response schemas matching plan.md
- Proper HTTP status codes (200, 201, 400, 401, 409, 429)

### 7. Module Wiring
**AuthModule** (`src/modules/auth/auth.module.ts`):
- Registers User, OtpCode, RefreshToken schemas with MongooseModule
- Configures JwtModule with JWT_SECRET from environment
- Exports AuthService and AuthRepository for use in other modules

**AppModule** updated to import AuthModule.

### 8. Error Responses
All service methods throw NestJS exceptions with custom error shapes matching plan.md:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Error codes implemented:
- `PHONE_ALREADY_REGISTERED`
- `OTP_RATE_LIMITED`
- `OTP_INVALID`
- `OTP_EXPIRED`
- `OTP_MAX_ATTEMPTS`
- `AUTH_TOKEN_INVALID`
- `AUTH_TOKEN_EXPIRED`
- `AUTH_CREDENTIALS_INVALID`
- `AUTH_ACCOUNT_SUSPENDED`
- `VALIDATION_ERROR`
- `RESOURCE_NOT_FOUND`

## Environment Variables Required

See `env.example` for a complete list. Key variables:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/surespot
MONGODB_DB_NAME=surespot

# JWT
JWT_SECRET=your-secret-key-change-this-in-production
JWT_ACCESS_EXPIRY=1h
JWT_REFRESH_EXPIRY=30d

# OTP
OTP_EXPIRY_MINUTES=5
OTP_RESEND_SECONDS=30
OTP_MAX_ATTEMPTS=5
```

## Not Yet Implemented

Per the plan, the following were intentionally excluded:

1. **Google OAuth** - Will be added in a future iteration
2. **SMS Service Integration** - OTP codes are currently logged to console. Integrate with an SMS provider (Twilio alternatives) when ready.
3. **Actual file uploads** - Cloudinary service is ready but no file upload endpoints yet
4. **JWT Guards/Strategies** - Basic JWT module is configured but Passport strategies for protecting routes will be added when implementing protected endpoints (user profile, food listings, etc.)

## Testing

To test the auth endpoints:

1. Ensure MongoDB is running
2. Copy `env.example` to `.env` and configure
3. Run `npm run start:dev`
4. Visit `http://localhost:3000/docs` to see Swagger UI
5. Test the registration flow:
   - POST `/auth/phone/send-otp`
   - POST `/auth/phone/verify-otp` (use OTP from console logs)
   - POST `/auth/password/create` (include X-Verification-Token header)
   - POST `/auth/profile/complete` (include X-Verification-Token header)
6. Test login with the phone+password you created

## Next Steps

1. Integrate an SMS service for OTP delivery
2. Add Google OAuth endpoints
3. Implement JWT authentication guards
4. Create user profile management endpoints
5. Add unit and e2e tests for auth flows
6. Implement rate limiting at the IP level (currently configured globally via Throttler)

