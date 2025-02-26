export enum WebSocketEvent {
	// 好友相关
	FRIEND_REQUEST = 'friend_request',
	FRIEND_REQUEST_ACCEPTED = 'friend_request_accepted',
	FRIEND_REQUEST_REJECTED = 'friend_request_rejected',
	FRIEND_ONLINE = 'friend_online',
	FRIEND_OFFLINE = 'friend_offline',

	// 消息相关
	NEW_MESSAGE = 'new_message',
	MESSAGE_READ = 'message_read',

	// 状态相关
	TYPING = 'typing',
	STOP_TYPING = 'stop_typing',

	// 群聊相关事件
	GROUP_CHAT_INVITATION = 'groupChatInvitation',
	GROUP_CHAT_UPDATED = 'groupChatUpdated',
	GROUP_MEMBERS_ADDED = 'groupMembersAdded',
	GROUP_MEMBER_REMOVED = 'groupMemberRemoved',
	GROUP_MEMBER_ROLE_UPDATED = 'groupMemberRoleUpdated',
	GROUP_CHAT_DISSOLVED = 'groupChatDissolved',
}
