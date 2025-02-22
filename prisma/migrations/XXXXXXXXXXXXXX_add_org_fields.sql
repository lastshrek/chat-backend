-- CreateTable
CREATE TABLE `organizations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` INTEGER NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `parentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `organizations_id_key`(`id`),
    INDEX `organizations_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `User` 
ADD COLUMN `employeeId` VARCHAR(191) NULL,
ADD COLUMN `dutyName` VARCHAR(191) NULL,
ADD COLUMN `orgId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddUniqueConstraint
ALTER TABLE `User` ADD UNIQUE INDEX `User_employeeId_key`(`employeeId`); 