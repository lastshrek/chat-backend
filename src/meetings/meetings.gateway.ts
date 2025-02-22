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
import { MeetingsService } from './meetings.service'
import { MediasoupService } from './mediasoup.service'
import { Logger } from '@nestjs/common'

@WebSocketGateway({
	namespace: 'meetings',
	cors: {
		origin: '*',
		methods: ['GET', 'POST'],
		credentials: true,
		allowedHeaders: ['authorization', 'content-type'],
	},
	transports: ['websocket', 'polling'],
	path: '/socket.io/',
})
export class MeetingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server

	private readonly logger = new Logger(MeetingsGateway.name)

	constructor(private meetingsService: MeetingsService, private readonly mediasoup: MediasoupService) {}

	@SubscribeMessage('join_meeting')
	async handleJoinMeeting(@ConnectedSocket() client: Socket, @MessageBody() data: { meetingId: string }) {
		this.logger.debug('Client data:', client.data)

		if (!client.data?.user) {
			this.logger.error('No user data found in socket')
			throw new Error('Unauthorized: User information not found')
		}

		const user = client.data.user
		this.logger.debug('User data:', user)

		// 加入会议房间
		await client.join(data.meetingId)

		// 通知房间内其他人
		client.to(data.meetingId).emit('new_participant', {
			userId: user.sub,
			username: user.username,
			avatar: user.avatar,
		})

		// 获取并返回参与者列表
		const participants = await this.getParticipants(data.meetingId)
		return { participants }
	}

	@SubscribeMessage('offer')
	handleOffer(
		@ConnectedSocket() client: Socket,
		@MessageBody() data: { to: string; offer: RTCSessionDescriptionInit }
	) {
		client.to(data.to).emit('offer', {
			offer: data.offer,
			from: client.id,
		})
	}

	@SubscribeMessage('answer')
	handleAnswer(
		@ConnectedSocket() client: Socket,
		@MessageBody() data: { to: string; answer: RTCSessionDescriptionInit }
	) {
		client.to(data.to).emit('answer', {
			answer: data.answer,
			from: client.id,
		})
	}

	@SubscribeMessage('ice_candidate')
	handleIceCandidate(
		@ConnectedSocket() client: Socket,
		@MessageBody() data: { to: string; candidate: RTCIceCandidateInit }
	) {
		client.to(data.to).emit('ice_candidate', {
			candidate: data.candidate,
			from: client.id,
		})
	}

	@SubscribeMessage('start_screen_share')
	handleStartScreenShare(@ConnectedSocket() client: Socket, @MessageBody() data: { meetingId: string }) {
		client.to(data.meetingId).emit('screen_share_started', {
			userId: client.data.user.sub,
		})
	}

	@SubscribeMessage('stop_screen_share')
	handleStopScreenShare(@ConnectedSocket() client: Socket, @MessageBody() data: { meetingId: string }) {
		client.to(data.meetingId).emit('screen_share_stopped', {
			userId: client.data.user.sub,
		})
	}

	@SubscribeMessage('join-room')
	async handleJoinRoom(client: Socket, data: { roomId: string }) {
		this.logger.debug(`Client ${client.id} joining room ${data.roomId}`)

		try {
			const router = await this.mediasoup.createRoom(data.roomId)
			const transport = await this.mediasoup.createWebRtcTransport(router)

			this.logger.debug(`Created transport ${transport.id} for client ${client.id}`)

			// 通知房间内其他人有新用户加入
			client.to(data.roomId).emit('user-joined', {
				userId: client.data.user.sub,
				username: client.data.user.username,
			})

			client.emit('connection-status', {
				status: 'connected',
				roomId: data.roomId,
				timestamp: new Date(),
				transportId: transport.id,
			})

			return {
				routerRtpCapabilities: router.rtpCapabilities,
				transportOptions: {
					id: transport.id,
					iceParameters: transport.iceParameters,
					iceCandidates: transport.iceCandidates,
					dtlsParameters: transport.dtlsParameters,
				},
			}
		} catch (error) {
			this.logger.error(`Failed to join room: ${error.message}`, error.stack)
			client.emit('connection-status', {
				status: 'error',
				error: error.message,
				timestamp: new Date(),
			})
			throw error
		}
	}

	@SubscribeMessage('connect-transport')
	async handleConnectTransport(
		client: Socket,
		data: {
			transportId: string
			dtlsParameters: any
		}
	) {
		this.logger.debug(`Client ${client.id} connecting transport ${data.transportId}`)
		// 实现传输连接逻辑
	}

	@SubscribeMessage('produce')
	async handleProduce(
		client: Socket,
		data: {
			transportId: string
			kind: string
			rtpParameters: any
		}
	) {
		this.logger.debug(`Client ${client.id} producing ${data.kind} stream`)
		// 实现媒体生产逻辑
	}

	@SubscribeMessage('consume')
	async handleConsume(
		client: Socket,
		data: {
			transportId: string
			producerId: string
			rtpCapabilities: any
		}
	) {
		this.logger.debug(`Client ${client.id} consuming stream from producer ${data.producerId}`)
		// 实现媒体消费逻辑
	}

	@SubscribeMessage('heartbeat')
	handleHeartbeat(client: Socket) {
		this.logger.debug(`Heartbeat from client ${client.id}`)
		return { timestamp: new Date() }
	}

	// 实现 OnGatewayConnection 接口
	handleConnection(client: Socket) {
		this.logger.log(`🟢 Client connected: ${client.id}`)

		// 获取查询参数中的会议ID
		const meetingId = client.handshake.query.meetingId as string
		if (meetingId) {
			this.logger.log(`📍 Client ${client.id} joining meeting: ${meetingId}`)
		}

		// 获取用户信息
		const user = client.data?.user
		if (user) {
			this.logger.log(`👤 User connected: ${user.username} (${user.sub})`)
		}
	}

	// 实现 OnGatewayDisconnect 接口
	handleDisconnect(client: Socket) {
		this.logger.log(`🔴 Client disconnected: ${client.id}`)
	}

	// 修改获取参与者的方法
	private async getParticipants(roomId: string) {
		const sockets = await this.server.in(roomId).fetchSockets()

		// 使用 Map 来去重，key 是 userId
		return Array.from(
			sockets
				.filter(socket => socket.data?.user)
				.reduce((map, socket) => {
					const userId = socket.data.user.sub
					return map.set(userId, {
						userId,
						username: socket.data.user.username,
						avatar: socket.data.user.avatar,
					})
				}, new Map())
				.values()
		)
	}
}
