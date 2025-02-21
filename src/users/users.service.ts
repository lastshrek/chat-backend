import {
	Injectable,
	UnauthorizedException,
	ConflictException,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common'
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
import * as bcrypt from 'bcrypt'

@Injectable()
export class UsersService {
	private readonly SALT_ROUNDS = 10

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

		// 解密前端加密的密码
		const decryptedPassword = this.decrypt(password)

		// 使用 bcrypt 加密密码
		const hashedPassword = await bcrypt.hash(decryptedPassword, this.SALT_ROUNDS)

		// 创建用户
		const user = await this.prisma.user.create({
			data: {
				username,
				password: hashedPassword, // 存储哈希后的密码
				avatar: `https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=${username}`, // 生成默认头像
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

		// 解密前端加密的密码
		const decryptedPassword = this.decrypt(password)

		// 验证密码
		const isPasswordValid = await bcrypt.compare(decryptedPassword, user.password)

		if (!isPasswordValid) {
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
		this.logger.debug(`Handling friend request: ${requestId} by user: ${userId}`, 'UsersService')

		// 查找好友请求
		const request = await this.prisma.friendRequest.findUnique({
			where: { id: requestId },
			include: {
				from: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
				to: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})

		this.logger.debug(`Found request: ${JSON.stringify(request)}`, 'UsersService')

		if (!request) {
			this.logger.error(`Friend request not found: ${requestId}`, null, 'UsersService')
			throw new NotFoundException('Friend request not found')
		}

		if (request.toId !== userId) {
			this.logger.error(
				`Unauthorized request handling: User ${userId} trying to handle request ${requestId} which belongs to user ${request.toId}`,
				null,
				'UsersService'
			)
			throw new UnauthorizedException('You can only handle friend requests sent to you')
		}

		// 检查请求状态
		if (request.status !== 'PENDING') {
			throw new BadRequestException('This request has already been processed')
		}

		try {
			const updatedRequest = await this.prisma.friendRequest.update({
				where: { id: requestId },
				data: { status: updateDto.status },
				include: {
					from: {
						select: {
							id: true,
							username: true,
							avatar: true,
						},
					},
					to: {
						select: {
							id: true,
							username: true,
							avatar: true,
						},
					},
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

				// 创建聊天室
				const chat = await this.messagesService.createChat([request.fromId, request.toId])
				this.logger.debug(`Created chat: ${JSON.stringify(chat)}`, 'UsersService')

				// 发送系统消息
				const welcomeMessage = await this.messagesService.create({
					chatId: chat.id,
					senderId: request.toId,
					receiverId: request.fromId,
					type: MessageType.TEXT,
					content: '我已经通过了你的好友请求，开始聊天吧！',
					status: MessageStatus.SENT,
				})

				const responseData = {
					request: updatedRequest,
					chat: {
						...chat,
						lastMessage: welcomeMessage,
					},
					friend: {
						id: request.fromId,
						username: request.from.username,
						avatar: request.from.avatar,
					},
				}

				// 通过 WebSocket 通知双方
				await this.messagesGateway.sendFriendRequestAccepted({
					fromUserId: request.fromId,
					toUserId: userId,
					request: updatedRequest,
					chat: {
						...chat,
						lastMessage: welcomeMessage,
					},
				})

				return responseData
			} else if (updateDto.status === 'REJECTED') {
				await this.messagesGateway.sendFriendRequestRejected(request.fromId, {
					request: updatedRequest,
					rejecter: {
						id: userId,
						username: request.to.username,
						avatar: request.to.avatar,
					},
				})
				return updatedRequest
			}

			return updatedRequest
		} catch (error) {
			this.logger.error(`Error handling friend request: ${error.message}`, error.stack, 'UsersService')
			throw error
		}
	}

	// 获取好友列表
	async getFriends(userId: number) {
		return this.prisma.friend
			.findMany({
				where: { userId },
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
			.then(async friends => {
				// 为每个好友关系查找或创建聊天
				const friendsWithChat = await Promise.all(
					friends.map(async friend => {
						// 查找现有的直接聊天
						const chat = await this.prisma.chat.findFirst({
							where: {
								type: 'DIRECT',
								AND: [
									{
										participants: {
											some: { userId },
										},
									},
									{
										participants: {
											some: { userId: friend.friendId },
										},
									},
								],
							},
							select: {
								id: true,
								type: true,
							},
						})

						return {
							friendId: friend.friendId,
							friend: {
								...friend.friend,
								chatId: chat?.id, // 把 chatId 放到 friend 对象里
								chatType: chat?.type,
							},
						}
					})
				)

				return friendsWithChat
			})
	}

	// 获取好友请求列表
	async getFriendRequests(userId: number, status?: string) {
		this.logger.debug(`Getting friend requests for user: ${userId} with status: ${status}`, 'UsersService')
		return this.prisma.friendRequest.findMany({
			where: {
				toId: userId,
				...(status && { status: status as any }),
			},
			include: {
				from: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
				to: {
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
						avatar: true,
					},
				},
			},
			orderBy: {
				createdAt: 'desc',
			},
		})
	}

	async findById(id: number, excludeSensitive = false) {
		const user = await this.prisma.user.findUnique({
			where: { id },
			select: {
				id: true,
				username: true,
				avatar: true,
				createdAt: true,
				updatedAt: !excludeSensitive,
				// 如果不是排除敏感信息，则返回更多字段
				...(!excludeSensitive &&
					{
						// 可以添加其他敏感字段
					}),
			},
		})

		if (!user) {
			throw new NotFoundException('User not found')
		}

		return user
	}
}
