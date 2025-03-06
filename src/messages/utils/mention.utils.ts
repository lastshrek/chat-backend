/**
 * 解析消息内容中的@标记
 * @param content 消息内容
 * @returns 解析后的结果，包含提及的用户ID和是否@所有人
 */
export function parseMentions(content: string): { mentionedUserIds: number[]; mentionAll: boolean } {
	const mentionedUserIds: number[] = []
	let mentionAll = false

	// 匹配 @用户ID 格式
	const userMentionRegex = /@\[(\d+)\]/g
	let match

	while ((match = userMentionRegex.exec(content)) !== null) {
		const userId = parseInt(match[1], 10)
		if (!isNaN(userId) && !mentionedUserIds.includes(userId)) {
			mentionedUserIds.push(userId)
		}
	}

	// 检查是否@所有人
	if (content.includes('@all') || content.includes('@所有人')) {
		mentionAll = true
	}

	return { mentionedUserIds, mentionAll }
}
