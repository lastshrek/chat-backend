/*
  Warnings:

  - You are about to drop the column `name` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `Friend` DROP FOREIGN KEY `Friend_friendId_fkey`;

-- DropForeignKey
ALTER TABLE `Friend` DROP FOREIGN KEY `Friend_userId_fkey`;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `name`;

-- AddForeignKey
ALTER TABLE `Friend` ADD CONSTRAINT `Friend_user_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Friend` ADD CONSTRAINT `Friend_friend_fkey` FOREIGN KEY (`friendId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
