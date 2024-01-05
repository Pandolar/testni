import { ChatgptController } from './../chatgpt.controller';
import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, IsDefined, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetWhiteUserListDto {
  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  page: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  size: number;
}
