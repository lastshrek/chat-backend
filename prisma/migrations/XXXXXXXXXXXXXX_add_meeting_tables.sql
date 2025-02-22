-- CreateTable
CREATE TABLE `meetings` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `createdBy` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
    `startTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endTime` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meeting_participants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `meetingId` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `joinTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leaveTime` DATETIME(3) NULL,
    `role` ENUM('HOST', 'CO_HOST', 'ATTENDEE') NOT NULL DEFAULT 'ATTENDEE',

    UNIQUE INDEX `meeting_participants_meetingId_userId_key`(`meetingId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_participants` ADD CONSTRAINT `meeting_participants_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `meetings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_participants` ADD CONSTRAINT `meeting_participants_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE; 