import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { RedisService } from './redis.service'

@ApiTags('redis')
@Controller('redis')
export class RedisController {
	constructor(private readonly redisService: RedisService) {}

	@Get('test/connection')
	@ApiOperation({ summary: '测试 Redis 连接' })
	@ApiResponse({ status: 200, description: '连接测试结果' })
	async testConnection() {
		return this.redisService.testConnection()
	}

	@Get('test/set-get')
	@ApiOperation({ summary: '测试 Redis 设置和获取值' })
	@ApiResponse({ status: 200, description: '设置和获取测试结果' })
	async testSetGet() {
		return this.redisService.testSetGet()
	}
}
