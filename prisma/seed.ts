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

// 生成随机中文名（三个字）
function generateChineseName(): string {
	const familyNames = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'
	const firstGivenNames = '志明国华建文军平伟东海强晓光林一永思子天玉正中荣英'
	const secondGivenNames = '华明军平安志成荣超群德民国强伟光东海峰磊刚洋'

	const familyName = familyNames[Math.floor(Math.random() * familyNames.length)]
	const firstGiven = firstGivenNames[Math.floor(Math.random() * firstGivenNames.length)]
	const secondGiven = secondGivenNames[Math.floor(Math.random() * secondGivenNames.length)]

	return `${familyName}${firstGiven}${secondGiven}`
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
	try {
		// 清理数据库
		console.log('Cleaning up existing data...')
		await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 0;`

		await prisma.$executeRaw`TRUNCATE TABLE DocumentCollaborator;`
		await prisma.$executeRaw`TRUNCATE TABLE DocumentOperation;`
		await prisma.$executeRaw`TRUNCATE TABLE Document;`
		await prisma.$executeRaw`TRUNCATE TABLE ChatParticipant;`
		await prisma.$executeRaw`TRUNCATE TABLE Message;`
		await prisma.$executeRaw`TRUNCATE TABLE Chat;`
		await prisma.$executeRaw`TRUNCATE TABLE Friend;`
		await prisma.$executeRaw`TRUNCATE TABLE FriendRequest;`
		await prisma.$executeRaw`TRUNCATE TABLE User;`
		await prisma.$executeRaw`TRUNCATE TABLE organizations;`

		await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 1;`

		console.log('Creating test data...')

		// 创建根组织
		const rootOrg = await prisma.organization.create({
			data: {
				id: 'root',
				name: '中国市政华北院',
				type: 2,
				order: 0,
			},
		})

		// 创建一些部门
		const departments = [
			{ name: '技术部', type: 1, order: 1 },
			{ name: '人力资源部', type: 1, order: 2 },
			{ name: '财务部', type: 1, order: 3 },
			{ name: '市场部', type: 1, order: 4 },
			{ name: '研发部', type: 1, order: 5 },
		]

		const createdDepts = await Promise.all(
			departments.map(dept =>
				prisma.organization.create({
					data: {
						id: crypto.randomUUID(),
						...dept,
						parentId: rootOrg.id,
					},
				})
			)
		)

		console.log('Creating 200 test users...')
		const hashedPassword = await bcrypt.hash('123456', 10)
		const usedUsernames = new Set<string>()
		const users = []

		// 创建200个测试用户
		for (let i = 0; i < 200; i++) {
			let username = generateChineseName()
			while (usedUsernames.has(username)) {
				username = generateChineseName()
			}
			usedUsernames.add(username)

			// 随机分配到一个部门
			const randomDept = createdDepts[Math.floor(Math.random() * createdDepts.length)]

			users.push({
				username,
				password: hashedPassword,
				employeeId: `EMP${String(i + 1).padStart(6, '0')}`,
				orgId: randomDept.id,
				dutyName: ['工程师', '主管', '经理', '专员', '助理'][Math.floor(Math.random() * 5)],
			})
		}

		// 批量创建用户
		const createdUsers = await prisma.user.createMany({
			data: users,
			skipDuplicates: true,
		})

		console.log(`Successfully created ${createdUsers.count} users`)

		// 创建一些好友关系
		console.log('Creating friend relationships...')
		const allUsers = await prisma.user.findMany({ select: { id: true } })

		// 为每个用户随机添加2-5个好友
		for (const user of allUsers) {
			const otherUsers = allUsers.filter(u => u.id !== user.id)
			const friendCount = Math.floor(Math.random() * 4) + 2 // 2-5个好友
			const friends = otherUsers.sort(() => Math.random() - 0.5).slice(0, friendCount)

			await Promise.all(
				friends.map(friend =>
					prisma.friend.create({
						data: {
							userId: user.id,
							friendId: friend.id,
						},
					})
				)
			)
		}

		console.log('Seeding completed successfully')
	} catch (error) {
		console.error('Error during seeding:', error)
		throw error
	} finally {
		await prisma.$disconnect()
	}
}

main()
	.catch(e => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
