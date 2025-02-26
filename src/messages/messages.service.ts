import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateMessageDto, UpdateMessageDto, UpdateMessageStatusDto, MessageMetadata } from './dto/messages.dto'
import { MessageStatus, MessageType, Prisma } from '@prisma/client'
import { MessagesEventsService } from './messages-events.service'
import { RedisService } from '../redis/redis.service'
import { LoggerService } from '../common/services/logger.service'

@Injectable()
export class MessagesService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly redis: RedisService,
		private readonly eventsService: MessagesEventsService,
		private readonly logger: LoggerService
	) {}

	private validateMessageMetadata(type: MessageType, metadata?: MessageMetadata): void {
		switch (type) {
			case MessageType.FILE:
				if (!metadata || !('fileName' in metadata) || !('fileSize' in metadata)) {
					throw new BadRequestException('File message requires fileName and fileSize')
				}
				break
			case MessageType.VOICE:
				if (!metadata || !('duration' in metadata) || !('url' in metadata)) {
					throw new BadRequestException('Voice message requires duration and url')
				}
				break
			case MessageType.LINK:
				if (!metadata || !('url' in metadata)) {
					throw new BadRequestException('Link message requires url')
				}
				break
			case MessageType.IMAGE:
				if (!metadata || !('url' in metadata) || !('width' in metadata) || !('height' in metadata)) {
					throw new BadRequestException('Image message requires url, width and height')
				}
				break
			case MessageType.VIDEO:
				if (!metadata || !('url' in metadata) || !('duration' in metadata)) {
					throw new BadRequestException('Video message requires url and duration')
				}
				break
		}
	}

	async create(data: {
		chatId: number
		senderId: number
		receiverId: number
		type: MessageType
		content: string
		metadata?: any
		status?: MessageStatus
	}) {
		return this.prisma.message.create({
			data: {
				chatId: data.chatId,
				senderId: data.senderId,
				receiverId: data.receiverId,
				type: data.type,
				content: data.content,
				metadata: data.metadata,
				status: data.status || MessageStatus.SENT,
			},
			include: {
				sender: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
				receiver: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})
	}

	async findAll(chatId: number, type?: MessageType) {
		return this.prisma.message.findMany({
			where: {
				chatId,
				...(type && { type }),
			},
			include: {
				sender: true,
				receiver: true,
			},
			orderBy: {
				createdAt: 'desc',
			},
		})
	}

	async update(id: number, updateMessageDto: UpdateMessageDto) {
		// 创建一个新对象，只包含我们想要更新的字段
		const updateData: Prisma.MessageUpdateInput = {}

		if (updateMessageDto.content !== undefined) {
			updateData.content = updateMessageDto.content
		}

		if (updateMessageDto.type !== undefined) {
			updateData.type = updateMessageDto.type
		}

		if (updateMessageDto.status !== undefined) {
			updateData.status = updateMessageDto.status
		}

		if (updateMessageDto.metadata !== undefined) {
			updateData.metadata = JSON.parse(JSON.stringify(updateMessageDto.metadata)) as Prisma.JsonValue
		}

		return this.prisma.message.update({
			where: { id },
			data: updateData,
		})
	}

	async updateStatus(id: number, { status }: UpdateMessageStatusDto) {
		const message = await this.prisma.message.update({
			where: { id },
			data: { status },
			include: {
				sender: true,
				receiver: true,
				chat: true,
			},
		})

		// 使用事件服务发送通知
		this.eventsService.emitMessageStatus({
			messageId: id,
			status,
			senderId: message.senderId,
		})

		return message
	}

	async updateManyStatus(ids: number[], status: MessageStatus) {
		const result = await this.prisma.message.updateMany({
			where: {
				id: { in: ids },
			},
			data: { status },
		})

		const messages = await this.prisma.message.findMany({
			where: {
				id: { in: ids },
			},
			include: {
				sender: true,
			},
		})

		// 按发送者分组通知
		const senderGroups = new Map<number, number[]>()
		messages.forEach(msg => {
			const messageIds = senderGroups.get(msg.senderId) || []
			messageIds.push(msg.id)
			senderGroups.set(msg.senderId, messageIds)
		})

		// 使用事件服务发送通知
		for (const [senderId, messageIds] of senderGroups) {
			this.eventsService.emitMessagesBatchStatus({
				senderId,
				messageIds,
				status,
			})
		}

		return result
	}

	async getUnreadMessages(userId: number) {
		return this.prisma.message.findMany({
			where: {
				receiverId: userId,
				status: {
					not: MessageStatus.READ,
				},
			},
			include: {
				sender: true,
				chat: true,
			},
			orderBy: {
				createdAt: 'desc',
			},
		})
	}

	async remove(id: number) {
		return this.prisma.message.delete({
			where: { id },
		})
	}

	async getUserChats(userId: number, page = 1, limit = 20) {
		// 1. 获取用户的所有聊天
		const chats = await this.prisma.chat.findMany({
			where: {
				participants: {
					some: {
						userId,
					},
				},
			},
			include: {
				participants: {
					include: {
						user: {
							select: {
								id: true,
								username: true,
								avatar: true,
							},
						},
					},
				},
				messages: {
					take: 1,
					orderBy: {
						createdAt: 'desc',
					},
					include: {
						sender: {
							select: {
								id: true,
								username: true,
								avatar: true,
							},
						},
					},
				},
				_count: {
					select: {
						messages: true,
					},
				},
			},
			orderBy: {
				updatedAt: 'desc', // 按最后活动时间排序
			},
			skip: (page - 1) * limit,
			take: limit,
		})

		// 2. 获取每个聊天的未读消息数
		const chatsWithUnread = await Promise.all(
			chats.map(async chat => {
				const unreadCount = await this.prisma.message.count({
					where: {
						chatId: chat.id,
						receiverId: userId,
						status: {
							not: 'READ',
						},
					},
				})

				return {
					id: chat.id,
					name: chat.name,
					type: chat.type,
					participants: chat.participants.map(p => ({
						id: p.user.id,
						username: p.user.username,
						avatar: p.user.avatar,
					})),
					otherUser: chat.type === 'DIRECT' ? chat.participants.find(p => p.userId !== userId)?.user : null,
					lastMessage: chat.messages[0] || null,
					unreadCount,
					totalMessages: chat._count.messages,
					updatedAt: chat.updatedAt,
					createdAt: chat.createdAt,
				}
			})
		)

		return {
			chats: chatsWithUnread,
			hasMore: chatsWithUnread.length === limit,
			total: await this.prisma.chat.count({
				where: {
					participants: {
						some: {
							userId,
						},
					},
				},
			}),
		}
	}

	async createChat(userIds: number[]) {
		// 检查是否已存在这些用户之间的聊天
		const existingChat = await this.prisma.chat.findFirst({
			where: {
				type: 'DIRECT',
				AND: userIds.map(userId => ({
					participants: {
						some: {
							userId,
						},
					},
				})),
			},
			include: {
				participants: {
					include: {
						user: true,
					},
				},
			},
		})

		if (existingChat) {
			return existingChat
		}

		// 创建新聊天
		return this.prisma.chat.create({
			data: {
				type: 'DIRECT',
				participants: {
					create: userIds.map(userId => ({
						userId,
					})),
				},
			},
			include: {
				participants: {
					include: {
						user: true,
					},
				},
			},
		})
	}

	async setUserOnline(userId: number) {
		await this.redis.set(`user:${userId}:online`, '1')
	}

	async setUserOffline(userId: number) {
		await this.redis.del(`user:${userId}:online`)
	}

	async isUserOnline(userId: number) {
		const status = await this.redis.get(`user:${userId}:online`)
		return status === '1'
	}

	async getUserFriends(userId: number) {
		return this.prisma.friend.findMany({
			where: {
				userId: userId,
			},
			select: {
				friendId: true,
				friend: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})
	}

	async getChatById(chatId: number) {
		const chat = await this.prisma.chat.findUnique({
			where: { id: chatId },
			include: {
				participants: {
					include: {
						user: {
							select: {
								id: true,
								username: true,
								avatar: true,
							},
						},
					},
				},
				messages: {
					take: 1,
					orderBy: {
						createdAt: 'desc',
					},
					include: {
						sender: {
							select: {
								id: true,
								username: true,
								avatar: true,
							},
						},
					},
				},
			},
		})

		if (!chat) {
			throw new NotFoundException('Chat not found')
		}

		return {
			id: chat.id,
			name: chat.name,
			type: chat.type,
			participants: chat.participants.map(p => ({
				id: p.user.id,
				username: p.user.username,
				avatar: p.user.avatar,
			})),
			lastMessage: chat.messages[0] || null,
			createdAt: chat.createdAt,
			updatedAt: chat.updatedAt,
		}
	}

	// 获取聊天消息历史
	async getChatMessages(chatId: number, page = 1, limit = 20) {
		const messages = await this.prisma.message.findMany({
			where: {
				chatId,
			},
			include: {
				sender: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
				receiver: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
			orderBy: {
				createdAt: 'desc',
			},
			skip: (page - 1) * limit,
			take: limit,
		})

		const total = await this.prisma.message.count({
			where: {
				chatId,
			},
		})

		return {
			messages: messages.reverse(), // 返回正序的消息
			hasMore: messages.length === limit,
			total,
		}
	}

	async getOrCreateDirectChat(currentUserId: number, targetUserId: number) {
		this.logger.debug(
			`Getting or creating direct chat between users ${currentUserId} and ${targetUserId}`,
			'MessagesService'
		)

		// 检查用户是否存在
		const targetUser = await this.prisma.user.findUnique({
			where: { id: targetUserId },
			select: { id: true, username: true, avatar: true },
		})

		if (!targetUser) {
			throw new NotFoundException(`User with ID ${targetUserId} not found`)
		}

		// 查找现有的直接聊天
		const existingChat = await this.prisma.chat.findFirst({
			where: {
				type: 'DIRECT',
				AND: [
					{
						participants: {
							some: { userId: currentUserId },
						},
					},
					{
						participants: {
							some: { userId: targetUserId },
						},
					},
				],
			},
			include: {
				participants: {
					include: {
						user: {
							select: {
								id: true,
								username: true,
								avatar: true,
							},
						},
					},
				},
			},
		})

		// 如果找到现有聊天，直接返回
		if (existingChat) {
			this.logger.debug(`Found existing direct chat: ${existingChat.id}`, 'MessagesService')

			return {
				...existingChat,
				participants: existingChat.participants.map(p => p.user),
				isNew: false,
			}
		}

		// 如果不存在，创建新的聊天
		this.logger.debug(`Creating new direct chat between users ${currentUserId} and ${targetUserId}`, 'MessagesService')

		// 获取当前用户信息
		const currentUser = await this.prisma.user.findUnique({
			where: { id: currentUserId },
			select: { id: true, username: true, avatar: true },
		})

		// 创建新聊天
		const newChat = await this.prisma.chat.create({
			data: {
				type: 'DIRECT',
				participants: {
					create: [{ userId: currentUserId }, { userId: targetUserId }],
				},
			},
			include: {
				participants: {
					include: {
						user: {
							select: {
								id: true,
								username: true,
								avatar: true,
							},
						},
					},
				},
			},
		})

		this.logger.debug(`Created new direct chat: ${newChat.id}`, 'MessagesService')

		return {
			...newChat,
			participants: [currentUser, targetUser],
			isNew: true,
		}
	}

	async getMessagesAroundId(messageId: number, limit = 20) {
		// 首先获取目标消息，确认它存在并获取其聊天ID和创建时间
		const targetMessage = await this.prisma.message.findUnique({
			where: { id: messageId },
			select: { chatId: true, createdAt: true },
		})

		if (!targetMessage) {
			throw new NotFoundException(`Message with ID ${messageId} not found`)
		}

		// 计算每边应该获取的消息数量
		const halfLimit = Math.floor(limit / 2)

		// 获取目标消息之前的消息
		const beforeMessages = await this.prisma.message.findMany({
			where: {
				chatId: targetMessage.chatId,
				createdAt: { lt: targetMessage.createdAt },
			},
			orderBy: { createdAt: 'desc' },
			take: halfLimit,
			include: {
				sender: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
				receiver: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})

		// 获取目标消息
		const currentMessage = await this.prisma.message.findUnique({
			where: { id: messageId },
			include: {
				sender: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
				receiver: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})

		// 获取目标消息之后的消息
		const afterMessages = await this.prisma.message.findMany({
			where: {
				chatId: targetMessage.chatId,
				createdAt: { gt: targetMessage.createdAt },
			},
			orderBy: { createdAt: 'asc' },
			take: halfLimit,
			include: {
				sender: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
				receiver: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})

		// 检查是否有更多消息
		const hasMoreBefore = beforeMessages.length === halfLimit
		const hasMoreAfter = afterMessages.length === halfLimit

		// 获取聊天中的总消息数
		const total = await this.prisma.message.count({
			where: { chatId: targetMessage.chatId },
		})

		// 组合所有消息并按时间排序
		const allMessages = [...beforeMessages.reverse(), currentMessage, ...afterMessages].sort(
			(a, b) => a.createdAt.getTime() - b.createdAt.getTime()
		)

		return {
			messages: allMessages,
			hasMoreBefore,
			hasMoreAfter,
			total,
		}
	}

	async getMessagesBefore(messageId: number, chatId: number, limit = 20) {
		// 首先获取目标消息，确认它存在并且属于指定的聊天室
		const targetMessage = await this.prisma.message.findFirst({
			where: {
				id: messageId,
				chatId: chatId,
			},
			include: {
				sender: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
				receiver: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})

		if (!targetMessage) {
			throw new NotFoundException(`Message with ID ${messageId} not found in chat ${chatId}`)
		}

		// 获取目标消息之前的消息（不包括目标消息）
		const beforeMessages = await this.prisma.message.findMany({
			where: {
				chatId: chatId,
				createdAt: { lt: targetMessage.createdAt },
			},
			orderBy: { createdAt: 'desc' },
			take: limit - 1, // 减1是为了给目标消息留位置
			include: {
				sender: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
				receiver: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})

		// 检查是否有更多消息
		const hasMore = beforeMessages.length === limit - 1

		// 获取聊天中的总消息数
		const total = await this.prisma.message.count({
			where: { chatId: chatId },
		})

		// 按时间正序排列消息，并包含目标消息
		const messages = [...beforeMessages.reverse(), targetMessage]

		return {
			messages,
			hasMore,
			total,
			chatId: chatId,
		}
	}

	/**
	 * 将聊天中的消息标记为已读
	 * @param chatId 聊天ID
	 * @param userId 用户ID
	 */
	async markMessagesAsRead(chatId: number, userId: number) {
		this.logger.debug(`Marking messages as read in chat ${chatId} for user ${userId}`, 'MessagesService')

		try {
			// 查找该聊天中发送给该用户且未读的消息
			const unreadMessages = await this.prisma.message.findMany({
				where: {
					chatId: chatId,
					receiverId: userId,
					status: { not: 'READ' },
				},
				select: {
					id: true,
					senderId: true,
				},
			})

			if (unreadMessages.length === 0) {
				this.logger.debug(`No unread messages found in chat ${chatId} for user ${userId}`, 'MessagesService')
				return { success: true, count: 0 }
			}

			// 获取消息ID列表
			const messageIds = unreadMessages.map(msg => msg.id)

			// 批量更新消息状态
			await this.prisma.message.updateMany({
				where: {
					id: { in: messageIds },
				},
				data: {
					status: 'READ',
				},
			})

			this.logger.debug(`Marked ${messageIds.length} messages as read in chat ${chatId}`, 'MessagesService')

			// 按发送者分组消息ID，以便发送通知
			const senderMessageMap = new Map<number, number[]>()
			unreadMessages.forEach(msg => {
				if (!senderMessageMap.has(msg.senderId)) {
					senderMessageMap.set(msg.senderId, [])
				}
				senderMessageMap.get(msg.senderId).push(msg.id)
			})

			// 为每个发送者发送消息状态更新事件
			for (const [senderId, msgIds] of senderMessageMap.entries()) {
				this.eventsService.emitMessagesBatchStatus({
					senderId,
					messageIds: msgIds,
					status: 'READ',
				})
			}

			return {
				success: true,
				count: messageIds.length,
			}
		} catch (error) {
			this.logger.error(`Error marking messages as read: ${error.message}`, error.stack, 'MessagesService')
			throw error
		}
	}

	/**
	 * 检查用户是否有权限发送消息到指定聊天
	 * @param userId 用户ID
	 * @param chatId 聊天ID
	 * @returns 是否有权限
	 */
	async canUserSendToChat(userId: number, chatId: number): Promise<boolean> {
		try {
			// 检查用户是否是聊天的参与者
			const participant = await this.prisma.chatParticipant.findFirst({
				where: {
					chatId: chatId,
					userId: userId,
				},
			})

			return !!participant
		} catch (error) {
			this.logger.error(`Error checking user permission: ${error.message}`, error.stack, 'MessagesService')
			return false
		}
	}
}
