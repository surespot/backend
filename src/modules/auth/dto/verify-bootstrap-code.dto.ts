import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyBootstrapCodeDto {
  @ApiProperty({
    example: 'secret-master-code-123',
    description: 'Master bootstrap code from environment',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
