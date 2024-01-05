import { ChatgptController } from './../chatgpt.controller';
import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, IsDefined, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddWhiteUserDto {
  @ApiProperty({ example: 1, description: '加入白名单的用户Id' })
  @IsNumber({}, { message: '用户Id必须是number类型' })
  @IsDefined({ message: '用户Id不能为空' })
  userId: number;

  @ApiProperty({ example: 10, description: '限制使用的次数' })
  @IsNumber({}, { message: '必须是number类型' })
  @IsDefined({ message: '限制使用次数不能为空' })
  count: number;
}
