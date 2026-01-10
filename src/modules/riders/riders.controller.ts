import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { RidersService } from './riders.service';
import {
  CreateRiderProfileDto,
  CreateRiderDocumentationDto,
  UpdateRiderStatusDto,
  QueryRiderProfilesDto,
  InitiateRiderRegistrationDto,
  CompleteRiderRegistrationDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@ApiTags('riders')
@Controller('riders')
export class RidersController {
  constructor(private readonly ridersService: RidersService) {}

  // ============ ADMIN ENDPOINTS ============

  @Post('profiles')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new rider profile (Admin only)',
    description:
      'Creates a new rider profile with a generated registration code that is sent via SMS/Email',
  })
  @ApiResponse({
    status: 201,
    description: 'Rider profile created successfully',
    schema: {
      example: {
        success: true,
        message: 'Rider profile created successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+234****678',
          email: 'jo****@example.com',
          regionId: '507f1f77bcf86cd799439012',
          registrationCode: '1234567890123456',
          status: 'pending',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Region not found' })
  @ApiResponse({
    status: 409,
    description: 'Phone or email already registered',
  })
  async createProfile(@Body() dto: CreateRiderProfileDto) {
    return this.ridersService.createRiderProfile(dto);
  }

  @Post('profiles/:id/documentation')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload rider documentation (Admin only)',
    description: 'Upload or update documentation for a rider profile',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'governmentId', maxCount: 1 },
      { name: 'proofOfAddress', maxCount: 1 },
      { name: 'passportPhotograph', maxCount: 1 },
      { name: 'bankAccountDetails', maxCount: 1 },
      { name: 'vehicleDocumentation', maxCount: 1 },
    ]),
  )
  @ApiParam({ name: 'id', description: 'Rider profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Documentation uploaded successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Rider profile not found' })
  async uploadDocumentation(
    @Param('id') id: string,
    @Body() dto: Omit<CreateRiderDocumentationDto, 'riderProfileId'>,
    @UploadedFiles()
    files: {
      governmentId?: Express.Multer.File[];
      proofOfAddress?: Express.Multer.File[];
      passportPhotograph?: Express.Multer.File[];
      bankAccountDetails?: Express.Multer.File[];
      vehicleDocumentation?: Express.Multer.File[];
    },
  ) {
    const processedFiles: {
      governmentId?: Express.Multer.File;
      proofOfAddress?: Express.Multer.File;
      passportPhotograph?: Express.Multer.File;
      bankAccountDetails?: Express.Multer.File;
      vehicleDocumentation?: Express.Multer.File;
    } = {};

    if (files?.governmentId?.[0])
      processedFiles.governmentId = files.governmentId[0];
    if (files?.proofOfAddress?.[0])
      processedFiles.proofOfAddress = files.proofOfAddress[0];
    if (files?.passportPhotograph?.[0])
      processedFiles.passportPhotograph = files.passportPhotograph[0];
    if (files?.bankAccountDetails?.[0])
      processedFiles.bankAccountDetails = files.bankAccountDetails[0];
    if (files?.vehicleDocumentation?.[0])
      processedFiles.vehicleDocumentation = files.vehicleDocumentation[0];

    return this.ridersService.uploadDocumentation(
      { ...dto, riderProfileId: id } as CreateRiderDocumentationDto,
      processedFiles,
    );
  }

  @Get('profiles')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all rider profiles (Admin only)',
    description:
      'Retrieve a paginated list of rider profiles with optional filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Rider profiles retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getProfiles(@Query() query: QueryRiderProfilesDto) {
    return this.ridersService.getProfiles(query);
  }

  @Get('profiles/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get rider profile by ID (Admin only)',
    description: 'Retrieve a single rider profile with its documentation',
  })
  @ApiParam({ name: 'id', description: 'Rider profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Rider profile retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Rider profile not found' })
  async getProfileById(@Param('id') id: string) {
    return this.ridersService.getProfileById(id);
  }

  @Patch('profiles/:id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update rider status (Admin only)',
    description: 'Update the status of a rider profile',
  })
  @ApiParam({ name: 'id', description: 'Rider profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Rider status updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Rider profile not found' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRiderStatusDto,
  ) {
    return this.ridersService.updateRiderStatus(id, dto);
  }

  @Post('profiles/:id/resend-code')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resend registration code (Admin only)',
    description: 'Resend the registration code to the rider via SMS/Email',
  })
  @ApiParam({ name: 'id', description: 'Rider profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Registration code resent successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid rider status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Rider profile not found' })
  async resendCode(@Param('id') id: string) {
    return this.ridersService.resendRegistrationCode(id);
  }

  // ============ PUBLIC ENDPOINTS (Rider Registration) ============

  @Get('registration/:code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get rider profile by registration code',
    description:
      'Public endpoint to retrieve rider profile data for the confirmation screen',
  })
  @ApiParam({
    name: 'code',
    description: '16-digit registration code',
    example: '1234567890123456',
  })
  @ApiResponse({
    status: 200,
    description: 'Rider profile found',
    schema: {
      example: {
        success: true,
        message: 'Rider profile found',
        data: {
          id: '507f1f77bcf86cd799439011',
          firstName: 'John',
          lastName: 'Doe',
          email: 'jo****@example.com',
          phone: '+234****678',
          dateOfBirth: '1990-05-15T00:00:00.000Z',
          address: '123 Main Street, Lagos',
          nin: '12****01',
          regionId: '507f1f77bcf86cd799439012',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid registration code format' })
  @ApiResponse({ status: 404, description: 'Registration code not found' })
  @ApiResponse({ status: 409, description: 'Registration code already used' })
  async getByRegistrationCode(@Param('code') code: string) {
    return this.ridersService.getProfileByRegistrationCode(code);
  }

  @Post('registration/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate rider registration',
    description:
      'Validates registration code and name match, returns full profile data for verification',
  })
  @ApiResponse({
    status: 200,
    description: 'Registration initiated successfully',
    schema: {
      example: {
        success: true,
        message: 'Registration initiated successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+2348012345678',
          dateOfBirth: '1990-05-15T00:00:00.000Z',
          address: '123 Main Street, Lagos',
          nin: '12345678901',
          regionId: '507f1f77bcf86cd799439012',
          schedule: [1, 2, 3, 4, 5, 6],
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid code or name mismatch' })
  @ApiResponse({ status: 404, description: 'Registration code not found' })
  @ApiResponse({ status: 409, description: 'Registration code already used' })
  async initiateRegistration(@Body() dto: InitiateRiderRegistrationDto) {
    return this.ridersService.initiateRegistration(dto);
  }

  @Post('registration/complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Complete rider registration',
    description:
      'Links verified user account to rider profile and activates the rider. Must be called after email and phone verification.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rider registration completed successfully',
    schema: {
      example: {
        success: true,
        message: 'Rider registration completed successfully',
        data: {
          profileId: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439013',
          status: 'active',
          schedule: [1, 2, 3, 4, 5, 6],
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid registration code' })
  @ApiResponse({ status: 401, description: 'Unauthorized - must be logged in' })
  @ApiResponse({
    status: 404,
    description: 'Registration code or user not found',
  })
  @ApiResponse({ status: 409, description: 'Registration code already used' })
  async completeRegistration(
    @Body() dto: CompleteRiderRegistrationDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.ridersService.completeRegistration(dto, user.id);
  }

  // ============ RIDER ENDPOINTS (Authenticated Rider) ============

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current rider profile',
    description:
      "Get the rider profile for the currently authenticated user with today's stats",
  })
  @ApiResponse({
    status: 200,
    description: 'Rider profile retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Rider profile retrieved successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439012',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+2348012345678',
          email: 'john.doe@example.com',
          dateOfBirth: '1990-05-15T00:00:00.000Z',
          address: '123 Main Street, Lagos',
          nin: '12345678901',
          regionId: '507f1f77bcf86cd799439013',
          schedule: [1, 2, 3, 4, 5, 6],
          rating: 4.5,
          status: 'active',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
          stats: {
            today: {
              completedOrders: 5,
              earnings: 200000,
              earningsFormatted: '₦2,000.00',
              distanceCoveredKm: 12.5,
              distanceCoveredFormatted: '12.5 km',
              timeOnlineMinutes: 180,
              timeOnlineFormatted: '3h 0m',
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Rider profile not found' })
  async getMyProfile(@CurrentUser() user: { id: string }) {
    return this.ridersService.getProfileByUserId(user.id);
  }

  @Patch('me/schedule')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update work schedule',
    description:
      'Update the work schedule for the currently authenticated rider',
  })
  @ApiResponse({
    status: 200,
    description: 'Schedule updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Rider profile not found' })
  async updateSchedule(
    @CurrentUser() user: { id: string },
    @Body() dto: { schedule: number[] },
  ) {
    return this.ridersService.updateSchedule(user.id, dto.schedule);
  }
}
