import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class RefundAccountDetailsDto {
  @ApiProperty({
    description:
      "The currency of the customer's bank account (same as payment)",
    example: 'NGN',
  })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({
    description: "The customer's account number",
    example: '0123456789',
  })
  @IsString()
  @IsNotEmpty()
  account_number: string;

  @ApiProperty({
    description:
      "The ID representing the customer's bank (from List Banks endpoint)",
    example: '9',
  })
  @IsString()
  @IsNotEmpty()
  bank_id: string;
}

export class RetryRefundDto {
  @ApiProperty({
    description: "Customer's bank account details for the refund",
    type: RefundAccountDetailsDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => RefundAccountDetailsDto)
  refund_account_details: RefundAccountDetailsDto;
}
