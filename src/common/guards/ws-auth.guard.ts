import { CanActivate, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { WsException } from '@nestjs/websockets'
import { Socket } from 'socket.io'
import { LoggerService } from '../services/logger.service'

@Injectable()
export class WsAuthGuard implements CanActivate {
	constructor(private jwtService: JwtService, private logger: LoggerService) {}

	async canActivate(context: any): Promise<boolean> {
		try {
			const client: Socket = context.switchToWs().getClient()
			const authToken = client.handshake.auth.token
			const token = authToken?.split(' ')[1] // 直接分割 Bearer token

			this.logger.debug(`Raw auth token: ${authToken}`, 'WsAuthGuard')
			this.logger.debug(`Extracted token: ${token}`, 'WsAuthGuard')

			if (!token) {
				this.logger.warn('No token provided in WebSocket connection', 'WsAuthGuard')
				throw new WsException('Unauthorized')
			}

			try {
				// 先尝试解码看看内容
				const decoded = this.jwtService.decode(token)
				this.logger.debug(`Decoded token payload: ${JSON.stringify(decoded)}`, 'WsAuthGuard')

				// 验证 token
				const payload = await this.jwtService.verifyAsync(token)
				this.logger.debug(`Verified token payload: ${JSON.stringify(payload)}`, 'WsAuthGuard')

				// 将用户信息添加到 socket 对象中
				client.data = { user: payload }
				this.logger.debug(`Set client.data: ${JSON.stringify(client.data)}`, 'WsAuthGuard')

				return true
			} catch (verifyError) {
				this.logger.error(`Token verification failed: ${verifyError.message}`, verifyError.stack, 'WsAuthGuard')
				this.logger.debug(`JWT_SECRET used: ${process.env.JWT_SECRET}`, 'WsAuthGuard')
				throw verifyError
			}
		} catch (err) {
			this.logger.error(`WS Auth error: ${err.message}`, err.stack, 'WsAuthGuard')
			throw new WsException('Unauthorized')
		}
	}
}
