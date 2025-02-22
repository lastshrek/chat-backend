import { Prisma } from '@prisma/client'

export const up = async (db: Prisma.TransactionClient) => {
	// 1. 添加 employeeId 字段，允许为空
	await db.$executeRaw`ALTER TABLE users ADD COLUMN employeeId VARCHAR(191) UNIQUE DEFAULT NULL`

	// 2. 将现有用户的 id 转换为 employeeId
	await db.$executeRaw`UPDATE users SET employeeId = CAST(id AS CHAR)`

	// 3. 添加组织相关字段
	await db.$executeRaw`ALTER TABLE users ADD COLUMN dutyName VARCHAR(191) DEFAULT NULL`
	await db.$executeRaw`ALTER TABLE users ADD COLUMN orgId VARCHAR(191) DEFAULT NULL`

	// 4. 创建组织表
	await db.$executeRaw`
    CREATE TABLE organizations (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      name VARCHAR(191) NOT NULL,
      type INTEGER NOT NULL,
      \`order\` INTEGER NOT NULL DEFAULT 0,
      parentId VARCHAR(191),
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL,
      UNIQUE INDEX organizations_id_key(id),
      INDEX organizations_parentId_idx(parentId),
      FOREIGN KEY (parentId) REFERENCES organizations(id) ON DELETE SET NULL ON UPDATE CASCADE
    )
  `
}

export const down = async (db: Prisma.TransactionClient) => {
	// 1. 删除组织表
	await db.$executeRaw`DROP TABLE IF EXISTS organizations`

	// 2. 删除用户表中的新字段
	await db.$executeRaw`ALTER TABLE users DROP COLUMN IF EXISTS orgId`
	await db.$executeRaw`ALTER TABLE users DROP COLUMN IF EXISTS dutyName`
	await db.$executeRaw`ALTER TABLE users DROP COLUMN IF EXISTS employeeId`
}
