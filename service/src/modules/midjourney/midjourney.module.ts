import { Global, Module } from '@nestjs/common';
import { MidjourneyController } from './midjourney.controller';
import { MidjourneyService } from './midjourney.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MidjourneyEntity } from './midjourney.entity';
import { UserEntity } from '../user/user.entity';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { MjPromptsEntity } from './mjPrompts.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([MidjourneyEntity, UserEntity, MjPromptsEntity])],
  controllers: [MidjourneyController],
  providers: [MidjourneyService, RedisCacheService],
  exports: [MidjourneyService],
})
export class MidjourneyModule {}
