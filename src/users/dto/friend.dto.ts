import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsString, IsOptional, IsNotEmpty } from 'class-validator'
import { FriendRequestStatus } from '@prisma/client'

export class CreateFriendRequestDto {
	@ApiProperty({ description: '接收者ID' })
	@IsNumber()
	@IsNotEmpty({ message: '被请求者id不能为空' })
	toId: number

	@ApiPropertyOptional({ description: '请求消息' })
	@IsString()
	@IsOptional()
	message?: string
}

export class UpdateFriendRequestDto {
	@ApiProperty({ enum: FriendRequestStatus, description: '请求状态' })
	status: FriendRequestStatus
}
