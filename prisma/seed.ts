import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient({
	log: ['query', 'error', 'warn'],
})

interface OrgInfo {
	id: string
	name: string
	type: number
	order: number
	path: Array<{
		id: string
		name: string
		type: number
	}>
}

interface UserData {
	id: string
	name: string
	deptId: string
	dutyName: string
	companyId: string
	orgsInfo: OrgInfo[]
}

// 生成指定长度的随机ID
function generateId(length: number): string {
	const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
	const bytes = crypto.randomBytes(length)
	let result = ''
	for (let i = 0; i < length; i++) {
		result += chars[bytes[i] % chars.length]
	}
	return result
}

// 生成员工号
function generateEmployeeId(): string {
	const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
	const bytes = crypto.randomBytes(8)
	let result = ''
	for (let i = 0; i < 8; i++) {
		result += chars[bytes[i] % chars.length]
	}
	return result
}

// ID 映射表
const idMap = new Map<string, string>()

function generateShortId(originalId: string): string {
	if (idMap.has(originalId)) {
		return idMap.get(originalId)!
	}
	const newId = generateId(10)
	idMap.set(originalId, newId)
	return newId
}

// 生成随机中文名
function generateChineseName(): string {
	const familyNames = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨'
	const givenNames = '明国华建文军平志伟东海强晓生光林'

	const familyName = familyNames[Math.floor(Math.random() * familyNames.length)]
	const givenName = givenNames[Math.floor(Math.random() * givenNames.length)]

	return `${familyName}${givenName}`
}

// 用于记录已使用的用户名
const usedUsernames = new Set<string>()

// 生成唯一的用户名
function generateUniqueUsername(): string {
	let username = generateChineseName()
	while (usedUsernames.has(username)) {
		username = generateChineseName()
	}
	usedUsernames.add(username)
	return username
}

async function main() {
	// 首先清理现有数据
	await prisma.user.deleteMany({})
	await prisma.organization.deleteMany({})

	// 收集所有组织信息
	const orgsMap = new Map<string, OrgInfo>()

	// 读取 user.json
	const userJsonPath = path.join(process.cwd(), 'user.json')
	const userData: UserData[] = JSON.parse(fs.readFileSync(userJsonPath, 'utf-8'))

	console.log('用户总数:', userData.length)

	// 收集所有组织信息
	userData.forEach(user => {
		user.orgsInfo.forEach(org => {
			if (!orgsMap.has(org.id)) {
				orgsMap.set(org.id, org)
			}
		})
	})

	console.log('组织总数:', orgsMap.size)

	// 先创建根组织
	await prisma.organization.create({
		data: {
			id: 'root',
			name: '中国市政华北院',
			type: 2,
			order: 0,
		},
	})

	console.log('根组织创建完成')

	// 按层级创建组织
	const createOrganizationsByLevel = async (level: number) => {
		const orgsAtLevel = Array.from(orgsMap.values()).filter(org => org.path.length === level)

		for (const org of orgsAtLevel) {
			// 跳过根组织
			if (org.id === 'root') continue

			// 获取父组织ID：path数组中的倒数第二个元素
			const parentId = org.path[org.path.length - 2]?.id || 'root'

			console.log(`创建组织: ${org.name}, ID: ${org.id}, 父组织ID: ${parentId}, 层级: ${level}`)

			await prisma.organization.create({
				data: {
					id: org.id,
					name: org.name,
					type: org.type,
					order: org.order,
					parentId,
				},
			})
		}

		// 检查是否还有下一层级的组织
		const nextLevel = level + 1
		if (Array.from(orgsMap.values()).some(org => org.path.length === nextLevel)) {
			await createOrganizationsByLevel(nextLevel)
		}
	}

	// 从第二层开始创建组织（第一层是root）
	await createOrganizationsByLevel(2)

	// 验证创建的组织
	const orgs = await prisma.organization.findMany()
	console.log('已创建的组织总数:', orgs.length)
	console.log(
		'组织列表:',
		orgs.map(org => ({
			id: org.id,
			name: org.name,
			parentId: org.parentId,
			level: org.parentId === 'root' ? 1 : 2, // 简单显示层级
		}))
	)

	// 然后创建用户并关联到组织
	console.log('开始创建用户...')
	const hashedPassword = await bcrypt.hash('Hby@1952', 10)
	const usedUsernames = new Set<string>()
	let userId = 1
	const createdUsers = []
	const batchSize = 5 // 减小批量大小到5
	const maxRetries = 3 // 添加重试机制

	async function createBatchWithRetry(batchData: any[], retryCount = 0) {
		try {
			// 确保连接是活跃的
			await prisma.$connect()

			const result = await prisma.user.createMany({
				data: batchData,
				skipDuplicates: true,
			})

			return result
		} catch (error) {
			console.error(`批次创建失败，重试次数: ${retryCount}`, error)

			if (retryCount < maxRetries) {
				// 等待后重试
				await new Promise(resolve => setTimeout(resolve, 5000))
				await prisma.$disconnect()
				return createBatchWithRetry(batchData, retryCount + 1)
			}
			throw error
		}
	}

	// 分批处理用户数据
	for (let i = 0; i < userData.length; i += batchSize) {
		const batch = userData.slice(i, i + batchSize)
		console.log(`处理第 ${i + 1} 到 ${Math.min(i + batchSize, userData.length)} 个用户`)

		try {
			// 准备批量数据
			const batchData = batch.map(user => {
				let username = generateChineseName()
				while (usedUsernames.has(username)) {
					username = generateChineseName()
				}
				usedUsernames.add(username)

				return {
					id: userId++,
					username,
					password: hashedPassword,
					employeeId: user.id,
					orgId: user.deptId,
					dutyName: user.dutyName || '-',
				}
			})

			// 使用重试机制创建用户
			const result = await createBatchWithRetry(batchData)
			createdUsers.push(...batchData)
			console.log(`成功创建 ${result.count} 个用户`)
			console.log(`已完成 ${createdUsers.length}/${userData.length} 个用户`)
		} catch (error) {
			console.error(`批次处理最终失败 (${i + 1} - ${i + batchSize}):`, error)
			// 记录失败的用户数据
			fs.appendFileSync('failed_users.json', JSON.stringify(batch, null, 2) + '\n')
		}

		// 批次间暂停
		if (i + batchSize < userData.length) {
			console.log('暂停5秒...')
			await new Promise(resolve => setTimeout(resolve, 5000))
		}
	}

	console.log('用户创建完成')
	console.log('最终创建的用户总数:', createdUsers.length)
	console.log('预期用户总数:', userData.length)

	if (createdUsers.length !== userData.length) {
		console.log('警告: 创建的用户数量与预期不符!')
	}

	// 保存 ID 映射关系
	fs.writeFileSync(path.join(__dirname, 'id_mapping.json'), JSON.stringify(Object.fromEntries(idMap), null, 2))

	console.log('数据初始化完成')
}

main()
	.catch(e => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
