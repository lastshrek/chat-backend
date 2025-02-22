import { IoAdapter } from '@nestjs/platform-socket.io'
import { ServerOptions } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import { Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export class WebSocketAdapter extends IoAdapter {
	private readonly logger = new Logger(WebSocketAdapter.name)
	private readonly jwtService: JwtService
	private readonly prisma: PrismaService

	constructor(app: any) {
		super(app)
		this.jwtService = app.get(JwtService)
		this.prisma = app.get(PrismaService)
		this.logger.log('WebSocketAdapter initialized')
	}

	createIOServer(port: number, options?: ServerOptions) {
		this.logger.log('Creating IO Server')

		const server = super.createIOServer(port, {
			...options,
			cors: {
				origin: '*',
				methods: ['GET', 'POST'],
				credentials: true,
			},
			path: '/socket.io/',
			transports: ['websocket', 'polling'],
		})

		// 添加命名空间中间件
		const meetingsNamespace = server.of('meetings')
		meetingsNamespace.use(async (socket, next) => {
			this.logger.log('Socket middleware executing for meetings namespace')
			try {
				const token = socket.handshake.auth.token || socket.handshake.headers.authorization

				if (!token) {
					this.logger.error('No token in request')
					throw new Error('No token provided')
				}

				this.logger.log('Received token:', token)

				// 移除 'Bearer ' 前缀
				const jwtToken = token.replace('Bearer ', '')

				// 验证 token
				const payload = this.jwtService.verify(jwtToken)
				this.logger.log('Token payload:', payload)

				// 从数据库获取完整的用户信息
				const user = await this.prisma.user.findUnique({
					where: { id: payload.sub },
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				})

				// 将完整的用户信息添加到 socket 数据中
				socket.data = {
					user: {
						...payload,
						avatar: user.avatar,
					},
				}
				this.logger.log('Socket data after setting:', socket.data)

				// 将用户加入到专属房间
				await socket.join(`user_${payload.sub}`)

				next()
			} catch (error) {
				this.logger.error('Socket middleware error:', error)
				next(new Error('Authentication failed: ' + error.message))
			}
		})

		return server
	}
}
