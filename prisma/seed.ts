import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
	// 创建第一个用户
	const user1 = await prisma.user.upsert({
		where: { username: 'user1' },
		update: {},
		create: {
			username: 'user1',
			password: 'password123',
			avatar: 'https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=user1',
		},
	})

	// 创建第二个用户
	const user2 = await prisma.user.upsert({
		where: { username: 'user2' },
		update: {},
		create: {
			username: 'user2',
			password: 'password123',
			avatar: 'https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=user2',
		},
	})

	// 创建一个聊天室
	const chat = await prisma.chat.create({
		data: {
			type: 'DIRECT',
			participants: {
				create: [{ userId: user1.id }, { userId: user2.id }],
			},
		},
	})

	console.log({ user1, user2, chat })
}

main()
	.catch(e => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
