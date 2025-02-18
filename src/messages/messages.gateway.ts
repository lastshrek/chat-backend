import {
	WebSocketGateway,
	WebSocketServer,
	SubscribeMessage,
	OnGatewayConnection,
	OnGatewayDisconnect,
} from '@nestjs/websockets'
import { OnModuleInit, Inject, forwardRef } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { MessagesService } from './messages.service'
import { CreateMessageDto } from './dto/messages.dto'
import { MessagesEventsService } from './messages-events.service'
import { LoggerService } from '../common/services/logger.service'
import { WebSocketEvent } from './types/events'
import { PrismaService } from '../prisma/prisma.service'

@WebSocketGateway({
	cors: {
		origin: '*', // 在生产环境中应该限制来源
	},
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
	@WebSocketServer()
	server: Server

	private userSockets: Map<number, string> = new Map() // userId -> socketId
	private socketUsers: Map<string, number> = new Map() // socketId -> userId

	constructor(
		@Inject(forwardRef(() => MessagesService))
		private readonly messagesService: MessagesService,
		private readonly eventsService: MessagesEventsService,
		private readonly logger: LoggerService,
		private readonly prisma: PrismaService
	) {}

	onModuleInit() {
		// 订阅消息状态事件
		this.eventsService.messageStatus$.subscribe(event => {
			this.sendMessageToUser(event.senderId, 'messageStatusUpdated', {
				messageId: event.messageId,
				status: event.status,
			})
		})

		this.eventsService.messagesBatchStatus$.subscribe(event => {
			this.sendMessageToUser(event.senderId, 'messagesStatusUpdated', {
				messageIds: event.messageIds,
				status: event.status,
			})
		})
	}

	async handleConnection(client: Socket) {
		const user = client.data?.user
		this.logger.debug(`Client connected: ${client.id}`, 'WebSocket')
		this.logger.debug(`Auth data: ${JSON.stringify(client.handshake.auth)}`, 'WebSocket')
		this.logger.debug(`Client data: ${JSON.stringify(client.data)}`, 'WebSocket')
		this.logger.debug(`User data: ${JSON.stringify(user)}`, 'WebSocket')

		if (user) {
			const room = `user_${user.sub}`
			client.join(room)
			this.logger.debug(`User ${user.sub} joined room ${room}`, 'WebSocket')

			await this.messagesService.setUserOnline(user.sub)
			await this.sendFriendOnline(user.sub)

			// 发送离线期间的好友请求
			const pendingRequests = await this.prisma.friendRequest.findMany({
				where: {
					toId: user.sub,
					status: 'PENDING',
				},
				include: {
					from: true,
					to: true,
				},
			})

			// 发送每个待处理的请求
			for (const request of pendingRequests) {
				await this.sendFriendRequest(user.sub, {
					request,
					sender: {
						id: request.fromId,
						username: request.from.username,
						avatar: request.from.avatar,
					},
				})
			}
		} else {
			this.logger.warn(`No user data found for client ${client.id}`, 'WebSocket')
		}
	}

	async handleDisconnect(client: Socket) {
		const user = client.data.user
		this.logger.debug(`Client disconnected: ${client.id}, User: ${JSON.stringify(user)}`, 'WebSocket')

		if (user) {
			client.leave(`user_${user.sub}`)
			// 更新用户离线状态
			await this.messagesService.setUserOffline(user.sub)
			// 通知好友离线
			await this.sendFriendOffline(user.sub)
		}
	}

	@SubscribeMessage('join')
	handleJoin(client: Socket, chatId: number) {
		const user = client.data.user
		this.logger.debug(`User ${user.sub} joining chat ${chatId}`, 'WebSocket')
		client.join(`chat_${chatId}`)
		return { event: 'joined', data: { userId: user.sub, chatId } }
	}

	@SubscribeMessage('leave')
	handleLeave(client: Socket, chatId: number) {
		const user = client.data.user
		this.logger.debug(`User ${user.sub} leaving chat ${chatId}`, 'WebSocket')
		client.leave(`chat_${chatId}`)
		return { event: 'left', data: { userId: user.sub, chatId } }
	}

	@SubscribeMessage('sendMessage')
	async handleMessage(client: Socket, payload: any) {
		const user = client.data.user
		this.logger.debug(`Message from user ${user.sub}: ${JSON.stringify(payload)}`, 'WebSocket')

		// 确保发送者ID与token中的用户ID匹配
		if (payload.senderId !== user.sub) {
			throw new Error('Unauthorized message sender')
		}

		try {
			const message = await this.messagesService.create({
				...payload,
				senderId: user.sub,
			})

			// 发送到聊天室
			this.server.to(`chat_${payload.chatId}`).emit('newMessage', message)

			// 发送给接收者
			this.server.to(`user_${payload.receiverId}`).emit('newMessage', message)

			return { event: 'messageSent', data: message }
		} catch (error) {
			this.logger.error(`Error sending message: ${error.message}`, error.stack, 'WebSocket')
			return { event: 'error', data: error.message }
		}
	}

	@SubscribeMessage('typing')
	handleTyping(client: Socket, { chatId, userId }: { chatId: number; userId: number }) {
		client.broadcast.to(`chat_${chatId}`).emit('userTyping', { userId, chatId })
	}

	@SubscribeMessage('stopTyping')
	handleStopTyping(client: Socket, { chatId, userId }: { chatId: number; userId: number }) {
		client.broadcast.to(`chat_${chatId}`).emit('userStopTyping', { userId, chatId })
	}

	// 用于从其他服务发送消息
	async sendMessageToUser(userId: number, event: string, data: any) {
		const socketId = this.userSockets.get(userId)
		if (socketId) {
			this.server.to(`user_${userId}`).emit(event, data)
		}
	}

	async sendMessageToChat(chatId: number, event: string, data: any) {
		this.server.to(`chat_${chatId}`).emit(event, data)
	}

	// 发送好友请求通知
	async sendFriendRequest(toUserId: number, request: any) {
		this.logger.debug(`Sending friend request to user ${toUserId}`, 'WebSocket')
		this.logger.debug(`Request data: ${JSON.stringify(request)}`, 'WebSocket')

		// 检查用户是否在线
		const isOnline = await this.messagesService.isUserOnline(toUserId)
		this.logger.debug(`User ${toUserId} online status: ${isOnline}`, 'WebSocket')

		this.server.to(`user_${toUserId}`).emit(WebSocketEvent.FRIEND_REQUEST, {
			type: WebSocketEvent.FRIEND_REQUEST,
			data: request,
			timestamp: new Date(),
		})
	}

	// 发送好友请求接受通知
	async sendFriendRequestAccepted(toUserId: number, data: any) {
		this.server.to(`user_${toUserId}`).emit(WebSocketEvent.FRIEND_REQUEST_ACCEPTED, {
			type: WebSocketEvent.FRIEND_REQUEST_ACCEPTED,
			data,
			timestamp: new Date(),
		})
	}

	// 发送好友请求拒绝通知
	async sendFriendRequestRejected(toUserId: number, data: any) {
		this.server.to(`user_${toUserId}`).emit(WebSocketEvent.FRIEND_REQUEST_REJECTED, {
			type: WebSocketEvent.FRIEND_REQUEST_REJECTED,
			data,
			timestamp: new Date(),
		})
	}

	// 发送好友上线通知
	async sendFriendOnline(userId: number) {
		// 获取该用户的所有好友
		const friends = await this.messagesService.getUserFriends(userId)

		// 通知所有好友该用户上线
		friends.forEach(friend => {
			this.server.to(`user_${friend.friendId}`).emit(WebSocketEvent.FRIEND_ONLINE, {
				type: WebSocketEvent.FRIEND_ONLINE,
				data: { userId },
				timestamp: new Date(),
			})
		})
	}

	// 发送好友离线通知
	async sendFriendOffline(userId: number) {
		const friends = await this.messagesService.getUserFriends(userId)

		friends.forEach(friend => {
			this.server.to(`user_${friend.friendId}`).emit(WebSocketEvent.FRIEND_OFFLINE, {
				type: WebSocketEvent.FRIEND_OFFLINE,
				data: { userId },
				timestamp: new Date(),
			})
		})
	}
}
