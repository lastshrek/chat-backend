import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { ProjectsService } from './projects.service'
import { CreateProjectDto, AddProjectMemberDto, AddProjectLinkDto, PinMessageDto } from './dto/project.dto'

@ApiTags('projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProjectsController {
	constructor(private readonly projectsService: ProjectsService) {}

	@Post()
	@ApiOperation({ summary: '创建项目' })
	async createProject(@Request() req, @Body() dto: CreateProjectDto) {
		return this.projectsService.createProject(req.user.sub, dto)
	}

	@Post(':id/members')
	@ApiOperation({ summary: '添加项目成员' })
	async addProjectMember(@Request() req, @Param('id') projectId: string, @Body() dto: AddProjectMemberDto) {
		return this.projectsService.addProjectMember(projectId, req.user.sub, dto)
	}

	@Post(':id/pin-message')
	@ApiOperation({ summary: '置顶消息' })
	async pinMessage(@Request() req, @Param('id') projectId: string, @Body() dto: PinMessageDto) {
		return this.projectsService.pinMessage(projectId, req.user.sub, dto.messageId)
	}

	@Post(':id/links')
	@ApiOperation({ summary: '添加项目链接' })
	async addProjectLink(@Request() req, @Param('id') projectId: string, @Body() dto: AddProjectLinkDto) {
		return this.projectsService.addProjectLink(projectId, req.user.sub, dto)
	}

	@Get()
	@ApiOperation({ summary: '获取用户参与的所有项目' })
	@ApiResponse({
		status: 200,
		description: '成功获取项目列表',
	})
	async getUserProjects(@Request() req) {
		return this.projectsService.getUserProjects(req.user.sub)
	}

	@Get(':id')
	@ApiOperation({ summary: '获取项目详情' })
	@ApiResponse({
		status: 200,
		description: '成功获取项目详情',
	})
	async getProject(@Request() req, @Param('id') projectId: string) {
		return this.projectsService.getProject(projectId, req.user.sub)
	}

	@Put(':id')
	@ApiOperation({ summary: '更新项目信息' })
	@ApiResponse({
		status: 200,
		description: '成功更新项目信息',
	})
	async updateProject(
		@Request() req,
		@Param('id') projectId: string,
		@Body() data: { title?: string; description?: string }
	) {
		return this.projectsService.updateProject(projectId, req.user.sub, data)
	}

	@Delete(':id')
	@ApiOperation({ summary: '删除项目' })
	@ApiResponse({
		status: 200,
		description: '成功删除项目',
	})
	async deleteProject(@Request() req, @Param('id') projectId: string) {
		return this.projectsService.deleteProject(projectId, req.user.sub)
	}
}
