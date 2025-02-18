import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateMessageDto, UpdateMessageDto, UpdateMessageStatusDto, MessageMetadata } from './dto/messages.dto'
import { MessageStatus, MessageType, Prisma } from '@prisma/client'
import { MessagesEventsService } from './messages-events.service'
import { RedisService } from '../redis/redis.service'

@Injectable()
export class MessagesService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly redis: RedisService,
		private readonly eventsService: MessagesEventsService
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

	async create(createMessageDto: CreateMessageDto) {
		const { content, type, metadata, senderId, receiverId, chatId, status } = createMessageDto

		// 验证消息元数据
		this.validateMessageMetadata(type, metadata)

		const jsonMetadata: Prisma.JsonValue = metadata ? JSON.parse(JSON.stringify(metadata)) : {}

		return this.prisma.message.create({
			data: {
				content,
				type,
				metadata: jsonMetadata,
				senderId,
				receiverId,
				chatId,
				status: status || MessageStatus.SENT,
			},
			include: {
				sender: true,
				receiver: true,
				chat: true,
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
				messageIds,
				status,
				senderId,
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

	async getUserChats(userId: number) {
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
								name: true,
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
				},
			},
		})

		return chats.map(chat => ({
			...chat,
			// 对于直接聊天，找出另一个用户
			otherUser: chat.type === 'DIRECT' ? chat.participants.find(p => p.userId !== userId)?.user : null,
			lastMessage: chat.messages[0],
		}))
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
						name: true,
						avatar: true,
					},
				},
			},
		})
	}
}
