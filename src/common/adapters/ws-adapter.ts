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
		const server = super.createIOServer(port, {
			...options,
			cors: true,
		})

		server.use(async (socket, next) => {
			try {
				const token = socket.handshake.auth.token?.split(' ')[1]

				this.logger.debug(`WS connection attempt with token: ${token}`, 'WebSocketAdapter')

				if (!token) {
					throw new Error('No token provided')
				}

				const payload = await this.jwtService.verifyAsync(token, {
					secret: process.env.JWT_SECRET,
				})

				this.logger.debug(`Token verified, payload: ${JSON.stringify(payload)}`, 'WebSocketAdapter')

				// 将用户信息添加到 socket
				socket.data.user = payload
				next()
			} catch (error) {
				this.logger.error(`WS auth error: ${error.message}`, error.stack, 'WebSocketAdapter')
				next(new Error('Authentication error'))
			}
		})

		return server
	}
}
