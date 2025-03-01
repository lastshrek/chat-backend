import { MessageStatus, MessageType } from '@prisma/client'
import { ApiProperty, ApiPropertyOptional, getSchemaPath, ApiExtraModels } from '@nestjs/swagger'

// 基础消息元数据接口
export interface IMessageMetadata {}

// 文本消息元数据
export class TextMetadata implements IMessageMetadata {
	@ApiProperty({ description: '文本内容' })
	content: string
}

// 文件消息元数据
export class FileMetadata implements IMessageMetadata {
	@ApiProperty({ description: '文件名' })
	filename: string

	@ApiProperty({ description: '文件大小' })
	size: number

	@ApiProperty({ description: '文件类型' })
	type: string

	@ApiProperty({ description: '文件URL' })
	url: string
}

// 语音消息元数据
export class VoiceMetadata implements IMessageMetadata {
	@ApiProperty({ description: '语音时长' })
	duration: number

	@ApiProperty({ description: '语音URL' })
	url: string
}

// 链接消息元数据
export class LinkMetadata implements IMessageMetadata {
	@ApiProperty({ description: '链接标题' })
	title: string

	@ApiProperty({ description: '链接描述' })
	description: string

	@ApiProperty({ description: '链接URL' })
	url: string

	@ApiProperty({ description: '链接图片' })
	image?: string
}

// 图片消息元数据
export class ImageMetadata implements IMessageMetadata {
	@ApiProperty({ description: '图片URL' })
	url: string

	@ApiProperty({ description: '图片宽度' })
	width: number

	@ApiProperty({ description: '图片高度' })
	height: number

	@ApiProperty({ description: '缩略图URL' })
	thumbnail?: string
}

// 视频消息元数据
export class VideoMetadata implements IMessageMetadata {
	@ApiProperty({ description: '视频URL' })
	url: string

	@ApiProperty({ description: '视频时长' })
	duration: number

	@ApiProperty({ description: '视频宽度' })
	width: number

	@ApiProperty({ description: '视频高度' })
	height: number

	@ApiProperty({ description: '视频缩略图' })
	thumbnail?: string
}

// 消息元数据联合类型
export type MessageMetadata = TextMetadata | FileMetadata | VoiceMetadata | LinkMetadata | ImageMetadata | VideoMetadata

@ApiExtraModels(TextMetadata, FileMetadata, VoiceMetadata, LinkMetadata, ImageMetadata, VideoMetadata)
export class CreateMessageDto {
	@ApiProperty({ description: '消息内容' })
	content: string

	@ApiProperty({ enum: MessageType, description: '消息类型', example: MessageType.TEXT })
	type: MessageType

	@ApiPropertyOptional({
		description: '消息元数据',
		type: 'object',
		oneOf: [
			{ $ref: '#/components/schemas/TextMetadata' },
			{ $ref: '#/components/schemas/FileMetadata' },
			{ $ref: '#/components/schemas/VoiceMetadata' },
			{ $ref: '#/components/schemas/LinkMetadata' },
			{ $ref: '#/components/schemas/ImageMetadata' },
			{ $ref: '#/components/schemas/VideoMetadata' },
		],
	})
	metadata?: MessageMetadata

	@ApiProperty({ description: '发送者ID', example: 1 })
	senderId: number

	@ApiProperty({ description: '接收者ID', example: 2 })
	receiverId: number

	@ApiProperty({ description: '聊天室ID', example: 1 })
	chatId: number

	@ApiPropertyOptional({ enum: MessageStatus, description: '消息状态', example: MessageStatus.SENT })
	status?: MessageStatus

	@ApiPropertyOptional({ description: '临时消息ID，用于前端消息关联', example: 1740804835283 })
	tempId?: number
}

@ApiExtraModels(TextMetadata, FileMetadata, VoiceMetadata, LinkMetadata, ImageMetadata, VideoMetadata)
export class UpdateMessageDto {
	@ApiPropertyOptional({ description: '消息内容' })
	content?: string

	@ApiPropertyOptional({ enum: MessageType, description: '消息类型' })
	type?: MessageType

	@ApiPropertyOptional({
		description: '消息元数据',
		type: 'object',
		oneOf: [
			{ $ref: '#/components/schemas/TextMetadata' },
			{ $ref: '#/components/schemas/FileMetadata' },
			{ $ref: '#/components/schemas/VoiceMetadata' },
			{ $ref: '#/components/schemas/LinkMetadata' },
			{ $ref: '#/components/schemas/ImageMetadata' },
			{ $ref: '#/components/schemas/VideoMetadata' },
		],
	})
	metadata?: MessageMetadata

	@ApiPropertyOptional({ enum: MessageStatus, description: '消息状态' })
	status?: MessageStatus
}

export class UpdateMessageStatusDto {
	@ApiProperty({ enum: MessageStatus, description: '消息状态' })
	status: MessageStatus
}
