import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChatDrawDto {
  @ApiProperty({ example: 'Draw a cute little dog', description: '绘画描述信息' })
  prompt: string;

  @ApiProperty({ example: 1, description: '绘画张数', required: true })
  n: number;

  @ApiProperty({ example: '256x256', description: '图片尺寸', required: true })
  @IsIn(['256x256', '512x512', '1024x1024'])
  size: string;
}
