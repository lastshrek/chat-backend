import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

export class CreateUserDto {
	@ApiProperty({ example: 'user1', description: '用户名' })
	@IsString()
	@MinLength(3)
	username: string

	@ApiProperty({ example: 'encrypted_password', description: '加密后的密码' })
	@IsString()
	password: string
}

export class LoginDto {
	@ApiProperty({ example: 'user1', description: '用户名' })
	@IsString()
	@MinLength(3)
	username: string

	@ApiProperty({ example: 'encrypted_password', description: '加密后的密码' })
	@IsString()
	password: string
}
