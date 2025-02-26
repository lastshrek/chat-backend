import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsEnum } from 'class-validator'
import { DocumentType } from './document.dto'

export class CreateDocumentDto {
	@ApiProperty({ description: '文档标题' })
	@IsString()
	title: string

	@ApiProperty({ description: '文档类型', enum: DocumentType })
	@IsEnum(DocumentType)
	type: DocumentType
}
