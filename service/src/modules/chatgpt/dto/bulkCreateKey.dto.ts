import { ChatgptController } from './../chatgpt.controller';
import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, IsDefined, IsNumber, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkCreateKeyDto {
  @ApiProperty({ example: ['sk-xxxxxxsadsafdasdfasdadasd'], description: '批量添加key的列表' })
  @IsArray({ message: '请检测您的key是否合理！' })
  keyList: string[];
}
