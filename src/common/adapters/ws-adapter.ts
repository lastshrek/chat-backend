import { IoAdapter } from '@nestjs/platform-socket.io'
import { ServerOptions } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import { LoggerService } from '../services/logger.service'

export class WebSocketAdapter extends IoAdapter {
	private readonly jwtService: JwtService
	private readonly logger: LoggerService

	constructor(app: any) {
		super(app)
		this.jwtService = app.get(JwtService)
		this.logger = app.get(LoggerService)
	}

	createIOServer(port: number, options?: ServerOptions) {
		const server = super.createIOServer(port, options)

		server.use(async (socket, next) => {
			try {
				const token = socket.handshake.auth.token?.split(' ')[1]

				if (!token) {
					throw new Error('No token provided')
				}

				const payload = this.jwtService.verify(token, {
					secret: process.env.JWT_SECRET,
				})

				this.logger.debug(`Token verified, payload: ${JSON.stringify(payload)}`, 'WebSocketAdapter')

				// 将用户信息添加到 socket.data
				socket.data.user = payload

				// 将用户加入到专属房间
				await socket.join(`user_${payload.sub}`)

				next()
			} catch (error) {
				this.logger.error(`WS auth error: ${error.message}`, error.stack, 'WebSocketAdapter')
				next(new Error('Authentication error'))
			}
		})

		return server
	}
}
