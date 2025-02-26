import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsEnum, IsNumber, IsOptional } from 'class-validator'

export enum DocumentType {
	WORD = 'word',
	EXCEL = 'excel',
}

export enum CollaboratorRole {
	EDITOR = 'editor',
	VIEWER = 'viewer',
}

export class CreateDocumentDto {
	@ApiProperty({ description: '文档标题' })
	@IsString()
	title: string

	@ApiProperty({ description: '文档类型', enum: DocumentType })
	@IsEnum(DocumentType)
	type: DocumentType
}

export class AddCollaboratorDto {
	@ApiProperty({ description: '用户ID' })
	@IsNumber()
	userId: number

	@ApiProperty({ description: '协作者角色', enum: CollaboratorRole })
	@IsEnum(CollaboratorRole)
	role: CollaboratorRole
}

export class DocumentOperationDto {
	@ApiProperty({ description: '操作内容' })
	operation: any

	@ApiProperty({ description: '文档版本号' })
	@IsNumber()
	version: number
}

// 基础操作接口
export interface BaseOperation {
	type: string
	userId: number
}

// Word文档的操作
export interface TextOperation extends BaseOperation {
	type: 'insert' | 'delete' | 'replace'
	position: number
	content?: string
	length?: number
}

// Excel文档的操作
export interface CellOperation extends BaseOperation {
	type: 'updateCell' | 'insertRow' | 'deleteRow' | 'insertColumn' | 'deleteColumn'
	row: number
	column: number
	content?: string
	formula?: string
	style?: CellStyle
}

export interface CellStyle {
	bold?: boolean
	italic?: boolean
	color?: string
	backgroundColor?: string
}

// Excel文档的内容结构
export interface ExcelContent {
	cells: {
		[key: string]: {
			content: string
			formula?: string
			style?: CellStyle
		}
	}
	rowCount: number
	columnCount: number
}
