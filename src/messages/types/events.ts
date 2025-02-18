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
}
