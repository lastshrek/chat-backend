import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty } from 'class-validator'

export class CreateMeetingDto {
	@ApiProperty({ description: '会议标题' })
	@IsString()
	@IsNotEmpty()
	title: string
}
