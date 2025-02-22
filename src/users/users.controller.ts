import {
	Controller,
	Post,
	Body,
	Param,
	Patch,
	Get,
	Request,
	Query,
	BadRequestException,
	UseGuards,
	HttpException,
	HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { CreateUserDto, LoginDto } from './dto/user.dto'
import { CreateFriendRequestDto, UpdateFriendRequestDto } from './dto/friend.dto'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { Public } from '../common/decorators/public.decorator'
import { LoggerService } from '../common/services/logger.service'
import * as fs from 'fs'
import * as path from 'path'
import { JsonUser } from './dto/json-user.dto'

@ApiTags('users')
@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService, private readonly logger: LoggerService) {}

	@Public()
	@Post('register')
	@ApiOperation({ summary: '注册新用户' })
	@ApiResponse({ status: 201, description: '用户创建成功' })
	create(@Body() createUserDto: CreateUserDto) {
		return this.usersService.create(createUserDto)
	}

	@Public()
	@Post('login')
	@ApiOperation({ summary: '用户登录' })
	@ApiResponse({ status: 200, description: '登录成功' })
	login(@Body() loginDto: LoginDto) {
		return this.usersService.login(loginDto)
	}

	@Post('logout')
	@ApiOperation({ summary: '用户登出' })
	async logout(@Request() req) {
		return this.usersService.logout(req.user.sub)
	}

	@Post('friend-requests')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '发送好友请求' })
	@ApiResponse({ status: 201, description: '请求发送成功' })
	async sendFriendRequest(@Request() req, @Body() createFriendRequestDto: CreateFriendRequestDto) {
		return this.usersService.sendFriendRequest(req.user.sub, createFriendRequestDto)
	}

	@Patch('friend-requests/:id')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '处理好友请求' })
	@ApiResponse({ status: 200, description: '请求处理成功' })
	async handleFriendRequest(
		@Request() req,
		@Param('id') requestId: string,
		@Body() updateFriendRequestDto: UpdateFriendRequestDto
	) {
		return this.usersService.handleFriendRequest(req.user.sub, +requestId, updateFriendRequestDto)
	}

	@Get('friends')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '获取好友列表' })
	@ApiResponse({ status: 200, description: '获取成功' })
	async getFriends(@Request() req) {
		return this.usersService.getFriends(req.user.sub)
	}

	@Get('search')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '搜索用户' })
	@ApiResponse({ status: 200, description: '搜索成功' })
	async searchUsers(@Query('keyword') keyword: string) {
		if (!keyword || keyword.length < 1) {
			throw new BadRequestException('Search keyword is required')
		}
		return this.usersService.searchUsers(keyword)
	}

	@Get('friend-requests')
	@ApiOperation({ summary: '获取发给我的好友请求' })
	@ApiResponse({ status: 200, description: '获取成功' })
	@ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'ACCEPTED', 'REJECTED'] })
	async getFriendRequests(@Request() req, @Query('status') status?: string) {
		return this.usersService.getFriendRequests(req.user.sub, status)
	}

	@Public()
	@Get('org-structure')
	@ApiOperation({ summary: '获取组织架构' })
	@ApiResponse({
		status: 200,
		description: '成功获取组织架构',
		schema: {
			properties: {
				code: { type: 'number', example: 200 },
				data: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							name: { type: 'string' },
							type: { type: 'number' },
							order: { type: 'number' },
							children: { type: 'array' },
							users: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										id: { type: 'string' },
										name: { type: 'string' },
										avatar: { type: 'string' },
										dutyName: { type: 'string' },
									},
								},
							},
						},
					},
				},
				message: { type: 'string', example: 'success' },
			},
		},
	})
	async getOrgStructure() {
		this.logger.debug('Getting organization structure', 'UsersController')
		try {
			const filePath = path.join(process.cwd(), 'user.json')
			const data = await fs.promises.readFile(filePath, 'utf8')
			const users = JSON.parse(data) as JsonUser[]

			// 创建组织结构映射
			const orgMap = new Map<string, any>()

			// 首先收集所有唯一的组织
			users.forEach(user => {
				user.orgsInfo.forEach(org => {
					const fullPath = org.path

					fullPath.forEach(pathItem => {
						if (!orgMap.has(pathItem.id)) {
							orgMap.set(pathItem.id, {
								id: pathItem.id,
								name: pathItem.name,
								type: pathItem.type,
								order: pathItem.type === 2 ? 0 : org.order,
								children: [],
								users: [], // 添加用户数组
							})
						}
					})

					// 将用户添加到其直接所属部门
					const directDeptId = org.path[org.path.length - 1].id
					const directDept = orgMap.get(directDeptId)
					if (directDept && !directDept.users.some(u => u.id === user.id)) {
						directDept.users.push({
							id: user.id,
							name: user.name,
							avatar: user.avatar,
							dutyName: user.dutyName,
						})
					}
				})
			})

			// 建立组织之间的层级关系
			users.forEach(user => {
				user.orgsInfo.forEach(org => {
					const path = org.path

					for (let i = 0; i < path.length - 1; i++) {
						const parentId = path[i].id
						const childId = path[i + 1].id

						const parent = orgMap.get(parentId)
						const child = orgMap.get(childId)

						if (parent && child && !parent.children.some(c => c.id === childId)) {
							parent.children.push(child)
						}
					}
				})
			})

			// 获取顶级组织
			const rootOrgs = Array.from(orgMap.values()).filter(org => {
				return !Array.from(orgMap.values()).some(potentialParent =>
					potentialParent.children.some(child => child.id === org.id)
				)
			})

			// 递归排序所有层级的children和users
			const sortOrganizations = orgs => {
				orgs.forEach(org => {
					// 排序用户（按名字）
					if (org.users.length > 0) {
						org.users.sort((a, b) => a.name.localeCompare(b.name))
					}
					// 排序子部门
					if (org.children.length > 0) {
						org.children.sort((a, b) => a.order - b.order)
						sortOrganizations(org.children)
					}
				})
				return orgs
			}

			const sortedRootOrgs = sortOrganizations(rootOrgs)

			return {
				code: 200,
				data: sortedRootOrgs,
				message: 'success',
			}
		} catch (error) {
			this.logger.error(`Failed to get org structure: ${error.message}`, error.stack)
			throw new HttpException(
				{
					code: HttpStatus.INTERNAL_SERVER_ERROR,
					message: 'Failed to get organization structure',
					data: null,
				},
				HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	@Public()
	@Get('json-data')
	@ApiOperation({ summary: '获取组织架构用户数据' })
	@ApiResponse({
		status: 200,
		description: '成功获取数据',
		schema: {
			properties: {
				code: { type: 'number', example: 200 },
				data: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							name: { type: 'string' },
							avatar: { type: 'string' },
							deptId: { type: 'string' },
							dutyName: { type: 'string' },
							state: { type: 'number' },
							orgsInfo: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										id: { type: 'string' },
										name: { type: 'string' },
										type: { type: 'number' },
										order: { type: 'number' },
										path: { type: 'array' },
									},
								},
							},
						},
					},
				},
				message: { type: 'string', example: 'success' },
			},
		},
	})
	async getUserJsonData(): Promise<{ code: number; data: JsonUser[]; message: string }> {
		this.logger.debug('Accessing public route: getUserJsonData', 'UsersController')
		try {
			const filePath = path.join(process.cwd(), 'user.json')
			const data = await fs.promises.readFile(filePath, 'utf8')
			const users = JSON.parse(data) as JsonUser[]

			return {
				code: 200,
				data: users,
				message: 'success',
			}
		} catch (error) {
			this.logger.error(`Failed to read user.json: ${error.message}`, error.stack)
			throw new HttpException(
				{
					code: HttpStatus.INTERNAL_SERVER_ERROR,
					message: 'Failed to read user data',
					data: null,
				},
				HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	@Get('profile')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '获取当前用户信息' })
	@ApiResponse({
		status: 200,
		description: '获取成功',
		schema: {
			properties: {
				code: { type: 'number', example: 200 },
				data: {
					type: 'object',
					properties: {
						id: { type: 'number' },
						username: { type: 'string' },
						avatar: { type: 'string' },
						createdAt: { type: 'string', format: 'date-time' },
						updatedAt: { type: 'string', format: 'date-time' },
					},
				},
				message: { type: 'string', example: 'success' },
			},
		},
	})
	async getProfile(@Request() req) {
		return this.usersService.findById(req.user.sub)
	}

	@Get(':id')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: '获取指定用户信息' })
	@ApiParam({ name: 'id', description: '用户ID' })
	@ApiResponse({
		status: 200,
		description: '获取成功',
		schema: {
			properties: {
				code: { type: 'number', example: 200 },
				data: {
					type: 'object',
					properties: {
						id: { type: 'number' },
						username: { type: 'string' },
						avatar: { type: 'string' },
						createdAt: { type: 'string', format: 'date-time' },
					},
				},
				message: { type: 'string', example: 'success' },
			},
		},
	})
	async getUserInfo(@Param('id') id: string) {
		return this.usersService.findById(+id, true) // true 表示排除敏感信息
	}
}
