import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server } from 'socket.io'

@Injectable()
@WebSocketGateway()
export class EventsService {
	@WebSocketServer()
	private server: Server

	// 通知特定用户
	async notifyUser(userId: number, event: string, data: any) {
		this.server?.to(`user_${userId}`).emit(event, data)
	}

	// 通知聊天室
	async notifyChat(chatId: number, event: string, data: any) {
		this.server?.to(`chat_${chatId}`).emit(event, data)
	}

	// 广播给所有用户
	async broadcast(event: string, data: any) {
		this.server?.emit(event, data)
	}
}
