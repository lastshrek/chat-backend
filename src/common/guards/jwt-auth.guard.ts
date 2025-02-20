import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { JwtService } from '@nestjs/jwt'
import { LoggerService } from '../services/logger.service'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor(private jwtService: JwtService, private logger: LoggerService) {
		super()
	}

	canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const token = this.extractTokenFromHeader(request)

		if (!token) {
			throw new UnauthorizedException('No token provided')
		}

		try {
			const payload = this.jwtService.verify(token, {
				secret: process.env.JWT_SECRET,
			})
			request.user = payload
			return true
		} catch (error) {
			this.logger.error(`JWT verification failed: ${error.message}`, error.stack, 'JwtAuthGuard')
			throw new UnauthorizedException('Invalid token')
		}
	}

	private extractTokenFromHeader(request: any): string | undefined {
		const [type, token] = request.headers.authorization?.split(' ') ?? []
		return type === 'Bearer' ? token : undefined
	}
}
