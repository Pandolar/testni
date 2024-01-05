import { ChatgptController } from './../chatgpt.controller';
import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, IsDefined, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteKeyDto {
  @ApiProperty({ example: 1, description: '当前key的id' })
  @IsNumber({}, { message: '启用状态必须是number类型' })
  id: number;
}
