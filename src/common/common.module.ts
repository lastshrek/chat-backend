import { Module, Global } from '@nestjs/common'
import { LoggerService } from './services/logger.service'
import { GlobalJwtAuthGuard } from './guards/global-jwt-auth.guard'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { JwtStrategy } from './strategies/jwt.strategy'

@Global()
@Module({
	imports: [
		PassportModule,
		JwtModule.register({
			secret: process.env.JWT_SECRET,
			signOptions: { expiresIn: '30d' },
		}),
	],
	providers: [LoggerService, GlobalJwtAuthGuard, JwtStrategy],
	exports: [LoggerService, GlobalJwtAuthGuard, JwtModule],
})
export class CommonModule {}
