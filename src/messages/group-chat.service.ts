import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LoggerService } from '../common/services/logger.service'
import { CreateGroupChatDto, UpdateGroupChatDto, AddGroupMembersDto, UpdateMemberRoleDto } from './dto/group-chat.dto'

@Injectable()
export class GroupChatService {
	constructor(private readonly prisma: PrismaService, private readonly logger: LoggerService) {}

	/**
	 * 创建群聊
	 */
	async createGroupChat(userId: number, dto: CreateGroupChatDto) {
		try {
			// 确保创建者在成员列表中
			if (!dto.memberIds.includes(userId)) {
				dto.memberIds.push(userId)
			}

			// 验证所有成员是否存在
			const users = await this.prisma.user.findMany({
				where: { id: { in: dto.memberIds } },
				select: { id: true },
			})

			if (users.length !== dto.memberIds.length) {
				throw new BadRequestException('一个或多个用户不存在')
			}

			// 创建群聊
			const chat = await this.prisma.chat.create({
				data: {
					name: dto.name,
					description: dto.description,
					avatar: dto.avatar,
					type: 'GROUP',
					creatorId: userId,
					participants: {
						create: dto.memberIds.map(memberId => ({
							userId: memberId,
							role: memberId === userId ? 'OWNER' : 'MEMBER',
						})),
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
					creator: {
						select: {
							id: true,
							username: true,
							avatar: true,
						},
					},
				},
			})

			this.logger.debug(`Group chat created: ${chat.id}`, 'GroupChatService')
			return chat
		} catch (error) {
			this.logger.error(`Error creating group chat: ${error.message}`, error.stack, 'GroupChatService')
			throw error
		}
	}

	/**
	 * 获取群聊详情
	 */
	async getGroupChat(chatId: number, userId: number) {
		try {
			// 检查群聊是否存在
			const chat = await this.prisma.chat.findFirst({
				where: {
					id: chatId,
					type: 'GROUP',
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
					creator: {
						select: {
							id: true,
							username: true,
							avatar: true,
						},
					},
				},
			})

			if (!chat) {
				throw new NotFoundException('群聊不存在或您不是群成员')
			}

			return chat
		} catch (error) {
			this.logger.error(`Error getting group chat: ${error.message}`, error.stack, 'GroupChatService')
			throw error
		}
	}

	/**
	 * 获取用户的所有群聊
	 */
	async getUserGroupChats(userId: number) {
		try {
			const chats = await this.prisma.chat.findMany({
				where: {
					type: 'GROUP',
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
					creator: {
						select: {
							id: true,
							username: true,
							avatar: true,
						},
					},
					_count: {
						select: {
							participants: true,
						},
					},
				},
			})

			return chats
		} catch (error) {
			this.logger.error(`Error getting user group chats: ${error.message}`, error.stack, 'GroupChatService')
			throw error
		}
	}

	/**
	 * 更新群聊信息
	 */
	async updateGroupChat(chatId: number, userId: number, dto: UpdateGroupChatDto) {
		try {
			// 检查用户是否是群主或管理员
			const participant = await this.prisma.chatParticipant.findFirst({
				where: {
					chatId,
					userId,
					role: { in: ['OWNER', 'ADMIN'] },
				},
			})

			if (!participant) {
				throw new ForbiddenException('只有群主或管理员可以更新群聊信息')
			}

			// 更新群聊
			const chat = await this.prisma.chat.update({
				where: { id: chatId },
				data: {
					name: dto.name,
					description: dto.description,
					avatar: dto.avatar,
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
					creator: {
						select: {
							id: true,
							username: true,
							avatar: true,
						},
					},
				},
			})

			return chat
		} catch (error) {
			this.logger.error(`Error updating group chat: ${error.message}`, error.stack, 'GroupChatService')
			throw error
		}
	}

	/**
	 * 添加群成员
	 */
	async addGroupMembers(chatId: number, userId: number, dto: AddGroupMembersDto) {
		try {
			// 检查用户是否是群主或管理员
			const participant = await this.prisma.chatParticipant.findFirst({
				where: {
					chatId,
					userId,
					role: { in: ['OWNER', 'ADMIN'] },
				},
			})

			if (!participant) {
				throw new ForbiddenException('只有群主或管理员可以添加成员')
			}

			// 检查群聊是否存在
			const chat = await this.prisma.chat.findFirst({
				where: {
					id: chatId,
					type: 'GROUP',
				},
			})

			if (!chat) {
				throw new NotFoundException('群聊不存在')
			}

			// 获取已存在的成员
			const existingMembers = await this.prisma.chatParticipant.findMany({
				where: {
					chatId,
					userId: { in: dto.memberIds },
				},
				select: { userId: true },
			})

			const existingMemberIds = existingMembers.map(m => m.userId)
			const newMemberIds = dto.memberIds.filter(id => !existingMemberIds.includes(id))

			if (newMemberIds.length === 0) {
				throw new BadRequestException('所有用户已经是群成员')
			}

			// 验证所有新成员是否存在
			const users = await this.prisma.user.findMany({
				where: { id: { in: newMemberIds } },
				select: { id: true },
			})

			if (users.length !== newMemberIds.length) {
				throw new BadRequestException('一个或多个用户不存在')
			}

			// 添加新成员
			await this.prisma.chatParticipant.createMany({
				data: newMemberIds.map(memberId => ({
					chatId,
					userId: memberId,
					role: 'MEMBER',
				})),
			})

			// 获取更新后的群聊信息
			const updatedChat = await this.prisma.chat.findUnique({
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
				},
			})

			// 获取新添加的成员信息
			const newMembers = updatedChat.participants.filter(p => newMemberIds.includes(p.userId))

			return {
				chat: updatedChat,
				newMembers,
			}
		} catch (error) {
			this.logger.error(`Error adding group members: ${error.message}`, error.stack, 'GroupChatService')
			throw error
		}
	}

	/**
	 * 移除群成员
	 */
	async removeGroupMember(chatId: number, userId: number, memberId: number) {
		try {
			// 检查群聊是否存在
			const chat = await this.prisma.chat.findFirst({
				where: {
					id: chatId,
					type: 'GROUP',
				},
				include: {
					participants: true,
				},
			})

			if (!chat) {
				throw new NotFoundException('群聊不存在')
			}

			// 检查要移除的成员是否存在
			const memberToRemove = chat.participants.find(p => p.userId === memberId)
			if (!memberToRemove) {
				throw new NotFoundException('该用户不是群成员')
			}

			// 检查权限
			const requesterParticipant = chat.participants.find(p => p.userId === userId)
			if (!requesterParticipant) {
				throw new ForbiddenException('您不是该群聊的成员')
			}

			// 自己可以退出群聊
			if (userId === memberId) {
				// 如果是群主要退出，需要转移群主身份
				if (requesterParticipant.role === 'OWNER') {
					// 找到一个管理员或最早加入的成员
					const newOwner = chat.participants
						.filter(p => p.userId !== userId)
						.sort((a, b) => {
							if (a.role === 'ADMIN' && b.role !== 'ADMIN') return -1
							if (a.role !== 'ADMIN' && b.role === 'ADMIN') return 1
							return a.joinedAt.getTime() - b.joinedAt.getTime()
						})[0]

					if (newOwner) {
						// 转移群主身份
						await this.prisma.chatParticipant.update({
							where: { id: newOwner.id },
							data: { role: 'OWNER' },
						})
					} else {
						// 如果没有其他成员，删除群聊
						await this.prisma.chat.delete({
							where: { id: chatId },
						})
						return { success: true, message: '您已退出群聊，群聊已被删除' }
					}
				}
			} else {
				// 移除他人需要权限检查
				if (requesterParticipant.role === 'MEMBER') {
					throw new ForbiddenException('只有群主或管理员可以移除成员')
				}

				// 管理员不能移除群主或其他管理员
				if (
					requesterParticipant.role === 'ADMIN' &&
					(memberToRemove.role === 'OWNER' || memberToRemove.role === 'ADMIN')
				) {
					throw new ForbiddenException('管理员不能移除群主或其他管理员')
				}
			}

			// 移除成员
			await this.prisma.chatParticipant.delete({
				where: {
					chatId_userId: {
						chatId,
						userId: memberId,
					},
				},
			})

			return {
				success: true,
				message: userId === memberId ? '您已退出群聊' : '成员已被移除',
				removedMember: {
					id: memberId,
				},
			}
		} catch (error) {
			this.logger.error(`Error removing group member: ${error.message}`, error.stack, 'GroupChatService')
			throw error
		}
	}

	/**
	 * 更新成员角色
	 */
	async updateMemberRole(chatId: number, userId: number, dto: UpdateMemberRoleDto) {
		try {
			// 检查群聊是否存在
			const chat = await this.prisma.chat.findFirst({
				where: {
					id: chatId,
					type: 'GROUP',
				},
				include: {
					participants: true,
				},
			})

			if (!chat) {
				throw new NotFoundException('群聊不存在')
			}

			// 检查要更新的成员是否存在
			const memberToUpdate = chat.participants.find(p => p.userId === dto.memberId)
			if (!memberToUpdate) {
				throw new NotFoundException('该用户不是群成员')
			}

			// 检查请求者是否是群主
			const requester = chat.participants.find(p => p.userId === userId)
			if (!requester || requester.role !== 'OWNER') {
				throw new ForbiddenException('只有群主可以更改成员角色')
			}

			// 不能更改自己的角色
			if (dto.memberId === userId) {
				throw new BadRequestException('不能更改自己的角色')
			}

			// 如果要设置为群主，需要转移群主身份
			if (dto.role === 'OWNER') {
				// 更新当前群主为管理员
				await this.prisma.chatParticipant.update({
					where: { id: requester.id },
					data: { role: 'ADMIN' },
				})
			}

			// 更新成员角色
			await this.prisma.chatParticipant.update({
				where: { id: memberToUpdate.id },
				data: { role: dto.role },
			})

			return {
				success: true,
				message: '成员角色已更新',
				updatedMember: {
					userId: dto.memberId,
					role: dto.role,
				},
			}
		} catch (error) {
			this.logger.error(`Error updating member role: ${error.message}`, error.stack, 'GroupChatService')
			throw error
		}
	}

	/**
	 * 解散群聊
	 */
	async dissolveGroup(chatId: number, userId: number) {
		try {
			// 检查群聊是否存在
			const chat = await this.prisma.chat.findFirst({
				where: {
					id: chatId,
					type: 'GROUP',
				},
			})

			if (!chat) {
				throw new NotFoundException('群聊不存在')
			}

			// 检查用户是否是群主
			const participant = await this.prisma.chatParticipant.findFirst({
				where: {
					chatId,
					userId,
					role: 'OWNER',
				},
			})

			if (!participant) {
				throw new ForbiddenException('只有群主可以解散群聊')
			}

			// 删除群聊
			await this.prisma.chat.delete({
				where: { id: chatId },
			})

			return {
				success: true,
				message: '群聊已解散',
			}
		} catch (error) {
			this.logger.error(`Error dissolving group: ${error.message}`, error.stack, 'GroupChatService')
			throw error
		}
	}
}
