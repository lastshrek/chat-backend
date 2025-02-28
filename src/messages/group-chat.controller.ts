import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, ParseIntPipe, Request } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { GroupChatService } from './group-chat.service'
import { CreateGroupChatDto, UpdateGroupChatDto, AddGroupMembersDto, UpdateMemberRoleDto } from './dto/group-chat.dto'
import { MessagesGateway } from './messages.gateway'

@ApiTags('groupchat')
@Controller('group-chats')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GroupChatController {
	constructor(private readonly groupChatService: GroupChatService, private readonly messagesGateway: MessagesGateway) {}

	@Post()
	@ApiOperation({ summary: '创建群聊' })
	@ApiResponse({ status: 201, description: '群聊创建成功' })
	async createGroupChat(@Request() req, @Body() dto: CreateGroupChatDto) {
		const userId = req.user.sub
		const chat = await this.groupChatService.createGroupChat(userId, dto)

		// 通知所有新成员
		for (const participant of chat.participants) {
			if (participant.userId !== userId) {
				await this.messagesGateway.sendGroupChatInvitation(participant.userId, {
					chat,
					inviter: {
						id: userId,
						username: req.user.username,
					},
				})
			}
		}

		return chat
	}

	@Get()
	@ApiOperation({ summary: '获取用户的所有群聊' })
	@ApiResponse({ status: 200, description: '成功获取群聊列表' })
	async getUserGroupChats(@Request() req) {
		const userId = req.user.sub
		return this.groupChatService.getUserGroupChats(userId)
	}

	@Get(':id')
	@ApiOperation({ summary: '获取群聊详情' })
	@ApiResponse({ status: 200, description: '成功获取群聊详情' })
	async getGroupChat(@Request() req, @Param('id', ParseIntPipe) chatId: number) {
		const userId = req.user.sub
		const chat = await this.groupChatService.getGroupChat(chatId, userId)

		// 如果需要，你可以在这里转换数据格式
		return {
			...chat,
			participants: chat.participants.map(p => ({
				userId: p.userId,
				role: p.role,
				joinedAt: p.joinedAt,
				user: p.user,
			})),
		}
	}

	@Put(':id')
	@ApiOperation({ summary: '更新群聊信息' })
	@ApiResponse({ status: 200, description: '群聊信息更新成功' })
	async updateGroupChat(@Request() req, @Param('id', ParseIntPipe) chatId: number, @Body() dto: UpdateGroupChatDto) {
		const userId = req.user.sub
		const chat = await this.groupChatService.updateGroupChat(chatId, userId, dto)

		// 通知所有群成员群聊信息已更新
		await this.messagesGateway.sendGroupChatUpdated(chatId, {
			chat,
			updater: {
				id: userId,
				username: req.user.username,
			},
		})

		return chat
	}

	@Post(':id/members')
	@ApiOperation({ summary: '添加群成员' })
	@ApiResponse({ status: 200, description: '成功添加群成员' })
	async addGroupMembers(@Request() req, @Param('id', ParseIntPipe) chatId: number, @Body() dto: AddGroupMembersDto) {
		const userId = req.user.sub
		const result = await this.groupChatService.addGroupMembers(chatId, userId, dto)

		// 通知所有群成员有新成员加入
		await this.messagesGateway.sendGroupMembersAdded(chatId, {
			chat: result.chat,
			newMembers: result.newMembers,
			inviter: {
				id: userId,
				username: req.user.username,
			},
		})

		// 通知新成员被邀请加入群聊
		for (const member of result.newMembers) {
			await this.messagesGateway.sendGroupChatInvitation(member.userId, {
				chat: result.chat,
				inviter: {
					id: userId,
					username: req.user.username,
				},
			})
		}

		return result
	}

	@Delete(':id/members/:memberId')
	@ApiOperation({ summary: '移除群成员或退出群聊' })
	@ApiResponse({ status: 200, description: '成功移除群成员或退出群聊' })
	async removeGroupMember(
		@Request() req,
		@Param('id', ParseIntPipe) chatId: number,
		@Param('memberId', ParseIntPipe) memberId: number
	) {
		const userId = req.user.sub
		const result = await this.groupChatService.removeGroupMember(chatId, userId, memberId)

		// 通知所有群成员有成员被移除或退出
		if (result.success && !result.message.includes('已被删除')) {
			await this.messagesGateway.sendGroupMemberRemoved(chatId, {
				chatId,
				removedMember: result.removedMember,
				remover:
					userId === memberId
						? null
						: {
								id: userId,
								username: req.user.username,
						  },
				isLeave: userId === memberId,
			})
		}

		return result
	}

	@Put(':id/members/role')
	@ApiOperation({ summary: '更新成员角色' })
	@ApiResponse({ status: 200, description: '成功更新成员角色' })
	async updateMemberRole(@Request() req, @Param('id', ParseIntPipe) chatId: number, @Body() dto: UpdateMemberRoleDto) {
		const userId = req.user.sub
		const result = await this.groupChatService.updateMemberRole(chatId, userId, dto)

		// 通知所有群成员角色变更
		await this.messagesGateway.sendGroupMemberRoleUpdated(chatId, {
			chatId,
			updatedMember: result.updatedMember,
			updater: {
				id: userId,
				username: req.user.username,
			},
		})

		return result
	}

	@Delete(':id')
	@ApiOperation({ summary: '解散群聊' })
	@ApiResponse({ status: 200, description: '成功解散群聊' })
	async dissolveGroup(@Request() req, @Param('id', ParseIntPipe) chatId: number) {
		const userId = req.user.sub

		// 获取群聊信息和成员，用于后续通知
		const chat = await this.groupChatService.getGroupChat(chatId, userId)
		const memberIds = chat.participants.map(p => p.userId)

		const result = await this.groupChatService.dissolveGroup(chatId, userId)

		// 通知所有群成员群聊已解散
		for (const memberId of memberIds) {
			if (memberId !== userId) {
				await this.messagesGateway.sendGroupChatDissolved(memberId, {
					chatId,
					chat: {
						id: chat.id,
						name: chat.name,
					},
					dissolver: {
						id: userId,
						username: req.user.username,
					},
				})
			}
		}

		return result
	}
}
