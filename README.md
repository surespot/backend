# SureSpot Backend API

NestJS backend for the SureSpot food delivery mobile application.

## Prerequisites

- Node.js v18+ 
- Docker & Docker Compose
- npm or yarn

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Services

Start MongoDB and Redis using Docker Compose:

```bash
docker compose up -d
```

Check services are running:

```bash
docker compose ps
```

### 3. Configure Environment

Copy the development environment file:

```bash
cp .env.development .env
```

Update Cloudinary credentials in `.env` if you plan to test file uploads.

### 4. Start the Application

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`

Swagger documentation: `http://localhost:3000/docs`

## Docker Services

### MongoDB

- **Port:** 27017
- **Username:** surespot
- **Password:** surespot_dev_password
- **Database:** surespot
- **Connection String:** `mongodb://surespot:surespot_dev_password@localhost:27017/surespot?authSource=admin`

### Redis

- **Port:** 6379
- **Password:** surespot_redis_password
- **Ready for future caching implementation**

### Managing Services

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f mongodb

# Restart services
docker compose restart

# Remove all data (⚠️ destroys volumes)
docker compose down -v
```

## Available Scripts

```bash
# Development
npm run start:dev          # Start with hot-reload
npm run start:debug        # Start in debug mode

# Build
npm run build              # Build for production

# Linting & Formatting
npm run lint               # Run ESLint
npm run format             # Format code with Prettier

# Testing
npm run test               # Run unit tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Generate coverage report
npm run test:e2e           # Run end-to-end tests

# Production
npm run start:prod         # Start production build
```

## Project Structure

```
src/
├── common/                 # Shared modules (Cloudinary, etc.)
│   └── cloudinary/
├── modules/                # Feature modules
│   └── auth/              # Authentication module
│       ├── dto/           # Data transfer objects
│       ├── schemas/       # Mongoose schemas
│       ├── auth.controller.ts
│       ├── auth.service.ts
│       ├── auth.repository.ts
│       └── auth.module.ts
├── app.module.ts          # Root module
└── main.ts                # Application entry point
```

## Authentication Endpoints

### Registration Flow

1. `POST /auth/phone/send-otp` - Send OTP to phone
2. `POST /auth/phone/verify-otp` - Verify OTP code
3. `POST /auth/password/create` - Create password
4. `POST /auth/profile/complete` - Complete profile & get tokens

### Login & Token Management

- `POST /auth/login` - Login with phone + password
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout & revoke token

### Password Reset

1. `POST /auth/password/reset/send-otp` - Send reset OTP
2. `POST /auth/password/reset/verify-otp` - Verify reset OTP
3. `POST /auth/password/reset/update` - Update password

See full API documentation at `/docs` when running the server.

## Testing Auth Flow

1. **Start the server and MongoDB:**
   ```bash
   docker compose up -d
   npm run start:dev
   ```

2. **Send OTP** (check console logs for the code):
   ```bash
   curl -X POST http://localhost:3000/auth/phone/send-otp \
     -H "Content-Type: application/json" \
     -d '{"phone": "+2349012345678", "countryCode": "+234"}'
   ```

3. **Verify OTP:**
   ```bash
   curl -X POST http://localhost:3000/auth/phone/verify-otp \
     -H "Content-Type: application/json" \
     -d '{"phone": "+2349012345678", "otp": "123456"}'
   ```

4. **Continue with the flow using Swagger UI** at `http://localhost:3000/docs`

## Environment Variables

See `.env.development` for all available configuration options.

Key variables:

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for signing JWT tokens (change in production!)
- `JWT_ACCESS_EXPIRY` - Access token expiry (default: 1h)
- `JWT_REFRESH_EXPIRY` - Refresh token expiry (default: 30d)
- `OTP_EXPIRY_MINUTES` - OTP code validity (default: 5)
- `CLOUDINARY_*` - Cloudinary credentials for file uploads

## MongoDB Connection

### Using MongoDB Compass

Connection string:
```
mongodb://surespot:surespot_dev_password@localhost:27017/surespot?authSource=admin
```

### Using MongoDB Shell

```bash
docker compose exec mongodb mongosh -u surespot -p surespot_dev_password --authenticationDatabase admin surespot
```

## Features

✅ Phone-based authentication with OTP  
✅ JWT access & refresh tokens with rotation  
✅ Password reset flow  
✅ Bcrypt password hashing  
✅ Rate limiting & throttling  
✅ Input validation with class-validator  
✅ Swagger API documentation  
✅ Winston logging  
✅ MongoDB with Mongoose ODM  
✅ Cloudinary integration (ready for media uploads)  

## TODO

- [ ] Integrate SMS provider for OTP delivery (currently logs to console)
- [ ] Add Google OAuth authentication
- [ ] Implement JWT Guards for protected routes
- [ ] Add unit and e2e tests
- [ ] Create user profile management endpoints
- [ ] Implement food listings module

## Security Notes

⚠️ **Development Environment Only**

The credentials in `compose.yml` and `.env.development` are for local development only.

**Before deploying to production:**

1. Change all passwords and secrets
2. Use environment-specific configuration
3. Enable SSL/TLS for database connections
4. Set up proper secret management (AWS Secrets Manager, etc.)
5. Review and harden CORS settings
6. Enable rate limiting at the network level

## Support

For questions or issues, refer to:
- `plan.md` - Complete API specification
- `AUTH_MODULE_README.md` - Auth module documentation
- Swagger docs at `/docs`

## License

Private - All Rights Reserved
