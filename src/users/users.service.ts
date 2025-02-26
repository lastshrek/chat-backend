import {
	Injectable,
	UnauthorizedException,
	ConflictException,
	NotFoundException,
	BadRequestException,
	HttpException,
	HttpStatus,
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
import { MessageType, MessageStatus, ChatType } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import * as path from 'path'
import * as fs from 'fs'
import { JsonUser } from './dto/json-user.dto'

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
								type: ChatType.PRIVATE,
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
						console.log(chat)
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

	private generateChineseName(): string {
		const familyNames = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'
		const givenNames = [
			'明国华建文军平志伟东海强晓生光林',
			'天民永志建国泽世轩玉宇鸿博',
			'子涵浩然瀚海星辰宇航天骄',
			'雨泽子默子轩浩宇鸿涛博涛',
			'昊天思远安邦振国远图',
			'鹏云志强伟泽晓峰子轩',
			'浩然泽宇瀚海鸿志博超',
			'思淼安然泽民昊焱志泽',
			'晓博鸿文志强泽华子默',
			'浩宇瀚辰远航天工博超',
		].join('')

		const familyName = familyNames[Math.floor(Math.random() * familyNames.length)]
		const givenName1 = givenNames[Math.floor(Math.random() * givenNames.length)]
		const givenName2 = givenNames[Math.floor(Math.random() * givenNames.length)]

		return `${familyName}${givenName1}${givenName2}`
	}

	async importUsers() {
		try {
			// 读取 user.json
			const filePath = path.join(process.cwd(), 'user.json')
			this.logger.debug('Reading user.json file...')
			const data = await fs.promises.readFile(filePath, 'utf8')
			const userData = JSON.parse(data)
			this.logger.debug(`Found ${userData.length} users in file`)

			// 清空现有用户
			this.logger.debug('Clearing existing users...')
			await this.prisma.user.deleteMany()
			this.logger.debug('Existing users cleared')

			const hashedPassword = await bcrypt.hash('Hby@1952', 10)
			const usedUsernames = new Set<string>()
			let userId = 1

			// 准备所有用户数据
			this.logger.debug('Preparing user data...')
			const allUsers = userData.map(user => {
				let username = this.generateChineseName()
				while (usedUsernames.has(username)) {
					username = this.generateChineseName()
				}
				console.log(username)
				usedUsernames.add(username)

				return {
					id: userId++,
					username,
					password: hashedPassword,
					employeeId: user.id,
					orgId: user.deptId,
					dutyName: user.dutyName || '-',
				}
			})
			this.logger.debug(`Prepared ${allUsers.length} users for import`)

			// 一次性创建所有用户
			this.logger.debug('Starting bulk user creation...')
			const startTime = Date.now()
			const result = await this.prisma.user.createMany({
				data: allUsers,
				skipDuplicates: true,
			})
			const endTime = Date.now()
			const timeSpent = (endTime - startTime) / 1000

			this.logger.debug(`User import completed in ${timeSpent} seconds`)
			this.logger.debug(`Successfully imported ${result.count} users`)

			return {
				message: 'Users import completed',
				totalProcessed: userData.length,
				successfullyImported: result.count,
				timeSpentSeconds: timeSpent,
			}
		} catch (error) {
			this.logger.error(`Failed to import users: ${error.message}`, error.stack)
			throw new Error(`Failed to import users: ${error.message}`)
		}
	}

	async updateUserAvatars() {
		try {
			// 获取所有没有头像的用户
			const users = await this.prisma.user.findMany({
				where: {
					OR: [{ avatar: null }, { avatar: '' }],
				},
				select: {
					id: true,
					username: true,
				},
			})

			this.logger.debug(`Found ${users.length} users without avatars`, 'UsersService')

			// 批量更新用户头像
			for (const user of users) {
				// 使用 DiceBear API 生成头像
				const avatar = `https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=${user.username}`

				await this.prisma.user.update({
					where: { id: user.id },
					data: { avatar },
				})

				this.logger.debug(`Updated avatar for user ${user.id} (${user.username})`, 'UsersService')
			}

			return {
				success: true,
				updatedCount: users.length,
				message: `Successfully updated avatars for ${users.length} users`,
			}
		} catch (error) {
			this.logger.error(`Failed to update user avatars: ${error.message}`, error.stack, 'UsersService')
			throw new Error(`Failed to update user avatars: ${error.message}`)
		}
	}

	async getFriendChats(userId: number) {
		const chats = await this.prisma.chat.findMany({
			where: {
				type: ChatType.PRIVATE,
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
				},
			},
		})

		return chats.map(chat => ({
			id: chat.id,
			otherUser: chat.participants.find(p => p.userId !== userId)?.user,
			lastMessage: chat.messages[0] || null,
		}))
	}

	async checkExistingChat(currentUserId: number, targetUserId: number) {
		return this.prisma.chat.findFirst({
			where: {
				type: ChatType.PRIVATE,
				AND: [
					{
						participants: {
							some: {
								userId: currentUserId,
							},
						},
					},
					{
						participants: {
							some: {
								userId: targetUserId,
							},
						},
					},
				],
			},
		})
	}
}
