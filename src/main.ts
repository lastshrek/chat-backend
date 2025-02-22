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

async function bootstrap() {
	const app = await NestFactory.create(AppModule)

	// 直接设置 WebSocket 适配器
	app.useWebSocketAdapter(new WebSocketAdapter(app))

	const configService = app.get(ConfigService)

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

	await app.listen(3000)
}
bootstrap()
