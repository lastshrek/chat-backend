import { Injectable, NotFoundException, ForbiddenException, Logger, Inject, forwardRef } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { DocumentType, CollaboratorRole, TextOperation, CellOperation } from './dto/document.dto'
import { DocumentsGateway } from './documents.gateway'

const TAG = '📃📃📃'

interface CellStyle {
	bold?: boolean
	italic?: boolean
	color?: string
	backgroundColor?: string
	// 其他样式属性
}

interface ExcelContent {
	cells: {
		[key: string]: {
			// 例如: 'A1', 'B2'
			content: string
			formula?: string
			style?: CellStyle
		}
	}
	rowCount: number
	columnCount: number
}

@Injectable()
export class DocumentsService {
	private readonly logger = new Logger(DocumentsService.name)

	constructor(
		private prisma: PrismaService,
		@Inject(forwardRef(() => DocumentsGateway))
		private documentsGateway: DocumentsGateway
	) {}

	async createDocument(userId: number, title: string, type: DocumentType) {
		const initialContent =
			type === DocumentType.EXCEL
				? JSON.stringify({
						cells: {},
						rowCount: 100,
						columnCount: 26,
				  })
				: ''

		return this.prisma.document.create({
			data: {
				title,
				type,
				content: initialContent,
				creator: {
					connect: {
						id: userId,
					},
				},
			},
			include: {
				creator: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})
	}

	async getDocument(id: string) {
		const document = await this.prisma.document.findUnique({
			where: { id },
			include: {
				creator: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})

		if (!document) {
			throw new NotFoundException(`Document ${id} not found`)
		}

		return document
	}

	async saveOperation(documentId: string, userId: number, operation: any) {
		// 保存操作记录
		await this.prisma.documentOperation.create({
			data: {
				documentId,
				userId,
				operation,
			},
		})

		// 更新文档内容
		// 这里需要根据操作类型来更新文档内容
		// 可以使用 OT (Operational Transformation) 或 CRDT (Conflict-free Replicated Data Types)
	}

	async addCollaborator(documentId: string, userId: number, role: 'editor' | 'viewer') {
		// 检查文档是否存在
		const document = await this.prisma.document.findUnique({
			where: { id: documentId },
		})

		if (!document) {
			throw new NotFoundException('Document not found')
		}

		// 检查是否已经是协作者
		const existingCollaborator = await this.prisma.documentCollaborator.findUnique({
			where: {
				documentId_userId: {
					documentId,
					userId,
				},
			},
		})

		if (existingCollaborator) {
			// 如果已存在，更新角色
			return this.prisma.documentCollaborator.update({
				where: {
					documentId_userId: {
						documentId,
						userId,
					},
				},
				data: { role },
				include: {
					user: {
						select: {
							id: true,
							username: true,
							avatar: true,
						},
					},
				},
			})
		}

		// 创建新的协作者
		return this.prisma.documentCollaborator.create({
			data: {
				documentId,
				userId,
				role,
			},
			include: {
				user: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})
	}

	async getDocumentWithOperations(documentId: string) {
		const document = await this.getDocument(documentId)
		const operations = await this.prisma.documentOperation.findMany({
			where: { documentId },
			orderBy: { createdAt: 'asc' },
			include: {
				user: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})

		return {
			...document,
			operations,
		}
	}

	async getDocuments(userId: number, type?: string) {
		// 暂时返回所有文档
		return this.prisma.document.findMany({
			where: type ? { type } : undefined,
			include: {
				creator: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})
	}

	async getDocumentWithAccess(documentId: string, userId: number) {
		// 暂时直接返回文档，不检查权限
		return this.getDocument(documentId)
	}

	async checkPermission(documentId: string, userId: number, requiredRole: CollaboratorRole) {
		// 暂时允许所有操作
		return true
	}

	async updateDocument(id: string, content: string, userId: number) {
		// 检查文档是否存在
		const document = await this.prisma.document.findUnique({
			where: { id },
			include: {
				collaborators: true,
			},
		})

		if (!document) {
			throw new NotFoundException('Document not found')
		}

		// 开启事务
		return await this.prisma.$transaction(async tx => {
			// 检查并添加协作者记录（如果不存在）
			const existingCollaborator = await tx.documentCollaborator.findUnique({
				where: {
					documentId_userId: {
						documentId: id,
						userId,
					},
				},
			})

			if (!existingCollaborator && document.creatorId !== userId) {
				// 如果不是创建者且不是协作者，添加为编辑者
				await tx.documentCollaborator.create({
					data: {
						documentId: id,
						userId,
						role: 'editor',
					},
				})
			}

			// 更新文档
			const updatedDocument = await tx.document.update({
				where: { id },
				data: {
					content,
					lastEditById: userId,
					updatedAt: new Date(),
				},
				include: {
					creator: {
						select: {
							id: true,
							username: true,
							avatar: true,
						},
					},
					lastEditBy: {
						select: {
							id: true,
							username: true,
							avatar: true,
						},
					},
					collaborators: {
						include: {
							user: {
								select: {
									id: true,
									username: true,
									avatar: true,
								},
							},
						},
					},
				},
			})

			// 记录实际的更新操作
			await tx.documentOperation.create({
				data: {
					documentId: id,
					userId,
					operation: JSON.stringify({
						type: 'UPDATE',
						content,
						timestamp: new Date().toISOString(),
					}),
				},
			})

			return updatedDocument
		})
	}

	private applyTextOperation(content: string, operation: TextOperation): string {
		switch (operation.type) {
			case 'insert':
				return content.slice(0, operation.position) + operation.content + content.slice(operation.position)

			case 'delete':
				return content.slice(0, operation.position) + content.slice(operation.position + operation.length)

			case 'replace':
				return (
					content.slice(0, operation.position) +
					operation.content +
					content.slice(operation.position + operation.length)
				)

			default:
				throw new Error('Unknown operation type')
		}
	}

	private applyExcelOperation(content: ExcelContent, operation: CellOperation): ExcelContent {
		const newContent = { ...content }

		switch (operation.type) {
			case 'updateCell':
				const cellKey = `${String.fromCharCode(65 + operation.column)}${operation.row + 1}`
				newContent.cells[cellKey] = {
					...newContent.cells[cellKey],
					content: operation.content,
					formula: operation.formula,
					style: operation.style,
				}
				break

			case 'insertRow':
				// 处理插入行操作
				// 需要移动现有单元格数据
				break

			case 'deleteRow':
				// 处理删除行操作
				break

			// 其他操作类型的处理...
		}

		return newContent
	}

	// 添加一个方法来处理并发操作
	private transformOperations(op1: TextOperation, op2: TextOperation): TextOperation {
		// 如果 op2 的位置在 op1 之前，需要调整 op1 的位置
		if (op2.position < op1.position) {
			switch (op2.type) {
				case 'insert':
					return {
						...op1,
						position: op1.position + op2.content.length,
					}
				case 'delete':
					return {
						...op1,
						position: op1.position - op2.length,
					}
			}
		}
		return op1
	}

	// 获取文档历史记录
	async getDocumentHistory(documentId: string) {
		return this.prisma.documentOperation.findMany({
			where: { documentId },
			orderBy: { createdAt: 'desc' },
			include: {
				user: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})
	}

	// 获取文档协作者列表
	async getCollaborators(documentId: string) {
		return this.prisma.documentCollaborator.findMany({
			where: { documentId },
			include: {
				user: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})
	}

	async getDocumentOperations(documentId: string) {
		const operations = await this.prisma.documentOperation.findMany({
			where: { documentId },
			orderBy: {
				createdAt: 'asc',
			},
			include: {
				user: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})

		return operations
	}

	async getLatestOperations(documentId: string) {
		return this.prisma.documentOperation.findMany({
			where: { documentId },
			orderBy: {
				createdAt: 'desc',
			},
			include: {
				user: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})
	}
}
