import { ChatgptController } from './../chatgpt.controller';
import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, IsDefined, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateKeyDto {
  @ApiProperty({ example: 1, description: '当前key的id' })
  @IsNumber({}, { message: 'id必须是number类型' })
  @IsDefined({ message: 'id不能为空' })
  id: number;

  @ApiProperty({ example: 'sk-xxxxxxxxxxxxxxxxxxx', description: 'Chatgpt key' })
  @IsDefined({ message: 'key不能为空' })
  key: string;

  @ApiProperty({ example: 1, description: '当前key的启用状态' })
  @IsNumber({}, { message: '启用状态必须是number类型' })
  @IsIn([0, 1], { message: '启用状态只能是0或1' })
  status: number;

  @ApiProperty({ example: 'gpt-3.5-turbo', description: '当前key绑定的模型' })
  @IsDefined({ message: '支持的模型不能为空' })
  model: string;

  @ApiProperty({ example: '18$', description: '当前key的余额类型' })
  @IsOptional()
  type: string;

  @ApiProperty({ example: 1, description: '当前key的轮询权重' })
  @IsNumber({}, { message: '必须是number类型' })
  @IsOptional()
  weight: number;

  @ApiProperty({ example: 0, description: '当前key支持的最大上下文' })
  @IsNumber({}, { message: '必须是number类型' })
  @IsOptional()
  maxModelTokens: number;

  @ApiProperty({ example: 0, description: '当前key支持的最大回复Token' })
  @IsNumber({}, { message: '必须是number类型' })
  @IsOptional()
  maxResponseTokens: number;

  @ApiProperty({ example: '', description: '当前key绑定的代理地址' })
  @IsOptional()
  openaiProxyUrl: string;
}
