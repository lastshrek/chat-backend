import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common'
import { createLogger, format, transports, Logger } from 'winston'
import 'winston-daily-rotate-file'
import * as path from 'path'

@Injectable()
export class LoggerService implements NestLoggerService {
	private logger: Logger

	constructor() {
		const logDir = 'logs'
		const filename = path.join(logDir, 'app-%DATE%.log')

		const dailyRotateFileTransport = new transports.DailyRotateFile({
			filename,
			datePattern: 'YYYY-MM-DD',
			zippedArchive: true,
			maxSize: '20m',
			maxFiles: '14d',
			level: 'debug',
		} as any)

		this.logger = createLogger({
			level: 'debug',
			format: format.combine(format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), format.json()),
			transports: [
				// 控制台输出
				new transports.Console({
					level: 'debug',
					format: format.combine(
						format.colorize(),
						format.printf(({ timestamp, level, message, context, ...meta }) => {
							return `${timestamp} [${level}] ${context ? `[${context}]` : ''}: ${message} ${
								Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
							}`
						})
					),
				}),
				// 文件输出
				dailyRotateFileTransport,
			],
		})
	}

	log(message: string, context?: string) {
		this.logger.info(message, { context })
	}

	error(message: string, trace?: string, context?: string) {
		this.logger.error(message, { trace, context })
	}

	warn(message: string, context?: string) {
		this.logger.warn(message, { context })
	}

	debug(message: string, context?: string) {
		this.logger.debug(message, { context })
	}

	verbose(message: string, context?: string) {
		this.logger.verbose(message, { context })
	}
}
