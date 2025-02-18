import { Injectable } from '@nestjs/common'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Redis } from 'ioredis'

@Injectable()
export class RedisService {
	private readonly TOKEN_EXPIRE_DAYS = 30 // 定义过期天数常量

	constructor(@InjectRedis() private readonly redis: Redis) {}

	async set(key: string, value: string, ttl?: number): Promise<void> {
		if (ttl) {
			await this.redis.set(key, value, 'EX', ttl)
		} else {
			await this.redis.set(key, value)
		}
	}

	async get(key: string): Promise<string | null> {
		return this.redis.get(key)
	}

	async del(key: string): Promise<void> {
		await this.redis.del(key)
	}

	async setToken(userId: number, token: string): Promise<void> {
		const key = `user:token:${userId}`
		// 设置 token，30天过期
		await this.set(key, token, this.TOKEN_EXPIRE_DAYS * 24 * 60 * 60)
	}

	async getToken(userId: number): Promise<string | null> {
		const key = `user:token:${userId}`
		return this.get(key)
	}

	async removeToken(userId: number): Promise<void> {
		const key = `user:token:${userId}`
		await this.del(key)
	}

	async testConnection(): Promise<{ status: string; info: any }> {
		try {
			// 测试 ping
			const pingResult = await this.redis.ping()

			// 获取 Redis 信息
			const info = await this.redis.info()

			return {
				status: pingResult === 'PONG' ? 'connected' : 'error',
				info: info,
			}
		} catch (error) {
			return {
				status: 'error',
				info: error.message,
			}
		}
	}

	// 测试设置和获取值
	async testSetGet(): Promise<{ status: string; result: any }> {
		try {
			const testKey = 'test:key'
			const testValue = 'Hello Redis! ' + new Date().toISOString()

			// 设置值
			await this.set(testKey, testValue)

			// 获取值
			const retrievedValue = await this.get(testKey)

			return {
				status: 'success',
				result: {
					set: testValue,
					get: retrievedValue,
					match: testValue === retrievedValue,
				},
			}
		} catch (error) {
			return {
				status: 'error',
				result: error.message,
			}
		}
	}
}
