import {
	WebSocketGateway,
	WebSocketServer,
	SubscribeMessage,
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import { DocumentsService } from './documents.service'
import { TextOperation, CellOperation } from './dto/document.dto'

const TAG = '📃📃📃'

@WebSocketGateway({
	namespace: '/documents',
	cors: {
		origin: '*',
		credentials: true,
	},
})
export class DocumentsGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	public server: Server

	private readonly logger = new Logger(DocumentsGateway.name)
	private documentUsers = new Map<string, Set<{ userId: number; username: string; avatar: string }>>()

	constructor(
		@Inject(forwardRef(() => DocumentsService))
		private readonly documentsService: DocumentsService
	) {
		this.logger.log(`${TAG} DocumentsGateway 已初始化`)
	}

	async handleConnection(client: Socket) {
		const user = client.data?.user
		const documentId = client.data?.documentId

		this.logger.log(`${TAG} 客户端连接:`, {
			id: client.id,
			user,
			documentId,
			handshake: client.handshake,
			rooms: Array.from(client.rooms || []),
		})

		if (documentId && user) {
			await client.join(documentId)
			this.logger.log(`${TAG} 客户端已加入房间:`, {
				socketId: client.id,
				documentId,
				rooms: Array.from(client.rooms),
			})

			if (!this.documentUsers.has(documentId)) {
				this.documentUsers.set(documentId, new Set())
			}

			const documentUserSet = this.documentUsers.get(documentId)!
			const newUser = {
				userId: user.sub,
				username: user.username,
				avatar: user.avatar,
			}

			// 检查用户是否已存在
			const existingUser = Array.from(documentUserSet).find(u => u.userId === user.sub)
			if (!existingUser) {
				documentUserSet.add(newUser)

				const userList = Array.from(documentUserSet)
				// 发送当前用户列表给新用户
				client.emit('document:users', userList)
				this.logger.log(`${TAG} 发送用户列表给新用户:`, { userList })

				// 广播新用户加入给其他用户
				client.broadcast.to(documentId).emit('document:user_joined', newUser)
				this.logger.log(`${TAG} 广播新用户加入:`, { newUser })
			} else {
				// 如果用户已存在，只发送当前用户列表
				const userList = Array.from(documentUserSet)
				client.emit('document:users', userList)
				this.logger.log(`${TAG} 发送用户列表给已存在用户:`, { userList })
			}
		}
	}

	handleDisconnect(client: Socket) {
		const user = client.data?.user
		const documentId = client.data?.documentId

		this.logger.log(`${TAG} 客户端断开连接:`, {
			id: client.id,
			user,
			documentId,
			rooms: Array.from(client.rooms || []),
		})

		if (user && documentId) {
			const documentUserSet = this.documentUsers.get(documentId)
			if (documentUserSet) {
				documentUserSet.forEach(u => {
					if (u.userId === user.sub) {
						documentUserSet.delete(u)
						this.logger.log(`${TAG} 用户已从文档中移除:`, {
							userId: user.sub,
							username: user.username,
							documentId,
						})
					}
				})

				client.broadcast.to(documentId).emit('document:user_left', {
					userId: user.sub,
					username: user.username,
					avatar: user.avatar,
				})

				if (documentUserSet.size === 0) {
					this.documentUsers.delete(documentId)
					this.logger.log(`${TAG} 文档用户集合已清空:`, { documentId })
				}

				this.logger.log(`${TAG} 房间状态:`, {
					documentId,
					userCount: documentUserSet.size,
					users: Array.from(documentUserSet),
				})
			}
		}
	}

	@SubscribeMessage('document:join')
	async handleJoinDocument(@ConnectedSocket() client: Socket, @MessageBody() data: { documentId: string }) {
		const { documentId } = data
		const user = client.data.user

		this.logger.log(`${TAG} 收到加入文档请求:`, {
			socketId: client.id,
			userId: user.sub,
			username: user.username,
			documentId,
		})

		try {
			await client.join(documentId)
			this.logger.log(`${TAG} 用户已加入房间`, { documentId })

			if (!this.documentUsers.has(documentId)) {
				this.documentUsers.set(documentId, new Set())
				this.logger.log(`${TAG} 创建新的文档用户集合`, { documentId })
			}

			const documentUserSet = this.documentUsers.get(documentId)!
			const newUser = {
				userId: user.sub,
				username: user.username,
				avatar: user.avatar,
			}

			// 检查用户是否已存在
			const existingUser = Array.from(documentUserSet).find(u => u.userId === user.sub)
			if (!existingUser) {
				documentUserSet.add(newUser)

				const userList = Array.from(documentUserSet)
				client.emit('document:users', userList)
				this.logger.log(`${TAG} 发送用户列表给新用户:`, { userList })

				client.broadcast.to(documentId).emit('document:user_joined', newUser)
				this.logger.log(`${TAG} 广播新用户加入:`, { newUser })
			} else {
				// 如果用户已存在，只发送当前用户列表
				const userList = Array.from(documentUserSet)
				client.emit('document:users', userList)
				this.logger.log(`${TAG} 发送用户列表给已存在用户:`, { userList })
			}

			const document = await this.documentsService.getDocument(documentId)
			this.logger.log(`${TAG} 获取文档内容成功:`, { documentId })

			return document
		} catch (error) {
			this.logger.error(`${TAG} 加入文档失败:`, error)
			throw error
		}
	}

	@SubscribeMessage('document:leave')
	async handleLeaveDocument(@ConnectedSocket() client: Socket, @MessageBody() data: { documentId: string }) {
		const { documentId } = data
		const user = client.data.user

		await client.leave(documentId)
		client.broadcast.to(documentId).emit('document:user_left', {
			userId: user.sub,
			username: user.username,
			avatar: user.avatar,
		})
	}

	// 添加公共方法用于发送文档更新
	public broadcastDocumentUpdate(documentId: string, data: any) {
		this.server.to(documentId).emit('document:updated', data)
	}

	@SubscribeMessage('document:operation')
	async handleDocumentOperation(
		@ConnectedSocket() client: Socket,
		@MessageBody()
		data: {
			documentId: string
			operation: TextOperation | CellOperation
		}
	) {
		const { documentId, operation } = data
		const user = client.data.user

		this.logger.log(`${TAG} 收到文档操作:`, {
			socketId: client.id,
			userId: user.sub,
			username: user.username,
			documentId,
			operation,
			rooms: Array.from(client.rooms || []),
		})

		try {
			if (!client.rooms.has(documentId)) {
				this.logger.warn(`${TAG} 用户不在文档房间中:`, {
					socketId: client.id,
					documentId,
					currentRooms: Array.from(client.rooms),
				})
				return { success: false, error: 'User not in document room' }
			}

			const content = JSON.stringify(operation)
			const updatedDocument = await this.documentsService.updateDocument(documentId, content, user.sub)

			// 广播操作给房间内的其他用户
			client.broadcast.to(documentId).emit('document:operation', {
				userId: user.sub,
				username: user.username,
				avatar: user.avatar,
				operation,
				document: updatedDocument,
			})

			return { success: true, document: updatedDocument }
		} catch (error) {
			this.logger.error(`${TAG} 文档操作失败:`, {
				error: error.message,
				stack: error.stack,
				documentId,
				operation,
			})
			return {
				success: false,
				error: error instanceof NotFoundException ? 'Document not found' : 'Failed to update document',
			}
		}
	}

	@SubscribeMessage('document:cursor')
	handleCursorMove(
		@ConnectedSocket() client: Socket,
		@MessageBody()
		data: {
			documentId: string
			position: { row: number; column: number }
		}
	) {
		const { documentId, position } = data
		const user = client.data.user

		client.broadcast.to(documentId).emit('document:cursor_moved', {
			userId: user.sub,
			username: user.username,
			position,
		})
	}

	@SubscribeMessage('document:selection')
	handleSelectionChange(
		@ConnectedSocket() client: Socket,
		@MessageBody()
		data: {
			documentId: string
			selection: { start: number; end: number }
		}
	) {
		const { documentId, selection } = data
		const user = client.data.user

		client.broadcast.to(documentId).emit('document:selection_changed', {
			userId: user.sub,
			username: user.username,
			selection,
		})
	}
}
