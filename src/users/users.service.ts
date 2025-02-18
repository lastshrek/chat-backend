import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { CreateUserDto, LoginDto } from './dto/user.dto'
import { JwtService } from '@nestjs/jwt'
import * as crypto from 'crypto'
import { LoggerService } from '../common/services/logger.service'
import { CreateFriendRequestDto, UpdateFriendRequestDto } from './dto/friend.dto'
import { EventsService } from '../events/events.service'
import { MessagesGateway } from '../messages/messages.gateway'
import { MessagesService } from '../messages/messages.service'
import { MessageType, MessageStatus } from '@prisma/client'

@Injectable()
export class UsersService {
	constructor(
		private prisma: PrismaService,
		private jwtService: JwtService,
		private logger: LoggerService,
		private redis: RedisService,
		private eventsService: EventsService,
		private messagesGateway: MessagesGateway,
		private messagesService: MessagesService
	) {}

	// AES 解密
	private decrypt(encryptedText: string): string {
		try {
			const key = process.env.CRYPTO_KEY || 'your-secret-key'
			this.logger.debug(`Using crypto key: ${key}`, 'UsersService')
			this.logger.debug(`Encrypted text: ${encryptedText}`, 'UsersService')

			// 生成 32 字节的密钥
			const hash = crypto.createHash('sha256')
			hash.update(key)
			const keyBuffer = hash.digest()

			// 使用固定的 IV
			const iv = Buffer.alloc(16, 0)

			// 创建解密器
			const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv)
			decipher.setAutoPadding(true)

			// 解密
			let decrypted = decipher.update(encryptedText, 'base64', 'utf8')
			decrypted += decipher.final('utf8')

			this.logger.debug(`Decrypted text: ${decrypted}`, 'UsersService')
			return decrypted
		} catch (error) {
			this.logger.error(`Decryption error: ${error.message}`, error.stack, 'UsersService')
			throw error
		}
	}

	async create(createUserDto: CreateUserDto) {
		const { username, password } = createUserDto
		this.logger.debug(`Creating user with username: ${username}`, 'UsersService')

		// 检查用户名是否已存在
		const existingUser = await this.prisma.user.findUnique({
			where: { username },
		})

		if (existingUser) {
			throw new ConflictException('Username already exists')
		}

		// 解密密码
		const decryptedPassword = this.decrypt(password)
		console.log(decryptedPassword)
		// 创建用户
		const user = await this.prisma.user.create({
			data: {
				username,
				password: decryptedPassword,
				avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`, // 生成默认头像
			},
			select: {
				id: true,
				username: true,
				avatar: true,
				createdAt: true,
			},
		})

		// 生成 JWT token
		const token = this.jwtService.sign({
			sub: user.id,
			username: user.username,
		})

		// 存储 token 到 Redis
		await this.redis.setToken(user.id, token)

		return {
			user,
			token,
		}
	}

	async login(loginDto: LoginDto) {
		const { username, password } = loginDto

		// 查找用户
		const user = await this.prisma.user.findUnique({
			where: { username },
		})

		if (!user) {
			throw new UnauthorizedException('Invalid credentials')
		}

		// 解密并验证密码
		const decryptedPassword = this.decrypt(password)
		if (decryptedPassword !== user.password) {
			throw new UnauthorizedException('Invalid credentials')
		}

		// 生成新 token
		const token = this.jwtService.sign({
			sub: user.id,
			username: user.username,
		})

		// 更新 Redis 中的 token
		await this.redis.setToken(user.id, token)

		// 获取待处理的好友请求
		const pendingRequests = await this.getPendingFriendRequests(user.id)

		const { password: _, ...userWithoutPassword } = user
		return {
			user: userWithoutPassword,
			token,
			pendingRequests,
		}
	}

	async logout(userId: number) {
		// 从 Redis 中移除 token
		await this.redis.removeToken(userId)
		return { message: 'Logged out successfully' }
	}

	// 发送好友请求
	async sendFriendRequest(fromId: number, createFriendRequestDto: CreateFriendRequestDto) {
		const { toId, message } = createFriendRequestDto

		this.logger.debug(`User ${fromId} sending friend request to ${toId}`, 'UsersService')

		// 检查是否已经是好友
		const existingFriend = await this.prisma.friend.findFirst({
			where: {
				OR: [
					{ userId: fromId, friendId: toId },
					{ userId: toId, friendId: fromId },
				],
			},
		})

		if (existingFriend) {
			throw new ConflictException('Already friends')
		}

		// 检查是否已经有待处理的请求
		const existingRequest = await this.prisma.friendRequest.findUnique({
			where: {
				fromId_toId: {
					fromId,
					toId,
				},
			},
		})

		if (existingRequest) {
			throw new ConflictException('Friend request already exists')
		}

		// 创建好友请求
		const request = await this.prisma.friendRequest.create({
			data: {
				fromId,
				toId,
				message,
			},
			include: {
				from: true,
				to: true,
			},
		})

		this.logger.debug(`Friend request created: ${JSON.stringify(request)}`, 'UsersService')

		// 通过 WebSocket 通知接收者
		try {
			await this.messagesGateway.sendFriendRequest(toId, {
				request,
				sender: {
					id: fromId,
					username: request.from.username,
					avatar: request.from.avatar,
				},
			})
			this.logger.debug('Friend request notification sent successfully', 'UsersService')
		} catch (error) {
			this.logger.error(`Error sending friend request notification: ${error.message}`, error.stack, 'UsersService')
		}

		return request
	}

	// 处理好友请求
	async handleFriendRequest(userId: number, requestId: number, updateDto: UpdateFriendRequestDto) {
		const request = await this.prisma.friendRequest.findUnique({
			where: { id: requestId },
			include: {
				from: true,
				to: true,
			},
		})

		if (!request) {
			throw new NotFoundException('Friend request not found')
		}

		if (request.toId !== userId) {
			throw new UnauthorizedException('Not authorized to handle this request')
		}

		const updatedRequest = await this.prisma.friendRequest.update({
			where: { id: requestId },
			data: { status: updateDto.status },
			include: {
				from: true,
				to: true,
			},
		})

		if (updateDto.status === 'ACCEPTED') {
			// 创建好友关系
			await this.prisma.$transaction([
				this.prisma.friend.create({
					data: {
						userId: request.fromId,
						friendId: request.toId,
					},
				}),
				this.prisma.friend.create({
					data: {
						userId: request.toId,
						friendId: request.fromId,
					},
				}),
			])

			// 创建聊天
			const chat = await this.messagesService.createChat([request.fromId, request.toId])

			// 发送系统消息
			await this.messagesService.create({
				chatId: chat.id,
				senderId: request.toId, // 接受者发送消息
				receiverId: request.fromId,
				type: MessageType.TEXT,
				content: '我已经通过了你的好友请求，开始聊天吧！',
				status: MessageStatus.SENT,
			})

			// 通过 WebSocket 通知发送者
			await this.messagesGateway.sendFriendRequestAccepted(request.fromId, {
				request: updatedRequest,
				accepter: {
					id: userId,
					username: request.to.username,
					avatar: request.to.avatar,
				},
				chat, // 添加聊天信息
			})
		} else if (updateDto.status === 'REJECTED') {
			await this.messagesGateway.sendFriendRequestRejected(request.fromId, {
				request: updatedRequest,
				rejecter: {
					id: userId,
					username: request.to.username,
					avatar: request.to.avatar,
				},
			})
		}

		return updatedRequest
	}

	// 获取好友列表
	async getFriends(userId: number) {
		return this.prisma.friend.findMany({
			where: { userId },
			include: {
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

	// 获取好友请求列表
	async getFriendRequests(status?: string) {
		return this.prisma.friendRequest.findMany({
			where: {
				...(status && { status: status as any }),
			},
			include: {
				from: {
					select: {
						id: true,
						username: true,
						name: true,
						avatar: true,
					},
				},
				to: {
					select: {
						id: true,
						username: true,
						name: true,
						avatar: true,
					},
				},
			},
			orderBy: {
				createdAt: 'desc',
			},
		})
	}

	// 搜索用户
	async searchUsers(keyword: string) {
		return this.prisma.user.findMany({
			where: {
				username: {
					contains: keyword,
				},
			},
			select: {
				id: true,
				username: true,
				name: true,
				avatar: true,
				createdAt: true,
			},
		})
	}

	// 获取用户的待处理好友请求
	async getPendingFriendRequests(userId: number) {
		return this.prisma.friendRequest.findMany({
			where: {
				toId: userId,
				status: 'PENDING',
			},
			include: {
				from: {
					select: {
						id: true,
						username: true,
						name: true,
						avatar: true,
					},
				},
			},
			orderBy: {
				createdAt: 'desc',
			},
		})
	}
}
