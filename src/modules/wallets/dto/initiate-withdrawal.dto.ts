import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class InitiateWithdrawalDto {
  @ApiProperty({
    description: 'Withdrawal amount in kobo',
    example: 500000, // ₦5,000
    minimum: 100, // Minimum ₦1
  })
  @IsNumber()
  @Min(100)
  amount: number;
}
