import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server } from 'socket.io'

@Injectable()
@WebSocketGateway({
	namespace: '/meetings',
})
export class MeetingsService {
	@WebSocketServer()
	server: Server

	private readonly logger = new Logger(MeetingsService.name)

	constructor(private prisma: PrismaService) {}

	async createMeeting(userId: number, title: string) {
		this.logger.debug(`Creating meeting: ${title} for user: ${userId}`)

		try {
			const meeting = await this.prisma.meeting.create({
				data: {
					title,
					createdBy: userId,
					participants: {
						create: {
							userId,
							role: 'HOST',
						},
					},
				},
				include: {
					participants: {
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
					creator: {
						select: {
							id: true,
							username: true,
							avatar: true,
						},
					},
				},
			})

			this.logger.debug(`Meeting created: ${meeting.id}`)
			return meeting
		} catch (error) {
			this.logger.error(`Failed to create meeting: ${error.message}`, error.stack)
			throw error
		}
	}

	async getMeetingInfo(meetingId: string) {
		const meeting = await this.prisma.meeting.findUnique({
			where: { id: meetingId },
			include: {
				participants: {
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
				creator: {
					select: {
						id: true,
						username: true,
						avatar: true,
					},
				},
			},
		})

		if (!meeting) {
			throw new NotFoundException('会议不存在')
		}

		return meeting
	}

	async joinMeeting(meetingId: string, userId: number) {
		const meeting = await this.prisma.meeting.findUnique({
			where: { id: meetingId },
		})

		if (!meeting) {
			throw new NotFoundException('会议不存在')
		}

		const participant = await this.prisma.meetingParticipant.create({
			data: {
				meetingId,
				userId,
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

		// 通知其他参会者有新人加入
		this.server.to(meetingId).emit('participant_joined', {
			participant,
		})

		return participant
	}

	async leaveMeeting(meetingId: string, userId: number) {
		const participant = await this.prisma.meetingParticipant.update({
			where: {
				meetingId_userId: {
					meetingId,
					userId,
				},
			},
			data: {
				leaveTime: new Date(),
			},
		})

		this.server.to(meetingId).emit('participant_left', {
			userId,
		})

		return participant
	}

	async getMeetings(userId: number, page: number, limit: number) {
		try {
			// 获取用户参与的所有会议
			const meetings = await this.prisma.meeting.findMany({
				// where: {
				// 	OR: [
				// 		// 用户创建的会议
				// 		{ createdBy: userId },
				// 		// 用户参与的会议
				// 		{
				// 			participants: {
				// 				some: {
				// 					userId,
				// 				},
				// 			},
				// 		},
				// 	],
				// },
				include: {
					creator: {
						select: {
							id: true,
							username: true,
							avatar: true,
						},
					},
					participants: {
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
					_count: {
						select: {
							participants: true,
						},
					},
				},
				orderBy: {
					createdAt: 'desc',
				},
				skip: (page - 1) * limit,
				take: limit,
			})

			// 获取总数
			const total = await this.prisma.meeting.count({
				where: {
					OR: [
						{ createdBy: userId },
						{
							participants: {
								some: {
									userId,
								},
							},
						},
					],
				},
			})

			return {
				meetings,
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit),
				},
			}
		} catch (error) {
			this.logger.error(`Failed to get meetings: ${error.message}`, error.stack)
			throw error
		}
	}
}
