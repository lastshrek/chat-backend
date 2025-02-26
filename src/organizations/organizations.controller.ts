import { Controller, Get, Post, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger'
import { OrganizationsService } from './organizations.service'
import { Public } from '../common/decorators/public.decorator'

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
	constructor(private readonly organizationsService: OrganizationsService) {}

	@Get('structure')
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
										employeeId: { type: 'string' },
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
	async getStructure() {
		const data = await this.organizationsService.getOrganizationStructure()
		return data
	}

	@Get(':id/users')
	@ApiOperation({ summary: '获取部门用户列表' })
	@ApiParam({ name: 'id', description: '部门ID' })
	@ApiResponse({
		status: 200,
		description: '成功获取部门用户列表',
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
							dutyName: { type: 'string' },
							employeeId: { type: 'string' },
						},
					},
				},
				message: { type: 'string', example: 'success' },
			},
		},
	})
	async getDepartmentUsers(@Param('id') id: string) {
		const data = await this.organizationsService.getDepartmentUsers(id)
		return data
	}

	@Public()
	@Post('import')
	async importOrganizations() {
		const result = await this.organizationsService.importOrganizations()
		return {
			success: true,
			data: result,
		}
	}
}
