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
		// 读取 user.json
		const filePath = path.join(process.cwd(), 'user.json')
		const data = await fs.promises.readFile(filePath, 'utf8')
		const users = JSON.parse(data) as JsonUser[]

		// 收集所有组织信息
		const orgMap = new Map<string, any>()

		users.forEach(user => {
			user.orgsInfo.forEach(org => {
				org.path.forEach(pathItem => {
					if (!orgMap.has(pathItem.id)) {
						orgMap.set(pathItem.id, {
							id: pathItem.id,
							name: pathItem.name,
							type: pathItem.type,
							order: pathItem.type === 2 ? 0 : org.order,
							parentId: null, // 稍后设置
						})
					}
				})

				// 设置父子关系
				for (let i = 0; i < org.path.length - 1; i++) {
					const parentId = org.path[i].id
					const childId = org.path[i + 1].id
					const child = orgMap.get(childId)
					if (child) {
						child.parentId = parentId
					}
				}
			})
		})

		try {
			await this.prisma.$transaction(async tx => {
				// 1. 清空现有组织数据
				await tx.organization.deleteMany()

				// 2. 检查组织ID是否唯一
				const orgIds = Array.from(orgMap.keys())
				const uniqueOrgIds = new Set(orgIds)
				if (orgIds.length !== uniqueOrgIds.size) {
					throw new Error('Duplicate organization IDs found')
				}

				// 3. 创建组织
				await tx.organization.createMany({
					data: Array.from(orgMap.values()),
				})

				// 4. 获取所有需要更新的用户
				const usernames = users.map(user => user.name)
				const dbUsers = await tx.user.findMany({
					where: {
						username: {
							in: usernames,
						},
					},
					select: {
						id: true,
						username: true,
					},
				})

				// 创建用户名到数据库ID的映射
				const usernameToDbId = new Map(dbUsers.map(user => [user.username, user.id]))

				// 5. 批量更新用户信息
				const updates = users
					.filter(user => usernameToDbId.has(user.name))
					.map(user => {
						const directOrg = user.orgsInfo[0]?.path.slice(-1)[0]
						return tx.user.update({
							where: { id: usernameToDbId.get(user.name) },
							data: {
								orgId: directOrg?.id,
								dutyName: user.dutyName,
								employeeId: user.id,
							},
						})
					})

				// 记录未找到的用户
				const notFoundUsers = users.filter(user => !usernameToDbId.has(user.name)).map(user => user.name)

				if (notFoundUsers.length > 0) {
					this.logger.warn(`Users not found: ${notFoundUsers.join(', ')}`)
				}

				// 执行所有更新
				await Promise.all(updates)
			})

			return { message: 'Organizations imported successfully' }
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
