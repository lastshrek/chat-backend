import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { MessagesModule } from './messages/messages.module'
import { UsersModule } from './users/users.module'
import { RedisModule } from './redis/redis.module'
import { EventsModule } from './events/events.module'
import { CommonModule } from './common/common.module'
import { LoggerMiddleware } from './common/middleware/logger.middleware'
import { GlobalJwtAuthGuard } from './common/guards/global-jwt-auth.guard'
import { JwtModule } from '@nestjs/jwt'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true, // 设置为全局模块
		}),
		JwtModule.register({
			secret: process.env.JWT_SECRET,
			signOptions: { expiresIn: '30d' },
		}),
		PrismaModule,
		MessagesModule,
		UsersModule,
		RedisModule,
		EventsModule,
		CommonModule,
	],
	providers: [
		AppService,
		GlobalJwtAuthGuard, // 添加全局 JWT 守卫
	],
})
export class AppModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(LoggerMiddleware).forRoutes('*')
	}
}
