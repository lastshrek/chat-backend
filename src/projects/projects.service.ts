import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MinioService } from '../common/services/minio.service'
import { CreateProjectDto, AddProjectMemberDto, AddProjectLinkDto } from './dto/project.dto'
import { ProjectRole } from '@prisma/client'

@Injectable()
export class ProjectsService {
	constructor(private prisma: PrismaService, private minioService: MinioService) {}

	async createProject(userId: number, dto: CreateProjectDto) {
		// 先创建聊天室
		const chat = await this.prisma.chat.create({
			data: {
				name: dto.title,
				type: 'GROUP',
				creatorId: userId,
				participants: {
					create: {
						userId: userId,
						role: 'OWNER',
					},
				},
			},
		})

		// 然后创建项目
		const project = await this.prisma.project.create({
			data: {
				title: dto.title,
				description: dto.description,
				creatorId: userId,
				chatId: chat.id,
				members: {
					create: {
						userId: userId,
						role: ProjectRole.OWNER,
					},
				},
			},
			include: {
				creator: true,
				members: {
					include: {
						user: true,
					},
				},
				chat: true,
			},
		})

		// 如果提供了其他成员，添加他们
		if (dto.memberIds?.length) {
			await this.prisma.projectMember.createMany({
				data: dto.memberIds.map(memberId => ({
					projectId: project.id,
					userId: memberId,
					role: ProjectRole.MEMBER,
				})),
				skipDuplicates: true,
			})
		}

		return project
	}

	async addProjectMember(projectId: string, userId: number, dto: AddProjectMemberDto) {
		// 检查权限
		await this.checkPermission(projectId, userId, [ProjectRole.OWNER, ProjectRole.ADMIN])

		// 添加成员
		const member = await this.prisma.projectMember.create({
			data: {
				projectId,
				userId: dto.userId,
				role: dto.role,
			},
			include: {
				user: true,
			},
		})

		return member
	}

	async pinMessage(projectId: string, userId: number, messageId: number) {
		// 检查权限
		await this.checkPermission(projectId, userId, [ProjectRole.OWNER, ProjectRole.ADMIN])

		// 置顶消息
		const pinnedMessage = await this.prisma.projectPinnedMessage.create({
			data: {
				projectId,
				messageId,
				pinnedBy: userId,
			},
			include: {
				message: true,
				user: true,
			},
		})

		return pinnedMessage
	}

	async addProjectLink(projectId: string, userId: number, dto: AddProjectLinkDto) {
		// 检查权限
		await this.checkPermission(projectId, userId, [ProjectRole.OWNER, ProjectRole.ADMIN])

		// 添加链接
		const link = await this.prisma.projectLink.create({
			data: {
				projectId,
				title: dto.title,
				url: dto.url,
				description: dto.description,
				addedBy: userId,
			},
			include: {
				user: true,
			},
		})

		return link
	}

	private async checkPermission(projectId: string, userId: number, allowedRoles: ProjectRole[]) {
		const member = await this.prisma.projectMember.findUnique({
			where: {
				projectId_userId: {
					projectId,
					userId,
				},
			},
		})

		if (!member || !allowedRoles.includes(member.role)) {
			throw new ForbiddenException('您没有权限执行此操作')
		}
	}

	async getProject(projectId: string, userId: number) {
		const project = await this.prisma.project.findUnique({
			where: { id: projectId },
			include: {
				creator: true,
				members: {
					include: {
						user: true,
					},
				},
				pinnedMessages: {
					include: {
						message: true,
						user: true,
					},
					orderBy: {
						pinnedAt: 'desc',
					},
				},
				files: {
					include: {
						user: true,
					},
					orderBy: {
						uploadedAt: 'desc',
					},
				},
				links: {
					include: {
						user: true,
					},
					orderBy: {
						addedAt: 'desc',
					},
				},
				chat: true,
			},
		})

		if (!project) {
			throw new NotFoundException('项目不存在')
		}

		// 检查用户是否是项目成员
		const isMember = project.members.some(member => member.userId === userId)
		if (!isMember) {
			throw new ForbiddenException('您不是该项目的成员')
		}

		return project
	}

	async getUserProjects(userId: number) {
		const projects = await this.prisma.project.findMany({
			where: {
				members: {
					some: {
						userId: userId,
					},
				},
			},
			include: {
				creator: true,
				members: {
					include: {
						user: true,
					},
				},
				_count: {
					select: {
						pinnedMessages: true,
						files: true,
						links: true,
					},
				},
			},
			orderBy: {
				updatedAt: 'desc',
			},
		})

		return projects
	}

	async updateProject(projectId: string, userId: number, data: { title?: string; description?: string }) {
		// 检查权限
		await this.checkPermission(projectId, userId, [ProjectRole.OWNER, ProjectRole.ADMIN])

		const project = await this.prisma.project.update({
			where: { id: projectId },
			data,
			include: {
				creator: true,
				members: {
					include: {
						user: true,
					},
				},
			},
		})

		return project
	}

	async deleteProject(projectId: string, userId: number) {
		// 检查权限
		await this.checkPermission(projectId, userId, [ProjectRole.OWNER])

		await this.prisma.project.delete({
			where: { id: projectId },
		})

		return { success: true }
	}

	// ... 其他方法
}
