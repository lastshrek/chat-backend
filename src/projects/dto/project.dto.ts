import { IsString, IsOptional, IsArray, IsNumber, IsEnum, MinLength, MaxLength, IsUrl } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ProjectRole } from '@prisma/client'

export class CreateProjectDto {
	@ApiProperty({ description: '项目标题' })
	@IsString()
	@MinLength(2)
	@MaxLength(100)
	title: string

	@ApiPropertyOptional({ description: '项目描述' })
	@IsString()
	@IsOptional()
	@MaxLength(1000)
	description?: string

	@ApiPropertyOptional({ description: '初始成员ID列表' })
	@IsArray()
	@IsNumber({}, { each: true })
	@IsOptional()
	memberIds?: number[]
}

export class AddProjectMemberDto {
	@ApiProperty({ description: '用户ID' })
	@IsNumber()
	userId: number

	@ApiProperty({ description: '角色', enum: ProjectRole })
	@IsEnum(ProjectRole)
	role: ProjectRole
}

export class AddProjectLinkDto {
	@ApiProperty({ description: '链接标题' })
	@IsString()
	@MinLength(1)
	@MaxLength(100)
	title: string

	@ApiProperty({ description: '链接URL' })
	@IsUrl()
	url: string

	@ApiPropertyOptional({ description: '链接描述' })
	@IsString()
	@IsOptional()
	@MaxLength(500)
	description?: string
}

export class PinMessageDto {
	@ApiProperty({ description: '消息ID' })
	@IsNumber()
	messageId: number
}

export class UpdateProjectDto {
	@ApiPropertyOptional({ description: '项目标题' })
	@IsString()
	@MinLength(2)
	@MaxLength(100)
	@IsOptional()
	title?: string

	@ApiPropertyOptional({ description: '项目描述' })
	@IsString()
	@IsOptional()
	@MaxLength(1000)
	description?: string
}
