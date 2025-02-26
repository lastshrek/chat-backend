import { Controller, Post, Get, Body, Param, UseGuards, Req, Query, Patch, Request } from '@nestjs/common'
import { DocumentsService } from './documents.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger'
import { CreateDocumentDto, AddCollaboratorDto, CollaboratorRole } from './dto/document.dto'

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
	constructor(private readonly documentsService: DocumentsService) {}

	@Post()
	@ApiOperation({ summary: '创建文档' })
	async createDocument(@Req() req, @Body() createDocumentDto: CreateDocumentDto) {
		console.log('User ID:', req.user.sub) // 改用 sub 而不是 id
		console.log('Document Data:', createDocumentDto) // 添加日志

		const document = await this.documentsService.createDocument(
			req.user.sub, // 改用 sub
			createDocumentDto.title,
			createDocumentDto.type
		)

		return {
			id: document.id,
			title: document.title,
			type: document.type,
			content: document.content,
			createdAt: document.createdAt,
		}
	}

	@Get()
	@ApiOperation({ summary: '获取文档列表' })
	async getDocuments(@Req() req, @Query('type') type?: string) {
		return this.documentsService.getDocuments(req.user.sub, type)
	}

	@Get(':id')
	@ApiOperation({ summary: '获取文档详情' })
	async getDocument(@Param('id') id: string, @Req() req) {
		return this.documentsService.getDocumentWithAccess(id, req.user.sub)
	}

	@Post(':id/collaborators')
	@ApiOperation({ summary: '添加协作者' })
	async addCollaborator(@Param('id') id: string, @Body() data: AddCollaboratorDto, @Req() req) {
		// 检查当前用户是否有权限添加协作者
		await this.documentsService.checkPermission(id, req.user.sub, CollaboratorRole.EDITOR)
		return this.documentsService.addCollaborator(id, data.userId, data.role)
	}

	@Patch(':id')
	@ApiOperation({ summary: '更新文档' })
	@ApiParam({ name: 'id', description: '文档ID' })
	@ApiBody({
		schema: {
			properties: {
				content: { type: 'string', description: '文档内容' },
			},
		},
	})
	async updateDocument(@Param('id') id: string, @Body() updateDto: { content: string }, @Request() req) {
		const result = await this.documentsService.updateDocument(id, updateDto.content, req.user.sub)
		return {
			code: 200,
			data: result,
			message: 'success',
		}
	}
}
