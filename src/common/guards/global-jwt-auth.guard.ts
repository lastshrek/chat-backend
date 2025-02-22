import { ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { LoggerService } from '../services/logger.service'
import { PUBLIC_ROUTE } from '../decorators/public.decorator'

@Injectable()
export class GlobalJwtAuthGuard extends AuthGuard('jwt') {
	constructor(private reflector: Reflector, private logger: LoggerService) {
		super()
	}

	canActivate(context: ExecutionContext) {
		const handler = context.getHandler()
		const className = context.getClass().name
		const methodName = handler.name
		const request = context.switchToHttp().getRequest()

		this.logger.debug(`Request URL: ${request.method} ${request.url}`, 'GlobalJwtAuthGuard')
		this.logger.debug(`Route: ${className}.${methodName}`, 'GlobalJwtAuthGuard')
		this.logger.debug(`Handler: ${handler.toString()}`, 'GlobalJwtAuthGuard')

		const isPublic = this.reflector.get(PUBLIC_ROUTE, handler)
		this.logger.debug(`Is public: ${isPublic}`, 'GlobalJwtAuthGuard')

		if (isPublic) {
			return true
		}

		return super.canActivate(context)
	}
}
