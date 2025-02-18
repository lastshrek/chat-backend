import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { LoggerService } from '../services/logger.service'

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
	constructor(private readonly logger: LoggerService) {}

	use(req: Request, res: Response, next: NextFunction) {
		const { method, originalUrl, ip, body, headers } = req
		const userAgent = req.get('user-agent') || ''
		const startTime = Date.now()

		// 请求开始日志
		this.logger.log(`${method} ${originalUrl}`, 'HTTP Request')

		// 打印请求详情
		if (Object.keys(body).length > 0) {
			this.logger.debug('Request Body:', JSON.stringify(body, null, 2))
		}

		if (headers['content-type']) {
			this.logger.debug('Content-Type:', headers['content-type'])
		}

		// 响应完成后记录
		res.on('finish', () => {
			const { statusCode } = res
			const contentLength = res.get('content-length')
			const duration = Date.now() - startTime

			this.logger.log(`${method} ${originalUrl} ${statusCode} ${duration}ms`, 'HTTP Response')

			// 打印响应详情
			this.logger.debug(
				'Response Details:',
				JSON.stringify(
					{
						statusCode,
						contentLength,
						duration: `${duration}ms`,
						ip,
						userAgent,
					},
					null,
					2
				)
			)
		})

		next()
	}
}
