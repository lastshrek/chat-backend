import { ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { LoggerService } from '../services/logger.service'

// 定义装饰器元数据的 key
export const IS_PUBLIC_KEY = 'isPublic'
// 创建公共路由装饰器
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

@Injectable()
export class GlobalJwtAuthGuard {
	constructor(private jwtService: JwtService, private reflector: Reflector, private logger: LoggerService) {}

	canActivate(context: ExecutionContext) {
		// 检查路由是否被标记为公共
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		])

		// 如果是公共路由，直接放行
		if (isPublic) {
			return true
		}

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
			this.logger.error(`JWT verification failed: ${error.message}`, error.stack, 'GlobalJwtAuthGuard')
			throw new UnauthorizedException('Invalid token')
		}
	}

	private extractTokenFromHeader(request: any): string | undefined {
		const [type, token] = request.headers.authorization?.split(' ') ?? []
		return type === 'Bearer' ? token : undefined
	}
}
