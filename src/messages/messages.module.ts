import { Module, forwardRef } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { MessagesService } from './messages.service'
import { MessagesController } from './messages.controller'
import { MessagesGateway } from './messages.gateway'
import { MessagesEventsService } from './messages-events.service'
import { UsersModule } from '../users/users.module'
import { PrismaService } from '../prisma/prisma.service'
import { WsAuthGuard } from '../common/guards/ws-auth.guard'
import { MinioService } from '../common/services/minio.service'

@Module({
	imports: [
		forwardRef(() => UsersModule),
		JwtModule.registerAsync({
			useFactory: () => ({
				secret: process.env.JWT_SECRET,
				signOptions: { expiresIn: '30d' },
			}),
		}),
	],
	controllers: [MessagesController],
	providers: [MessagesService, MessagesGateway, MessagesEventsService, PrismaService, WsAuthGuard, MinioService],
	exports: [MessagesService, MessagesGateway],
})
export class MessagesModule {}
