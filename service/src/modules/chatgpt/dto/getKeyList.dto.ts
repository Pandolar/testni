import { ChatgptController } from './../chatgpt.controller';
import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, IsDefined, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetKeyListDto {
  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  page: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  size: number;

  @ApiProperty({ example: 'sk-xx', description: 'key内容', required: false })
  @IsOptional()
  key: string;

  @ApiProperty({ example: 'gpt-3.5-turbo', description: '当前key绑定的模型', required: false })
  @IsOptional()
  model: string;

  @ApiProperty({ example: 1, description: 'key启用状态 0：未使用 1：已消费', required: false })
  @IsOptional()
  status: number;

  @ApiProperty({ example: 1, description: '当前key的账号状态' })
  @IsOptional()
  @IsNumber({}, { message: 'key状态必须是number类型' })
  @IsIn([-1, 1, 2], { message: '非法参数' })
  keyStatus: number;
}
