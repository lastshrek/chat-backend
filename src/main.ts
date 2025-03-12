import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { writeFileSync } from 'fs'
import { join } from 'path'
import {
	TextMetadata,
	FileMetadata,
	VoiceMetadata,
	LinkMetadata,
	ImageMetadata,
	VideoMetadata,
	CreateMessageDto,
	UpdateMessageDto,
	UpdateMessageStatusDto,
} from './messages/dto/messages.dto'
import { CreateUserDto, LoginDto } from './users/dto/user.dto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { WebSocketAdapter } from './common/adapters/ws-adapter'
import { GlobalJwtAuthGuard } from './common/guards/global-jwt-auth.guard'
import { LoggerService } from './common/services/logger.service'
import { Logger } from '@nestjs/common'

// 自定义日志格式化函数
function formatLog(context: string, message: string): string {
	const emojis = {
		// 系统相关
		NestFactory: '🚀',
		InstanceLoader: '\u{1F527}', // 扳手 Unicode
		RoutesResolver: '🧭',
		RouterExplorer: '🔍',
		NestApplication: '✅',
		WebSocketAdapter: '🔌',
		WebSocketsController: '📡',
		PackageLoader: '📦',

		// 模块相关
		MessagesModule: '💬',
		UsersModule: '👤',
		DocumentsModule: '📄',
		MeetingsModule: '📹',
		OrganizationsModule: '🏢',
		RedisModule: '\u{1F504}', // 循环箭头 Unicode
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
		RedisService: '\u{1F504}', // 循环箭头 Unicode
		PrismaService: '💾',
		LoggerService: '📝',
		MinioService: '📦',
		GroupChatService: '👥',

		// 默认
		WebSocket: '🔌',
		default: '📌',
	}

	// 颜色映射
	const colors = {
		green: '\x1b[32m',
		brightGreen: '\x1b[92m',
		red: '\x1b[31m',
		yellow: '\x1b[33m',
		blue: '\x1b[34m',
		magenta: '\x1b[35m',
		cyan: '\x1b[36m',
		white: '\x1b[37m',
		brightWhite: '\x1b[97m',
		reset: '\x1b[0m',
		bold: '\x1b[1m',
	}

	// 获取对应的 emoji
	let emoji = emojis.default

	// 尝试精确匹配
	if (emojis[context]) {
		emoji = emojis[context]
	} else {
		// 尝试部分匹配
		for (const key of Object.keys(emojis)) {
			if (context.includes(key)) {
				emoji = emojis[key]
				break
			}
		}
	}

	// 为不同类型的日志设置不同的颜色
	let contextColor = colors.green
	let messageColor = colors.brightWhite

	if (context.includes('Controller') || context.includes('Gateway')) {
		contextColor = colors.cyan
	} else if (context.includes('Service')) {
		contextColor = colors.yellow
	} else if (context.includes('Module')) {
		contextColor = colors.magenta
	} else if (context.includes('Nest')) {
		contextColor = colors.blue
	}

	// 返回带颜色的格式化日志
	return `${emoji} ${contextColor}[${context}]${colors.reset} ${messageColor}${message}${colors.reset}`
}

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		logger: {
			log: (message, context) => console.log(formatLog(context, message)),
			error: (message, trace, context) =>
				console.error(
					`❌ \x1b[31m\x1b[1m[${context}]\x1b[0m \x1b[91m${message}\x1b[0m${trace ? `\n\x1b[90m${trace}\x1b[0m` : ''}`
				),
			warn: (message, context) => console.warn(`⚠️ \x1b[33m\x1b[1m[${context}]\x1b[0m \x1b[93m${message}\x1b[0m`),
			debug: (message, context) => console.debug(`�� \x1b[36m\x1b[1m[${context}]\x1b[0m \x1b[96m${message}\x1b[0m`),
			verbose: (message, context) => console.log(`🔬 \x1b[35m\x1b[1m[${context}]\x1b[0m \x1b[95m${message}\x1b[0m`),
		},
	})

	const configService = app.get(ConfigService)
	const port = configService.get('PORT') || 3000

	// 启用 CORS
	app.enableCors({
		origin: true,
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
		credentials: true,
	})

	// 全局使用响应转换拦截器
	app.useGlobalInterceptors(new TransformInterceptor())
	// 全局使用异常过滤器
	app.useGlobalFilters(new HttpExceptionFilter())

	const config = new DocumentBuilder()
		.setTitle('Chat API')
		.setDescription('The chat API description')
		.setVersion('1.0')
		.addTag('messages', '消息相关接口')
		.addTag('users', '用户相关接口')
		.addTag('websockets', 'WebSocket 相关接口')
		.addBearerAuth()
		.build()

	const document = SwaggerModule.createDocument(app, config, {
		extraModels: [
			// 消息相关模型
			TextMetadata,
			FileMetadata,
			VoiceMetadata,
			LinkMetadata,
			ImageMetadata,
			VideoMetadata,
			CreateMessageDto,
			UpdateMessageDto,
			UpdateMessageStatusDto,
			// 用户相关模型
			CreateUserDto,
			LoginDto,
		],
	})

	// 导出 swagger.json
	writeFileSync(join(__dirname, '..', 'swagger.json'), JSON.stringify(document, null, 2))

	SwaggerModule.setup('api', app, document, {
		swaggerOptions: {
			persistAuthorization: true,
			displayRequestDuration: true,
			docExpansion: 'none',
			filter: true,
			showCommonExtensions: true,
			syntaxHighlight: {
				activate: true,
				theme: 'monokai',
			},
		},
		customSiteTitle: 'Chat API Documentation',
	})

	// 配置全局管道
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		})
	)

	// 配置 WebSocket 适配器
	app.useWebSocketAdapter(new WebSocketAdapter(app))

	// 启动应用
	await app.listen(port)
	console.log(`🚀 Application is running on: http://localhost:${port}`)
}
bootstrap()
