import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class AddPaymentDetailsDto {
  @ApiProperty({
    description: 'Bank account number',
    example: '0123456789',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, {
    message: 'Account number must be exactly 10 digits',
  })
  accountNumber: string;

  @ApiProperty({
    description: 'Paystack bank code',
    example: '058',
  })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({
    description: 'Account holder name',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  accountName: string;
}
