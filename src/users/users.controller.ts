import { Controller, Post, Body, Param, Patch, Get, Request, Query, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { CreateUserDto, LoginDto } from './dto/user.dto'
import { CreateFriendRequestDto, UpdateFriendRequestDto } from './dto/friend.dto'

@ApiTags('users')
@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Post('register')
	@ApiOperation({ summary: '注册新用户' })
	@ApiResponse({ status: 201, description: '用户创建成功' })
	create(@Body() createUserDto: CreateUserDto) {
		return this.usersService.create(createUserDto)
	}

	@Post('login')
	@ApiOperation({ summary: '用户登录' })
	@ApiResponse({ status: 200, description: '登录成功' })
	login(@Body() loginDto: LoginDto) {
		return this.usersService.login(loginDto)
	}

	@Post('logout')
	@ApiOperation({ summary: '用户登出' })
	@ApiResponse({ status: 200, description: '登出成功' })
	async logout(@Body() data: { userId: number }) {
		return this.usersService.logout(data.userId)
	}

	@Post(':id/friend-requests')
	@ApiOperation({ summary: '发送好友请求' })
	@ApiResponse({ status: 201, description: '请求发送成功' })
	async sendFriendRequest(@Param('id') fromId: string, @Body() createFriendRequestDto: CreateFriendRequestDto) {
		return this.usersService.sendFriendRequest(+fromId, createFriendRequestDto)
	}

	@Patch('friend-requests/:id')
	@ApiOperation({ summary: '处理好友请求' })
	@ApiResponse({ status: 200, description: '请求处理成功' })
	async handleFriendRequest(
		@Request() req,
		@Param('id') requestId: string,
		@Body() updateFriendRequestDto: UpdateFriendRequestDto
	) {
		return this.usersService.handleFriendRequest(req.user.id, +requestId, updateFriendRequestDto)
	}

	@Get(':id/friends')
	@ApiOperation({ summary: '获取好友列表' })
	@ApiResponse({ status: 200, description: '获取成功' })
	async getFriends(@Param('id') userId: string) {
		return this.usersService.getFriends(+userId)
	}

	@Get('search')
	@ApiOperation({ summary: '搜索用户' })
	@ApiResponse({ status: 200, description: '搜索成功' })
	async searchUsers(@Query('keyword') keyword: string) {
		if (!keyword || keyword.length < 1) {
			throw new BadRequestException('Search keyword is required')
		}
		return this.usersService.searchUsers(keyword)
	}

	@Get('friend-requests')
	@ApiOperation({ summary: '获取所有好友请求' })
	@ApiResponse({ status: 200, description: '获取成功' })
	@ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'ACCEPTED', 'REJECTED'] })
	async getFriendRequests(@Query('status') status?: string) {
		return this.usersService.getFriendRequests(status)
	}
}
