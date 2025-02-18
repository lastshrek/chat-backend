import { MessageStatus, MessageType } from '@prisma/client'
import { ApiProperty, ApiPropertyOptional, getSchemaPath, ApiExtraModels } from '@nestjs/swagger'

@ApiProperty({ description: '消息元数据基类' })
export class MessageMetadata {}

@ApiProperty({ description: '文本消息元数据' })
export class TextMetadata extends MessageMetadata {
	@ApiPropertyOptional({ description: '文本格式' })
	format?: string
}

@ApiProperty({ description: '文件消息元数据' })
export class FileMetadata extends MessageMetadata {
	@ApiProperty({ description: '文件名' })
	fileName: string

	@ApiProperty({ description: '文件大小(bytes)' })
	fileSize: number

	@ApiProperty({ description: '文件类型' })
	mimeType: string

	@ApiProperty({ description: '文件URL' })
	url: string
}

@ApiProperty({ description: '语音消息元数据' })
export class VoiceMetadata extends MessageMetadata {
	@ApiProperty({ description: '语音时长(秒)' })
	duration: number

	@ApiProperty({ description: '语音文件URL' })
	url: string
}

@ApiProperty({ description: '链接消息元数据' })
export class LinkMetadata extends MessageMetadata {
	@ApiProperty({ description: '链接URL' })
	url: string

	@ApiPropertyOptional({ description: '链接标题' })
	title?: string

	@ApiPropertyOptional({ description: '链接描述' })
	description?: string

	@ApiPropertyOptional({ description: '链接缩略图' })
	thumbnail?: string
}

@ApiProperty({ description: '图片消息元数据' })
export class ImageMetadata extends MessageMetadata {
	@ApiProperty({ description: '图片宽度' })
	width: number

	@ApiProperty({ description: '图片高度' })
	height: number

	@ApiProperty({ description: '图片URL' })
	url: string

	@ApiPropertyOptional({ description: '缩略图URL' })
	thumbnail?: string
}

@ApiProperty({ description: '视频消息元数据' })
export class VideoMetadata extends MessageMetadata {
	@ApiProperty({ description: '视频时长(秒)' })
	duration: number

	@ApiProperty({ description: '视频宽度' })
	width: number

	@ApiProperty({ description: '视频高度' })
	height: number

	@ApiProperty({ description: '视频URL' })
	url: string

	@ApiPropertyOptional({ description: '视频缩略图' })
	thumbnail?: string
}

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
