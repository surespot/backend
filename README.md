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
- **Used for:** BullMQ job queue (notifications processing)
- **Connection:** Handled automatically by BullMQ

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

## Docker Deployment

The project includes Docker configuration for development and production environments.

### Compose Files

| File | Use Case |
|------|----------|
| `compose.yml` | Local dev services only (MongoDB, Redis) |
| `compose-dev.yml` | Full dev stack with app (builds from source, hot-reload) |
| `compose-dev-deploy.yml` | CI deployment for dev (uses pre-built image) |
| `compose-prod.yml` | Production (MongoDB Atlas, Redis container) |

### Local Development with Docker

Run the full dev stack (app + MongoDB + Redis) with hot-reload:

```bash
docker compose -f compose-dev.yml up -d --build
```

App: `http://localhost:4000` | Swagger: `http://localhost:4000/docs`

### Production Build (Local Test)

```bash
docker build -t surespot-backend:prod .
docker run -p 3000:3000 --env-file .env.production surespot-backend:prod
```

### GitHub Actions Deployment

Automated deployment to a VPS on push:

- **Dev:** Push to `develop` → deploys to port 4000
- **Prod:** Push to `main` → deploys to port 3000

#### Required GitHub Secrets

In **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | Server IP address |
| `VPS_USER` | SSH username (e.g. `root`, `ubuntu`) |
| `VPS_SSH_KEY` | Private SSH key (full PEM content) |
| `VPS_SSH_PORT` | SSH port (optional, default: 22) |

#### Server Setup

See [docs/server-setup-guide.md](docs/server-setup-guide.md) for the full step-by-step guide. Summary:

1. Install Docker and Docker Compose on the VPS
2. Create deploy directory: `mkdir -p /opt/surespot-backend && cd /opt/surespot-backend`
3. Clone the repo or copy `compose-dev-deploy.yml`, `compose-prod.yml` to the server (e.g. `git clone` or `scp`)
4. Create `.env.development` and `.env.production` with required variables
5. For production: set `MONGODB_URI` to your MongoDB Atlas connection string
6. For production: set `REDIS_PASSWORD=surespot_redis_prod_password` in `.env.production`
7. Whitelist VPS IP in MongoDB Atlas network access
8. Grant package read permissions: Settings → Actions → General → Workflow permissions → Read and write
9. For private repos: on the VPS, run `docker login ghcr.io` with a GitHub PAT for pulling images

#### First-Time Production Seed

After deploying production, run the seed script:

```bash
cd /opt/surespot-backend
docker compose -f compose-prod.yml exec app npm run seed
```

#### Viewing Logs

```bash
# Dev
docker compose -f compose-dev-deploy.yml logs -f app

# Prod
docker compose -f compose-prod.yml logs -f app
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
├── common/                 # Shared modules
│   └── cloudinary/        # Cloudinary media upload service
├── modules/                # Feature modules
│   ├── auth/              # Authentication & authorization
│   ├── cart/              # Shopping cart management
│   ├── food-items/        # Food catalog, categories, extras
│   ├── orders/            # Order placement & tracking
│   ├── transactions/      # Payment processing (Paystack)
│   ├── notifications/     # Multi-channel notifications system
│   ├── saved-locations/   # User address management
│   ├── pickup-locations/  # Restaurant/pickup point management
│   ├── promotions/        # Discount codes & campaigns
│   ├── regions/           # Geographic region management
│   ├── mail/              # Email templating & delivery
│   ├── sms/               # SMS message building & delivery
│   └── queue/             # Background job processing (BullMQ)
├── app.module.ts          # Root module
└── main.ts                # Application entry point
```

## API Documentation

Full interactive API documentation is available at `/docs` when running the server. The Swagger UI provides:

- Complete endpoint listings with request/response schemas
- Interactive testing interface
- Authentication token management
- Request/response examples

To access: `http://localhost:3000/docs`

## Environment Variables

See `.env.development` or `env.example` for all available configuration options.

### Core Configuration

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `API_VERSION` - API version prefix (default: v1)

### Database

- `MONGODB_URI` - MongoDB connection string
- `MONGODB_DB_NAME` - Database name

### Authentication

- `JWT_SECRET` - Secret for signing JWT tokens (change in production!)
- `JWT_ACCESS_EXPIRY` - Access token expiry (default: 1h)
- `JWT_REFRESH_EXPIRY` - Refresh token expiry (default: 30d)
- `OTP_EXPIRY_MINUTES` - OTP code validity (default: 5)
- `OTP_RESEND_SECONDS` - Minimum time between OTP resends (default: 30)
- `OTP_MAX_ATTEMPTS` - Maximum OTP verification attempts (default: 5)

### Redis (Queue)

- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password

### Media Storage

- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret

### Notifications

- `EXPO_ACCESS_TOKEN` - Expo push notification access token (optional, for higher rate limits)
- `SMTP_HOST` - SMTP server host (e.g. smtppro.zoho.com)
- `SMTP_PORT` - SMTP port (465 for SSL, 587 for TLS)
- `SMTP_USER` - SMTP auth username
- `SMTP_PASSWORD` - SMTP auth password
- `SMTP_FROM_NAME` - Email sender display name
- `SMS_API_URL` - SMS provider API endpoint
- `SMS_API_KEY` - SMS provider API key
- `SMS_SENDER_ID` - SMS sender identifier

### Payments

- `PAYSTACK_SECRET_KEY` - Paystack secret key for payment processing

### Security

- `RATE_LIMIT_WINDOW_MS` - Rate limit window in milliseconds (default: 60000)
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (default: 100)
- `CORS_ORIGIN` - Allowed CORS origins (comma-separated)

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

### Authentication & Authorization
✅ Phone & email-based authentication with OTP  
✅ JWT access & refresh tokens with rotation  
✅ Password reset flow (phone & email)  
✅ Bcrypt password hashing  
✅ JWT guards for protected routes  
✅ Role-based access control  

### Core Business Logic
✅ Food catalog with categories, extras, and search  
✅ Shopping cart with automatic expiration  
✅ Order placement & tracking (door-delivery & pickup)  
✅ Payment processing via Paystack  
✅ Promotions & discount codes  
✅ Saved locations management  
✅ Pickup locations management  

### Notifications System
✅ Multi-channel notifications (Email, SMS, In-App, Push)  
✅ Real-time WebSocket gateway for in-app notifications  
✅ Expo push notifications  
✅ BullMQ queue for asynchronous processing  
✅ Notification history & read status tracking  

### Infrastructure
✅ MongoDB with Mongoose ODM  
✅ Redis for job queue (BullMQ)  
✅ Cloudinary integration for media uploads  
✅ Rate limiting & throttling  
✅ Input validation with class-validator  
✅ Swagger API documentation  
✅ Winston logging  
✅ Scheduled tasks (cron jobs)  

## Architecture Highlights

### Notification System

The notification system uses a queue-based architecture for reliable, asynchronous delivery:

- **Channels:** Email, SMS, In-App (WebSocket), Push (Expo)
- **Queue Processing:** BullMQ with Redis backend, 3 concurrent workers
- **Real-time Delivery:** Socket.IO gateway for instant in-app notifications
- **Context Fetching:** Parallel data fetching within workers for optimal performance

### Order Management

- Order number format: `ORD-YYYY-XXXXXX`
- Status flow: `pending` → `confirmed` → `preparing` → `ready` → `out-for-delivery` → `delivered`
- Delivery types: `door-delivery`, `pickup`
- Payment status tracking: `pending`, `paid`, `failed`, `refunded`

## TODO

- [ ] Add unit and e2e tests
- [ ] Profile management endpoints
- [ ] Reviews & ratings system
- [ ] Admin dashboard endpoints
- [ ] Analytics & reporting

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

## Development Notes

### Notification System Integration

The notification system is fully integrated with:
- Order status changes trigger appropriate notifications
- Payment success/failure notifications
- Welcome notifications on user registration
- Rate reminder notifications for delivered orders
- Promotion notifications

See the notification service for available helper methods and channel configurations.

### Queue Processing

Background jobs are processed automatically when the server is running. The notification processor:
- Fetches notification context in parallel
- Dispatches to appropriate channels based on notification type
- Updates sent status flags in the database
- Handles errors gracefully with retry logic

### Testing

For testing the notification system:
1. Ensure Redis is running (`docker compose up -d`)
2. Start the development server (`npm run start:dev`)
3. Trigger notifications through order/payment flows
4. Check WebSocket connections via the gateway logs
5. Monitor queue processing in the console

## Support

For questions or issues, refer to:
- `plan.md` - Complete API specification
- `REFERENCE.md` - Architecture and design reference
- Swagger docs at `/docs` when server is running

## License

Private - All Rights Reserved
