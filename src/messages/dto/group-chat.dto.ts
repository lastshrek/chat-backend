import { IsString, IsOptional, IsArray, IsNumber, IsEnum, MinLength, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateGroupChatDto {
	@ApiProperty({ description: '群聊名称' })
	@IsString()
	@MinLength(2)
	@MaxLength(50)
	name: string

	@ApiProperty({ description: '初始成员ID列表' })
	@IsArray()
	@IsNumber({}, { each: true })
	memberIds: number[]
}

export class UpdateGroupChatDto {
	@ApiProperty({ description: '群聊名称', required: false })
	@IsString()
	@MinLength(2)
	@MaxLength(50)
	@IsOptional()
	name?: string

	@ApiProperty({ description: '群聊描述', required: false })
	@IsString()
	@IsOptional()
	@MaxLength(200)
	description?: string

	@ApiProperty({ description: '群聊头像URL', required: false })
	@IsString()
	@IsOptional()
	avatar?: string
}

export class AddGroupMembersDto {
	@ApiProperty({ description: '要添加的成员ID列表' })
	@IsArray()
	@IsNumber({}, { each: true })
	memberIds: number[]
}

export class RemoveGroupMemberDto {
	@ApiProperty({ description: '要移除的成员ID' })
	@IsNumber()
	memberId: number
}

export class UpdateMemberRoleDto {
	@ApiProperty({ description: '成员ID' })
	@IsNumber()
	memberId: number

	@ApiProperty({ description: '新角色', enum: ['OWNER', 'ADMIN', 'MEMBER'] })
	@IsEnum(['OWNER', 'ADMIN', 'MEMBER'])
	role: string
}
