import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import { Response } from 'express'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
	catch(exception: any, host: ArgumentsHost) {
		const ctx = host.switchToHttp()
		const response = ctx.getResponse<Response>()

		let code: number
		let message: string

		if (exception instanceof HttpException) {
			code = exception.getStatus()
			const exceptionResponse = exception.getResponse()
			message =
				typeof exceptionResponse === 'string'
					? exceptionResponse
					: (exceptionResponse as any).message || exception.message
		} else {
			code = HttpStatus.INTERNAL_SERVER_ERROR
			message = exception.message || 'Internal server error'
		}

		response.status(code).json({
			code,
			data: null,
			message,
		})
	}
}
