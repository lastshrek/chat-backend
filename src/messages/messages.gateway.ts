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
import { JwtService } from '@nestjs/jwt'
import { MessageStatus } from '@prisma/client'

@WebSocketGateway({
	namespace: '/messages', // 确保命名空间唯一
	cors: {
		origin: '*', // 在生产环境要改为具体域名
		methods: ['GET', 'POST'],
		credentials: true,
		allowedHeaders: ['authorization', 'content-type'],
	},
	transports: ['websocket', 'polling'], // 支持 WebSocket 和轮询
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
	@WebSocketServer()
	server: Server

	private userSockets: Map<number, string> = new Map() // userId -> socketId
	private socketUsers: Map<string, number> = new Map() // socketId -> userId
	private chatRooms: Map<string, Set<string>> = new Map() // roomName -> Set of socketIds

	constructor(
		@Inject(forwardRef(() => MessagesService))
		private readonly messagesService: MessagesService,
		private readonly eventsService: MessagesEventsService,
		private readonly logger: LoggerService,
		private readonly prisma: PrismaService,
		private readonly jwtService: JwtService
	) {
		// 添加中间件来验证连接
		this.server?.use((socket, next) => {
			try {
				let token = socket.handshake.auth.token

				// 检查并移除 "Bearer " 前缀
				if (token && token.startsWith('Bearer ')) {
					token = token.substring(7)
				}

				if (!token) {
					this.logger.warn('Authentication error: Token not provided', 'WebSocket')
					return next(new Error('Authentication error: Token not provided'))
				}

				this.logger.debug(`Verifying token: ${token.substring(0, 20)}...`, 'WebSocket')

				const payload = this.jwtService.verify(token, {
					secret: process.env.JWT_SECRET,
				})

				this.logger.debug(`Token verified, payload: ${JSON.stringify(payload)}`, 'WebSocket')

				socket.data.user = payload
				next()
			} catch (error) {
				this.logger.error(`WebSocket authentication error: ${error.message}`, error.stack, 'WebSocket')
				next(new Error('Authentication error'))
			}
		})
	}

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
		this.logger.debug(`Client connected: ${client.id}`, 'WebSocket')
		this.logger.debug(`Auth data: ${JSON.stringify(client.handshake.auth)}`, 'WebSocket')

		try {
			// 从 auth 对象中获取 token
			let token = client.handshake.auth.token

			// 检查并移除 "Bearer " 前缀
			if (token && token.startsWith('Bearer ')) {
				token = token.substring(7)
			}

			if (!token) {
				this.logger.warn(`No token provided for client ${client.id}`, 'WebSocket')
				client.disconnect()
				return
			}

			this.logger.debug(`Verifying token: ${token.substring(0, 20)}...`, 'WebSocket')

			// 验证 token
			const payload = this.jwtService.verify(token, {
				secret: process.env.JWT_SECRET,
			})

			this.logger.debug(`Token verified, payload: ${JSON.stringify(payload)}`, 'WebSocket')

			// 保存用户信息到 socket 数据中
			client.data.user = payload

			// 用户成功认证后的处理
			const userId = payload.sub
			const room = `user_${userId}`
			client.join(room)

			this.logger.debug(`User ${userId} joined room ${room}`, 'WebSocket')

			// 更新用户在线状态
			await this.messagesService.setUserOnline(userId)
			await this.sendFriendOnline(userId)

			// 发送离线期间的好友请求
			const pendingRequests = await this.prisma.friendRequest.findMany({
				where: {
					toId: userId,
					status: 'PENDING',
				},
				include: {
					from: true,
					to: true,
				},
			})

			// 发送每个待处理的请求
			for (const request of pendingRequests) {
				await this.sendFriendRequest(userId, {
					request,
					sender: {
						id: request.fromId,
						username: request.from.username,
						avatar: request.from.avatar,
					},
				})
			}
		} catch (error) {
			this.logger.error(`Authentication error: ${error.message}`, error.stack, 'WebSocket')
			client.disconnect()
		}
	}

	async handleDisconnect(client: Socket) {
		const user = client.data?.user
		this.logger.debug(`Client disconnected: ${client.id}, User: ${JSON.stringify(user)}`, 'WebSocket')

		if (user) {
			// 从所有聊天室中移除
			for (const [roomName, members] of this.chatRooms.entries()) {
				if (members.has(client.id)) {
					members.delete(client.id)
					this.logger.debug(`Removed user ${user.sub} from chat room ${roomName}`, 'WebSocket')

					// 获取聊天ID
					const chatId = parseInt(roomName.replace('chat_', ''))

					// 通知聊天室中的其他成员有用户离开
					this.server.to(roomName).emit('userLeft', {
						chatId,
						user: {
							id: user.sub,
							username: user.username,
						},
						timestamp: new Date(),
					})
				}
			}

			client.leave(`user_${user.sub}`)
			// 更新用户离线状态
			await this.messagesService.setUserOffline(user.sub)
			// 通知好友离线
			await this.sendFriendOffline(user.sub)
		}
	}

	@SubscribeMessage('join')
	async handleJoin(@MessageBody() data: { chatId: number }, @ConnectedSocket() client: Socket) {
		try {
			this.logger.debug(`Client ${client.id} attempting to join chat ${data.chatId}`, 'WebSocket')

			// 检查用户认证
			const user = client.data?.user

			if (!user || !user.sub) {
				this.logger.warn(`No authenticated user found for client ${client.id}`, 'WebSocket')
				client.emit('error', { message: 'Authentication required' })
				return { success: false, error: 'Authentication required' }
			}

			// 加入聊天室
			const roomName = `chat_${data.chatId}`
			client.join(roomName)

			// 更新我们自己的聊天室成员跟踪
			if (!this.chatRooms.has(roomName)) {
				this.chatRooms.set(roomName, new Set())
			}
			this.chatRooms.get(roomName).add(client.id)

			this.logger.debug(`User ${user.sub} joined chat room ${roomName}`, 'WebSocket')
			this.logger.debug(`Chat room ${roomName} now has ${this.chatRooms.get(roomName).size} members`, 'WebSocket')

			// 通知聊天室中的其他成员有新用户加入
			client.to(roomName).emit('userJoined', {
				chatId: data.chatId,
				user: {
					id: user.sub,
					username: user.username,
				},
				timestamp: new Date(),
			})

			// 更新消息状态为已读
			await this.messagesService.markMessagesAsRead(data.chatId, user.sub)

			return {
				success: true,
				message: `Joined chat ${data.chatId}`,
			}
		} catch (error) {
			this.logger.error(`Error joining chat: ${error.message}`, error.stack, 'WebSocket')
			return { success: false, error: error.message }
		}
	}

	@SubscribeMessage('leave')
	handleLeave(@MessageBody() data: { chatId: number }, @ConnectedSocket() client: Socket) {
		try {
			const user = client.data?.user

			if (!user || !user.sub) {
				this.logger.warn(`No authenticated user found for client ${client.id}`, 'WebSocket')
				client.emit('error', { message: 'Authentication required' })
				return { success: false, error: 'Authentication required' }
			}

			const roomName = `chat_${data.chatId}`
			this.logger.debug(`User ${user.sub} leaving chat ${data.chatId}`, 'WebSocket')

			// 离开聊天室
			client.leave(roomName)

			// 更新我们自己的聊天室成员跟踪
			if (this.chatRooms.has(roomName)) {
				this.chatRooms.get(roomName).delete(client.id)
				this.logger.debug(`Chat room ${roomName} now has ${this.chatRooms.get(roomName).size} members`, 'WebSocket')
			}

			// 通知聊天室中的其他成员有用户离开
			client.to(roomName).emit('userLeft', {
				chatId: data.chatId,
				user: {
					id: user.sub,
					username: user.username,
				},
				timestamp: new Date(),
			})

			return { success: true, message: `Left chat ${data.chatId}` }
		} catch (error) {
			this.logger.error(`Error leaving chat: ${error.message}`, error.stack, 'WebSocket')
			return { success: false, error: error.message }
		}
	}

	@SubscribeMessage('message')
	async handleMessage(
		@MessageBody() data: { type: string; message: CreateMessageDto },
		@ConnectedSocket() client: Socket
	) {
		try {
			const userId = client.data.user.sub
			const messageData = data.message // 获取实际的消息数据
			this.logger.debug(`received message: ${JSON.stringify(messageData)}`, 'MessagesGateway')
			const canSend = await this.messagesService.canUserSendToChat(userId, messageData.chatId)

			if (!canSend) {
				throw new Error('No permission to send message to this chat')
			}

			// 创建消息
			const message = await this.messagesService.create({
				...messageData,
				senderId: userId,
				status: MessageStatus.SENT,
			})

			this.logger.debug(`Created message: ${JSON.stringify(message)}`, 'MessagesGateway')

			// 1. 发送给发送者确认消息
			client.emit(WebSocketEvent.MESSAGE_SENT, {
				type: WebSocketEvent.MESSAGE_SENT,
				data: message,
				tempId: messageData.tempId, // 返回临时ID以便前端关联
				timestamp: new Date(),
			})

			// 2. 发送给聊天室其他成员
			client.to(`chat_${messageData.chatId}`).emit('message', {
				type: WebSocketEvent.NEW_MESSAGE,
				data: message,
				timestamp: new Date(),
			})

			// 3. 如果是私聊，确保接收者收到消息
			if (messageData.receiverId) {
				const receiverSocketId = this.userSockets.get(messageData.receiverId)
				if (receiverSocketId) {
					this.server.to(receiverSocketId).emit('message', {
						type: WebSocketEvent.NEW_MESSAGE,
						data: message,
						timestamp: new Date(),
					})
				}
			}

			return message
		} catch (error) {
			this.logger.error(`Error sending message: ${error.message}`, error.stack)
			// 发送错误消息给发送者
			client.emit('error', {
				type: 'MESSAGE_ERROR',
				error: error.message,
				tempId: data.message?.tempId, // 返回临时ID以便前端处理错误
				timestamp: new Date(),
			})
			throw error
		}
	}

	@SubscribeMessage('typing')
	async handleTyping(@MessageBody() data: { chatId: number; isTyping: boolean }, @ConnectedSocket() client: Socket) {
		try {
			const user = client.data?.user

			if (!user || !user.sub) {
				this.logger.warn(`No authenticated user found for client ${client.id}`, 'WebSocket')
				client.emit('error', { message: 'Authentication required' })
				return { success: false, error: 'Authentication required' }
			}

			const chatId = data.chatId
			const isTyping = data.isTyping
			const roomName = `chat_${chatId}`

			this.logger.debug(`User ${user.sub} ${isTyping ? 'is typing' : 'stopped typing'} in chat ${chatId}`, 'WebSocket')

			// 确保用户在聊天室中
			if (!client.rooms.has(roomName)) {
				this.logger.debug(`User ${user.sub} is not in room ${roomName}, joining now`, 'WebSocket')
				client.join(roomName)

				// 更新我们自己的聊天室成员跟踪
				if (!this.chatRooms.has(roomName)) {
					this.chatRooms.set(roomName, new Set())
				}
				this.chatRooms.get(roomName).add(client.id)
			}

			// 获取聊天室成员数量
			const roomSize = this.chatRooms.has(roomName) ? this.chatRooms.get(roomName).size : 0
			this.logger.debug(`Chat room ${roomName} has ${roomSize} members`, 'WebSocket')

			// 获取用户信息
			const userInfo = await this.prisma.user.findUnique({
				where: { id: user.sub },
				select: { id: true, username: true, avatar: true },
			})

			// 构建事件数据
			const eventData = {
				chatId,
				user: userInfo,
				isTyping,
				timestamp: new Date(),
			}

			// 向聊天室中的其他用户广播
			this.logger.debug(`Broadcasting typing event to room ${roomName} (${roomSize} members)`, 'WebSocket')

			// 使用更安全的方式广播消息
			try {
				// 尝试使用 client.to 方法广播
				client.to(roomName).emit('userTyping', eventData)
				this.logger.debug(`Broadcast using client.to complete`, 'WebSocket')
			} catch (err) {
				this.logger.error(`Error broadcasting with client.to: ${err.message}`, err.stack, 'WebSocket')
			}

			// 尝试使用 server.to 方法广播
			try {
				this.server.to(roomName).emit('userTyping', eventData)
				this.logger.debug(`Broadcast using server.to complete`, 'WebSocket')
			} catch (err) {
				this.logger.error(`Error broadcasting with server.to: ${err.message}`, err.stack, 'WebSocket')
			}

			// 如果上述方法都失败，尝试直接向每个成员发送消息
			if (this.chatRooms.has(roomName)) {
				const members = this.chatRooms.get(roomName)
				this.logger.debug(`Room members: ${Array.from(members).join(', ')}`, 'WebSocket')

				// 向每个成员单独发送消息，除了发送者
				for (const memberId of members) {
					if (memberId !== client.id) {
						this.logger.debug(`Attempting to send typing event to member ${memberId}`, 'WebSocket')
						try {
							// 安全地获取 socket
							if (this.server && this.server.sockets) {
								const sockets = this.server.sockets.sockets
								if (sockets && typeof sockets.get === 'function') {
									const socket = sockets.get(memberId)
									if (socket) {
										socket.emit('userTyping', eventData)
										this.logger.debug(`Successfully sent typing event to member ${memberId}`, 'WebSocket')
									} else {
										this.logger.warn(`Socket for member ${memberId} not found`, 'WebSocket')
										// 如果找不到 socket，可能是已断开连接，从聊天室中移除
										members.delete(memberId)
									}
								} else {
									this.logger.warn(`Server.sockets.sockets.get is not a function`, 'WebSocket')
								}
							} else {
								this.logger.warn(`Server or server.sockets is undefined`, 'WebSocket')
							}
						} catch (err) {
							this.logger.error(`Error sending to member ${memberId}: ${err.message}`, err.stack, 'WebSocket')
						}
					}
				}
			}

			this.logger.debug(`Typing event broadcast complete`, 'WebSocket')

			return { success: true }
		} catch (error) {
			this.logger.error(`Error in typing event: ${error.message}`, error.stack, 'WebSocket')
			return { success: false, error: error.message }
		}
	}

	@SubscribeMessage('stopTyping')
	async handleStopTyping(@MessageBody() data: { chatId: number }, @ConnectedSocket() client: Socket) {
		try {
			const user = client.data?.user

			if (!user || !user.sub) {
				this.logger.warn(`No authenticated user found for client ${client.id}`, 'WebSocket')
				client.emit('error', { message: 'Authentication required' })
				return { success: false, error: 'Authentication required' }
			}

			const chatId = data.chatId
			const roomName = `chat_${chatId}`

			this.logger.debug(`User ${user.sub} stopped typing in chat ${chatId}`, 'WebSocket')

			// 确保用户在聊天室中
			if (!client.rooms.has(roomName)) {
				this.logger.debug(`User ${user.sub} is not in room ${roomName}, joining now`, 'WebSocket')
				client.join(roomName)

				// 更新我们自己的聊天室成员跟踪
				if (!this.chatRooms.has(roomName)) {
					this.chatRooms.set(roomName, new Set())
				}
				this.chatRooms.get(roomName).add(client.id)
			}

			// 获取聊天室成员数量
			const roomSize = this.chatRooms.has(roomName) ? this.chatRooms.get(roomName).size : 0
			this.logger.debug(`Chat room ${roomName} has ${roomSize} members`, 'WebSocket')

			// 获取用户信息
			const userInfo = await this.prisma.user.findUnique({
				where: { id: user.sub },
				select: { id: true, username: true, avatar: true },
			})

			// 构建事件数据
			const eventData = {
				chatId,
				user: userInfo,
				isTyping: false,
				timestamp: new Date(),
			}

			// 向聊天室中的其他用户广播
			this.logger.debug(`Broadcasting stop typing event to room ${roomName} (${roomSize} members)`, 'WebSocket')

			// 使用更安全的方式广播消息
			try {
				// 尝试使用 client.to 方法广播
				client.to(roomName).emit('userTyping', eventData)
				this.logger.debug(`Broadcast using client.to complete`, 'WebSocket')
			} catch (err) {
				this.logger.error(`Error broadcasting with client.to: ${err.message}`, err.stack, 'WebSocket')
			}

			// 尝试使用 server.to 方法广播
			try {
				this.server.to(roomName).emit('userTyping', eventData)
				this.logger.debug(`Broadcast using server.to complete`, 'WebSocket')
			} catch (err) {
				this.logger.error(`Error broadcasting with server.to: ${err.message}`, err.stack, 'WebSocket')
			}

			this.logger.debug(`Stop typing event broadcast complete`, 'WebSocket')

			return { success: true }
		} catch (error) {
			this.logger.error(`Error in stop typing event: ${error.message}`, error.stack, 'WebSocket')
			return { success: false, error: error.message }
		}
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

	// 添加群聊相关的事件处理方法
	async sendGroupChatInvitation(userId: number, data: any) {
		this.logger.debug(`Sending group chat invitation to user ${userId}`, 'WebSocket')
		this.server.to(`user_${userId}`).emit(WebSocketEvent.GROUP_CHAT_INVITATION, {
			type: WebSocketEvent.GROUP_CHAT_INVITATION,
			data,
			timestamp: new Date(),
		})
	}

	async sendGroupChatUpdated(chatId: number, data: any) {
		this.logger.debug(`Sending group chat updated notification to chat ${chatId}`, 'WebSocket')
		this.server.to(`chat_${chatId}`).emit(WebSocketEvent.GROUP_CHAT_UPDATED, {
			type: WebSocketEvent.GROUP_CHAT_UPDATED,
			data,
			timestamp: new Date(),
		})
	}

	async sendGroupMembersAdded(chatId: number, data: any) {
		this.logger.debug(`Sending group members added notification to chat ${chatId}`, 'WebSocket')
		this.server.to(`chat_${chatId}`).emit(WebSocketEvent.GROUP_MEMBERS_ADDED, {
			type: WebSocketEvent.GROUP_MEMBERS_ADDED,
			data,
			timestamp: new Date(),
		})
	}

	async sendGroupMemberRemoved(chatId: number, data: any) {
		this.logger.debug(`Sending group member removed notification to chat ${chatId}`, 'WebSocket')
		this.server.to(`chat_${chatId}`).emit(WebSocketEvent.GROUP_MEMBER_REMOVED, {
			type: WebSocketEvent.GROUP_MEMBER_REMOVED,
			data,
			timestamp: new Date(),
		})
	}

	async sendGroupMemberRoleUpdated(chatId: number, data: any) {
		this.logger.debug(`Sending group member role updated notification to chat ${chatId}`, 'WebSocket')
		this.server.to(`chat_${chatId}`).emit(WebSocketEvent.GROUP_MEMBER_ROLE_UPDATED, {
			type: WebSocketEvent.GROUP_MEMBER_ROLE_UPDATED,
			data,
			timestamp: new Date(),
		})
	}

	async sendGroupChatDissolved(userId: number, data: any) {
		this.logger.debug(`Sending group chat dissolved notification to user ${userId}`, 'WebSocket')
		this.server.to(`user_${userId}`).emit(WebSocketEvent.GROUP_CHAT_DISSOLVED, {
			type: WebSocketEvent.GROUP_CHAT_DISSOLVED,
			data,
			timestamp: new Date(),
		})
	}
}
