import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { MessagesModule } from './messages/messages.module'
import { UsersModule } from './users/users.module'
import { RedisModule } from './redis/redis.module'
import { EventsModule } from './events/events.module'
import { CommonModule } from './common/common.module'
import { OrganizationsModule } from './organizations/organizations.module'
import { LoggerMiddleware } from './common/middleware/logger.middleware'
import { APP_GUARD } from '@nestjs/core'
import { GlobalJwtAuthGuard } from './common/guards/global-jwt-auth.guard'
import { MeetingsModule } from './meetings/meetings.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true, // 设置为全局模块
		}),
		CommonModule,
		PrismaModule,
		MessagesModule,
		UsersModule,
		RedisModule,
		EventsModule,
		OrganizationsModule,
		MeetingsModule,
	],
	providers: [
		AppService,
		{
			provide: APP_GUARD,
			useClass: GlobalJwtAuthGuard,
		},
	],
})
export class AppModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(LoggerMiddleware).forRoutes('*')
	}
}
