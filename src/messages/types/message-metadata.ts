/**
 * 消息元数据接口
 */
export interface MessageMetadata {
	// 文本消息
	content?: string

	// 文件消息
	fileName?: string
	fileSize?: number

	// 音频消息
	duration?: number
	url?: string

	// 图片消息
	width?: number
	height?: number
	thumbnail?: string

	// @ 功能
	mentionedUserIds?: number[]
	mentionAll?: boolean

	// 其他可能的元数据字段
	[key: string]: any
}
