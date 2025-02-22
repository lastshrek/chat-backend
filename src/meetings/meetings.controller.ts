import { Controller, Post, Get, Body, Param, UseGuards, Request, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { MeetingsService } from './meetings.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CreateMeetingDto } from './dto/create-meeting.dto'

@ApiTags('meetings')
@Controller('meetings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MeetingsController {
	constructor(private readonly meetingsService: MeetingsService) {}

	@Post()
	@ApiOperation({ summary: '创建会议' })
	@ApiResponse({ status: 201, description: '会议创建成功' })
	async createMeeting(@Request() req, @Body() data: CreateMeetingDto) {
		console.log('Creating meeting:', { userId: req.user.sub, title: data.title })
		return this.meetingsService.createMeeting(req.user.sub, data.title)
	}

	@Post(':id/join')
	@ApiOperation({ summary: '加入会议' })
	@ApiResponse({ status: 200, description: '成功加入会议' })
	async joinMeeting(@Request() req, @Param('id') meetingId: string) {
		return this.meetingsService.joinMeeting(meetingId, req.user.sub)
	}

	@Post(':id/leave')
	@ApiOperation({ summary: '离开会议' })
	@ApiResponse({ status: 200, description: '成功离开会议' })
	async leaveMeeting(@Request() req, @Param('id') meetingId: string) {
		return this.meetingsService.leaveMeeting(meetingId, req.user.sub)
	}

	@Get(':id')
	@ApiOperation({ summary: '获取会议信息' })
	@ApiResponse({ status: 200, description: '成功获取会议信息' })
	async getMeetingInfo(@Param('id') meetingId: string) {
		return this.meetingsService.getMeetingInfo(meetingId)
	}

	@Get()
	@ApiOperation({ summary: '获取会议列表' })
	@ApiResponse({ status: 200, description: '成功获取会议列表' })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'limit', required: false, type: Number })
	async getMeetings(@Request() req, @Query('page') page = '1', @Query('limit') limit = '10') {
		return this.meetingsService.getMeetings(req.user.sub, +page, +limit)
	}
}
