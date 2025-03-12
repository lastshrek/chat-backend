import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService implements NestLoggerService {
	private context?: string
	private readonly emojis = {
		// 系统相关
		NestFactory: '🚀',
		InstanceLoader: '🔌',
		RoutesResolver: '🧭',
		RouterExplorer: '🛣️',
		NestApplication: '✅',
		WebSocketAdapter: '🔌',
		WebSocketsController: '📡',

		// 模块相关
		MessagesModule: '💬',
		UsersModule: '👤',
		DocumentsModule: '📄',
		MeetingsModule: '📹',
		OrganizationsModule: '🏢',
		RedisModule: '🔄',
		EventsModule: '📣',
		CommonModule: '🧰',
		PrismaModule: '💾',
		JwtModule: '🔑',

		// 服务相关
		MessagesService: '💬',
		MessagesGateway: '📨',
		UsersService: '👤',
		DocumentsService: '📄',
		DocumentsGateway: '📃',
		MeetingsService: '📹',
		MeetingsGateway: '📡',
		OrganizationsService: '🏢',
		RedisService: '🔄',
		PrismaService: '💾',
		LoggerService: '📝',
		MinioService: '📦',
		GroupChatService: '👥',

		// 默认
		WebSocket: '🔌',
		default: '📌',
	}

	constructor(private configService: ConfigService) {}

	setContext(context: string) {
		this.context = context
		return this
	}

	private getEmoji(context?: string): string {
		if (!context) return this.emojis.default

		// 尝试精确匹配
		if (this.emojis[context]) {
			return this.emojis[context]
		}

		// 尝试部分匹配
		for (const key of Object.keys(this.emojis)) {
			if (context.includes(key)) {
				return this.emojis[key]
			}
		}

		return this.emojis.default
	}

	log(message: any, context?: string) {
		const emoji = this.getEmoji(context || this.context)
		console.log(`${emoji} [${context || this.context || 'Logger'}] ${message}`)
	}

	error(message: any, trace?: string, context?: string) {
		console.error(`❌ [${context || this.context || 'Logger'}] ${message}${trace ? `\n${trace}` : ''}`)
	}

	warn(message: any, context?: string) {
		console.warn(`⚠️ [${context || this.context || 'Logger'}] ${message}`)
	}

	debug(message: any, context?: string) {
		if (this.configService.get('NODE_ENV') !== 'production') {
			console.debug(`🔍 [${context || this.context || 'Logger'}] ${message}`)
		}
	}

	verbose(message: any, context?: string) {
		if (this.configService.get('NODE_ENV') !== 'production') {
			console.log(`🔬 [${context || this.context || 'Logger'}] ${message}`)
		}
	}
}
