import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import * as fs from 'fs'
import * as path from 'path'
import { JsonUser } from '../users/dto/json-user.dto'
import { Logger } from '@nestjs/common'

@Injectable()
export class OrganizationsService {
	constructor(private prisma: PrismaService) {}

	private readonly logger = new Logger(OrganizationsService.name)

	async importOrganizations() {
		try {
			// 读取 user.json
			const filePath = path.join(process.cwd(), 'user.json')
			const data = await fs.promises.readFile(filePath, 'utf8')
			const userData = JSON.parse(data)

			// 首先创建根组织
			await this.prisma.organization.upsert({
				where: { id: 'root' },
				update: {
					name: '中国市政华北院',
					type: 2,
					order: 0,
				},
				create: {
					id: 'root',
					name: '中国市政华北院',
					type: 2,
					order: 0,
				},
			})

			// 收集所有组织信息
			const orgsMap = new Map<string, any>()
			userData.forEach(user => {
				user.orgsInfo.forEach(org => {
					if (!orgsMap.has(org.id)) {
						orgsMap.set(org.id, org)
					}
				})
			})

			// 按层级创建组织
			const createOrganizationsByLevel = async (level: number) => {
				const orgsAtLevel = Array.from(orgsMap.values()).filter(org => org.path.length === level)

				for (const org of orgsAtLevel) {
					if (org.id === 'root') continue
					const parentId = org.path[org.path.length - 2]?.id || 'root'

					await this.prisma.organization.upsert({
						where: { id: org.id },
						update: {
							name: org.name,
							type: org.type,
							order: org.order,
							parentId,
						},
						create: {
							id: org.id,
							name: org.name,
							type: org.type,
							order: org.order,
							parentId,
						},
					})
				}

				// 检查下一层级
				const nextLevel = level + 1
				if (Array.from(orgsMap.values()).some(org => org.path.length === nextLevel)) {
					await createOrganizationsByLevel(nextLevel)
				}
			}

			// 从第二层开始创建组织
			await createOrganizationsByLevel(2)

			return await this.prisma.organization.findMany()
		} catch (error) {
			this.logger.error(`Failed to import organizations: ${error.message}`, error.stack)
			throw new Error(`Failed to import organizations: ${error.message}`)
		}
	}

	async getOrganizationStructure() {
		// 先获取所有组织并按 order 排序
		const orgs = await this.prisma.organization.findMany({
			select: {
				id: true,
				name: true,
				type: true,
				order: true,
				parentId: true,
				_count: {
					select: {
						users: true,
					},
				},
			},
			orderBy: {
				order: 'asc',
			},
		})

		const buildTree = (items: any[], parentId: string | null = null): any[] => {
			return items
				.filter(item => item.parentId === parentId)
				.map(item => ({
					id: item.id,
					name: item.name,
					type: item.type,
					order: item.order,
					userCount: item._count.users,
					totalUserCount: 0, // 初始化为0，后续计算
					children: buildTree(items, item.id),
				}))
				.sort((a, b) => {
					if (a.order !== b.order) {
						return a.order - b.order
					}
					return a.name.localeCompare(b.name, 'zh-CN')
				})
		}

		const tree = buildTree(orgs)

		const calculateTotalUsers = (node: any): number => {
			const childrenCount = node.children.reduce((sum: number, child: any) => sum + calculateTotalUsers(child), 0)

			if (node.type === 2) {
				node.userCount = childrenCount
				node.totalUserCount = childrenCount
			} else {
				node.totalUserCount = node.userCount + childrenCount
			}

			return node.totalUserCount
		}

		tree.forEach(node => calculateTotalUsers(node))

		return tree
	}

	async getDepartmentUsers(departmentId: string) {
		const users = await this.prisma.user.findMany({
			where: {
				orgId: departmentId,
			},
			select: {
				employeeId: true, // 作为返回的 id
				username: true, // 作为返回的 name
				avatar: true,
				dutyName: true,
			},
		})

		return users.map(user => ({
			id: user.employeeId,
			name: user.username,
			avatar: user.avatar,
			dutyName: user.dutyName,
		}))
	}
}
