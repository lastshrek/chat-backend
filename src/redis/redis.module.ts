import { Module, Global } from '@nestjs/common'
import { RedisModule as NestRedisModule } from '@nestjs-modules/ioredis'
import { RedisService } from './redis.service'
import { RedisController } from './redis.controller'

@Global()
@Module({
	imports: [
		NestRedisModule.forRootAsync({
			useFactory: () => ({
				type: 'single',
				options: {
					host: process.env.REDIS_HOST || 'localhost',
					port: Number(process.env.REDIS_PORT) || 6379,
					password: process.env.REDIS_PASSWORD,
					db: Number(process.env.REDIS_DB) || 0,
				},
			}),
		}),
	],
	controllers: [RedisController],
	providers: [RedisService],
	exports: [RedisService],
})
export class RedisModule {}
