import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	Query,
	UploadedFile,
	UseInterceptors,
	UseGuards,
	Request,
} from '@nestjs/common'
import { MessagesService } from './messages.service'
import { CreateMessageDto, UpdateMessageDto, UpdateMessageStatusDto } from './dto/messages.dto'
import { MessageStatus, MessageType } from '@prisma/client'
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'
import { Response } from '../common/interfaces/response.interface'
import { FileInterceptor } from '@nestjs/platform-express'
import { MinioService } from '../common/services/minio.service'
import { Express } from 'express'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'

@ApiTags('messages')
@Controller('messages')
export class MessagesController {
	constructor(private readonly messagesService: MessagesService, private readonly minioService: MinioService) {}

	@Post()
	@ApiOperation({ summary: '创建新消息' })
	@ApiResponse({
		status: 201,
		description: '消息创建成功',
		schema: {
			allOf: [
				{
					properties: {
						code: { type: 'number', example: 201 },
						message: { type: 'string', example: 'success' },
						data: { $ref: '#/components/schemas/Message' },
					},
				},
			],
		},
	})
	create(@Body() createMessageDto: CreateMessageDto) {
		return this.messagesService.create(createMessageDto)
	}

	@Get('chat/:chatId')
	@ApiOperation({ summary: '获取聊天室消息' })
	@ApiParam({ name: 'chatId', description: '聊天室ID' })
	@ApiQuery({ name: 'type', enum: MessageType, required: false })
	@ApiResponse({
		status: 200,
		description: '成功获取消息列表',
		schema: {
			allOf: [
				{
					properties: {
						code: { type: 'number', example: 200 },
						message: { type: 'string', example: 'success' },
						data: {
							type: 'array',
							items: { $ref: '#/components/schemas/Message' },
						},
					},
				},
			],
		},
	})
	findAll(@Param('chatId') chatId: string, @Query('type') type?: MessageType) {
		return this.messagesService.findAll(+chatId, type)
	}

	@Get('unread')
	@ApiOperation({ summary: '获取未读消息' })
	@ApiQuery({ name: 'userId', description: '用户ID' })
	@ApiResponse({ status: 200, description: '成功获取未读消息' })
	getUnreadMessages(@Query('userId') userId: string) {
		return this.messagesService.getUnreadMessages(+userId)
	}

	@Patch(':id')
	@ApiOperation({ summary: '更新消息' })
	@ApiParam({ name: 'id', description: '消息ID' })
	@ApiResponse({ status: 200, description: '消息更新成功' })
	update(@Param('id') id: string, @Body() updateMessageDto: UpdateMessageDto) {
		return this.messagesService.update(+id, updateMessageDto)
	}

	@Patch(':id/status')
	@ApiOperation({ summary: '更新消息状态' })
	@ApiParam({ name: 'id', description: '消息ID' })
	@ApiResponse({ status: 200, description: '消息状态更新成功' })
	updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateMessageStatusDto) {
		return this.messagesService.updateStatus(+id, updateStatusDto)
	}

	@Patch('batch/status')
	@ApiOperation({ summary: '批量更新消息状态' })
	@ApiResponse({ status: 200, description: '消息状态批量更新成功' })
	updateManyStatus(@Body() data: { ids: number[]; status: MessageStatus }) {
		return this.messagesService.updateManyStatus(data.ids, data.status)
	}

	@Delete(':id')
	@ApiOperation({ summary: '删除消息' })
	@ApiParam({ name: 'id', description: '消息ID' })
	@ApiResponse({ status: 200, description: '消息删除成功' })
	remove(@Param('id') id: string) {
		return this.messagesService.remove(+id)
	}

	@Get('chats')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '获取用户的聊天列表' })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'limit', required: false, type: Number })
	@ApiResponse({ status: 200, description: '成功获取聊天列表' })
	async getUserChats(@Request() req, @Query('page') page = '1', @Query('limit') limit = '20') {
		return this.messagesService.getUserChats(req.user.sub, +page, +limit)
	}

	@Post('chats')
	@ApiOperation({ summary: '创建新的聊天' })
	@ApiResponse({ status: 201, description: '聊天创建成功' })
	async createChat(@Body() data: { userIds: number[] }) {
		return this.messagesService.createChat(data.userIds)
	}

	@Post('upload')
	@UseInterceptors(FileInterceptor('file'))
	async uploadFile(@UploadedFile() file: Express.Multer.File, @Body('type') type: 'voice' | 'image' | 'video') {
		const result = await this.minioService.uploadFile(file.buffer, type, {
			'original-name': file.originalname,
			'content-type': file.mimetype,
			'file-size': file.size.toString(),
		})

		return result
	}

	@Get('chats/:id')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '获取聊天详情' })
	@ApiParam({ name: 'id', description: '聊天ID' })
	@ApiResponse({
		status: 200,
		description: '获取成功',
		schema: {
			properties: {
				code: { type: 'number', example: 200 },
				data: {
					type: 'object',
					properties: {
						id: { type: 'number' },
						name: { type: 'string' },
						type: { type: 'string', enum: ['DIRECT', 'GROUP'] },
						participants: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									id: { type: 'number' },
									username: { type: 'string' },
									avatar: { type: 'string' },
								},
							},
						},
						createdAt: { type: 'string', format: 'date-time' },
						updatedAt: { type: 'string', format: 'date-time' },
					},
				},
				message: { type: 'string', example: 'success' },
			},
		},
	})
	async getChatById(@Param('id') id: string) {
		return this.messagesService.getChatById(+id)
	}

	@Get('chat/:chatId/messages')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '获取聊天消息历史' })
	@ApiParam({ name: 'chatId', description: '聊天ID' })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'limit', required: false, type: Number })
	@ApiResponse({ status: 200, description: '成功获取消息历史' })
	async getChatMessages(@Param('chatId') chatId: string, @Query('page') page = '1', @Query('limit') limit = '20') {
		return this.messagesService.getChatMessages(+chatId, +page, +limit)
	}

	@Get('direct-chat/:userId')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '获取或创建与指定用户的单聊' })
	@ApiParam({ name: 'userId', description: '目标用户ID' })
	@ApiResponse({
		status: 200,
		description: '成功获取或创建单聊',
		schema: {
			properties: {
				code: { type: 'number', example: 200 },
				data: {
					type: 'object',
					properties: {
						id: { type: 'number' },
						name: { type: 'string' },
						type: { type: 'string', enum: ['DIRECT'] },
						participants: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									id: { type: 'number' },
									username: { type: 'string' },
									avatar: { type: 'string' },
								},
							},
						},
						createdAt: { type: 'string', format: 'date-time' },
						updatedAt: { type: 'string', format: 'date-time' },
						isNew: { type: 'boolean', description: '是否新创建的聊天' },
					},
				},
				message: { type: 'string', example: 'success' },
			},
		},
	})
	async getOrCreateDirectChat(@Request() req, @Param('userId') targetUserId: string) {
		return this.messagesService.getOrCreateDirectChat(req.user.sub, +targetUserId)
	}

	@Get('around/:messageId')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '获取指定消息前后的消息' })
	@ApiParam({ name: 'messageId', description: '消息ID' })
	@ApiQuery({ name: 'limit', required: false, description: '返回消息数量', type: Number })
	@ApiResponse({
		status: 200,
		description: '成功获取消息',
		schema: {
			properties: {
				code: { type: 'number', example: 200 },
				data: {
					type: 'object',
					properties: {
						messages: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									id: { type: 'number' },
									content: { type: 'string' },
									type: { type: 'string' },
									status: { type: 'string' },
									createdAt: { type: 'string', format: 'date-time' },
									sender: {
										type: 'object',
										properties: {
											id: { type: 'number' },
											username: { type: 'string' },
											avatar: { type: 'string' },
										},
									},
								},
							},
						},
						hasMoreBefore: { type: 'boolean' },
						hasMoreAfter: { type: 'boolean' },
						total: { type: 'number' },
					},
				},
				message: { type: 'string', example: 'success' },
			},
		},
	})
	async getMessagesAroundId(@Param('messageId') messageId: string, @Query('limit') limit = '20') {
		return this.messagesService.getMessagesAroundId(+messageId, +limit)
	}

	@Get('before/:messageId')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '获取指定消息之前的消息' })
	@ApiParam({ name: 'messageId', description: '消息ID' })
	@ApiQuery({ name: 'chatId', required: true, description: '聊天室ID', type: Number })
	@ApiQuery({ name: 'limit', required: false, description: '返回消息数量', type: Number })
	@ApiResponse({
		status: 200,
		description: '成功获取消息',
		schema: {
			properties: {
				code: { type: 'number', example: 200 },
				data: {
					type: 'object',
					properties: {
						messages: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									id: { type: 'number' },
									content: { type: 'string' },
									type: { type: 'string' },
									status: { type: 'string' },
									createdAt: { type: 'string', format: 'date-time' },
									sender: {
										type: 'object',
										properties: {
											id: { type: 'number' },
											username: { type: 'string' },
											avatar: { type: 'string' },
										},
									},
								},
							},
						},
						hasMore: { type: 'boolean' },
						total: { type: 'number' },
					},
				},
				message: { type: 'string', example: 'success' },
			},
		},
	})
	async getMessagesBefore(
		@Param('messageId') messageId: string,
		@Query('chatId') chatId: string,
		@Query('limit') limit = '20'
	) {
		return this.messagesService.getMessagesBefore(+messageId, +chatId, +limit)
	}
}
