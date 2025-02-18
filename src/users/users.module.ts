import { Module, forwardRef } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { MessagesModule } from '../messages/messages.module'

@Module({
	imports: [
		JwtModule.register({
			secret: process.env.JWT_SECRET,
			signOptions: {
				expiresIn: '30d',
			},
		}),
		forwardRef(() => MessagesModule),
	],
	controllers: [UsersController],
	providers: [UsersService],
	exports: [UsersService],
})
export class UsersModule {}
