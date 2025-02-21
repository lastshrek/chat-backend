import {
	WebSocketGateway,
	WebSocketServer,
	SubscribeMessage,
	OnGatewayConnection,
	OnGatewayDisconnect,
	MessageBody,
	ConnectedSocket,
} from '@nestjs/websockets'
import { OnModuleInit, Inject, forwardRef } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { MessagesService } from './messages.service'
import { CreateMessageDto } from './dto/messages.dto'
import { MessagesEventsService } from './messages-events.service'
import { LoggerService } from '../common/services/logger.service'
import { WebSocketEvent } from './types/events'
import { PrismaService } from '../prisma/prisma.service'
import { MessageType } from '@prisma/client'

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

	@SubscribeMessage('message')
	async handleMessage(
		@MessageBody()
		data: {
			chatId: number
			receiverId: number
			type: MessageType
			content: string
			tempId: number
			metadata?: any
		},
		@ConnectedSocket() client: Socket
	) {
		const user = client.data.user
		if (!user) {
			throw new Error('Unauthorized')
		}

		this.logger.debug(`Message from user ${user.sub}: ${JSON.stringify(data)}`, 'MessagesGateway')

		try {
			// 创建消息
			const message = await this.messagesService.create({
				chatId: data.chatId,
				senderId: user.sub,
				receiverId: data.receiverId,
				type: data.type,
				content: data.content,
				metadata: data.metadata,
			})

			// 1. 只发送给聊天室其他成员
			client.to(`chat_${data.chatId}`).emit('message', {
				type: 'message',
				data: message,
				timestamp: new Date(),
			})

			// 2. 同时发送给接收者的个人房间（如果接收者不在聊天室）
			if (!this.server.sockets.adapter.rooms.get(`chat_${data.chatId}`)?.has(client.id)) {
				this.server.to(`user_${data.receiverId}`).emit('message', {
					type: 'message',
					data: message,
					timestamp: new Date(),
				})
			}

			// 3. 发送成功状态给发送者
			client.emit('messageSent', {
				type: 'messageSent',
				data: {
					tempId: data.tempId,
					message: {
						id: message.id,
						chatId: message.chatId,
						senderId: message.senderId,
						receiverId: message.receiverId,
						type: message.type,
						content: message.content,
						status: 'sent',
						createdAt: message.createdAt,
						sender: message.sender,
						receiver: message.receiver,
					},
				},
				timestamp: new Date(),
			})

			// 4. 检查接收者是否在线并处理送达状态
			const isReceiverOnline = await this.messagesService.isUserOnline(data.receiverId)
			if (isReceiverOnline) {
				this.logger.debug(`Receiver ${data.receiverId} is online, sending delivered status`, 'MessagesGateway')

				// 发送已送达状态给发送者
				client.emit('messageDelivered', {
					type: 'messageDelivered',
					data: {
						tempId: data.tempId,
						messageId: message.id,
						status: 'delivered',
					},
					timestamp: new Date(),
				})
			} else {
				this.logger.debug(`Receiver ${data.receiverId} is offline`, 'MessagesGateway')
			}

			return message
		} catch (error) {
			this.logger.error(`Error sending message: ${error.message}`, error.stack, 'MessagesGateway')

			// 发送失败状态给发送者
			client.emit('messageError', {
				type: 'messageError',
				data: {
					tempId: data.tempId,
					error: error.message,
					originalMessage: data,
				},
				timestamp: new Date(),
			})
			throw error
		}
	}

	@SubscribeMessage('typing')
	async handleTyping(@MessageBody() data: { chatId: number; userId: number }, @ConnectedSocket() client: Socket) {
		this.logger.debug(`User ${data.userId} is typing in chat ${data.chatId}`, 'MessagesGateway')

		// 检查房间信息
		const room = this.server.sockets.adapter.rooms.get(`chat_${data.chatId}`)
		const sockets = Array.from(room || [])

		this.logger.debug(
			`Room chat_${data.chatId} has ${sockets.length} clients: ${sockets.join(', ')}`,
			'MessagesGateway'
		)

		// 广播给房间内除了发送者之外的其他用户
		client.to(`chat_${data.chatId}`).emit('userTyping', {
			type: 'userTyping',
			data: {
				userId: data.userId,
				chatId: data.chatId,
			},
			timestamp: new Date(),
		})

		this.logger.debug(
			`Sent userTyping event to other users in chat ${data.chatId} for user ${data.userId}`,
			'MessagesGateway'
		)
	}

	@SubscribeMessage('stopTyping')
	async handleStopTyping(@MessageBody() data: { chatId: number; userId: number }, @ConnectedSocket() client: Socket) {
		this.logger.debug(`User ${data.userId} stopped typing in chat ${data.chatId}`, 'MessagesGateway')

		// 广播给房间内除了发送者之外的其他用户
		client.to(`chat_${data.chatId}`).emit('userStopTyping', {
			type: 'userStopTyping',
			data: {
				userId: data.userId,
				chatId: data.chatId,
			},
			timestamp: new Date(),
		})

		this.logger.debug(
			`Sent userStopTyping event to other users in chat ${data.chatId} for user ${data.userId}`,
			'MessagesGateway'
		)
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
	async sendFriendRequestAccepted(data: {
		fromUserId: number // 发送请求的用户
		toUserId: number // 接受请求的用户
		request: any
		chat: any
	}) {
		this.logger.debug(
			`Sending friend request accepted notification to users ${data.fromUserId} and ${data.toUserId}`,
			'MessagesGateway'
		)

		// 给发送请求的用户发送通知
		this.server.to(`user_${data.fromUserId}`).emit(WebSocketEvent.FRIEND_REQUEST_ACCEPTED, {
			type: WebSocketEvent.FRIEND_REQUEST_ACCEPTED,
			data: {
				request: data.request,
				accepter: {
					id: data.toUserId,
					username: data.request.to.username,
					avatar: data.request.to.avatar,
				},
				chat: data.chat,
			},
			timestamp: new Date(),
		})

		// 给接受请求的用户发送通知
		this.server.to(`user_${data.toUserId}`).emit(WebSocketEvent.FRIEND_REQUEST_ACCEPTED, {
			type: WebSocketEvent.FRIEND_REQUEST_ACCEPTED,
			data: {
				request: data.request,
				friend: {
					id: data.fromUserId,
					username: data.request.from.username,
					avatar: data.request.from.avatar,
				},
				chat: data.chat,
			},
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
