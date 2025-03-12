import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'

@ApiTags('websockets')
@Controller('api/docs/websockets')
export class WebsocketDocsController {
	@Get('messages')
	@ApiOperation({ summary: '消息 WebSocket 接口文档' })
	@ApiResponse({
		status: 200,
		description: `
# 消息 WebSocket API 文档

WebSocket 接口通过 Socket.IO 提供，连接地址: \`ws://localhost:3000/messages\`

## 认证
连接时需要在请求头中提供 JWT 令牌:
\`\`\`javascript
const socket = io('ws://localhost:3000/messages', {
  extraHeaders: {
    Authorization: 'Bearer YOUR_JWT_TOKEN'
  }
});
\`\`\`

## 可用的事件

### join
加入聊天室
- **参数**: \`{ chatId: number }\`
- **返回**: \`{ success: boolean, message?: string }\`

### leave
离开聊天室
- **参数**: \`{ chatId: number }\`
- **返回**: \`{ success: boolean, message?: string }\`

### message
发送消息
- **参数**: \`{ chatId: number, content: string, type: MessageType, metadata?: object }\`
- **返回**: \`{ success: boolean, message?: Message }\`

### typing
发送正在输入状态
- **参数**: \`{ chatId: number, isTyping: boolean }\`
- **返回**: \`{ success: boolean }\`

### stopTyping
停止输入状态
- **参数**: \`{ chatId: number }\`
- **返回**: \`{ success: boolean }\`

## 监听的事件

### messageReceived
接收新消息
- **数据**: \`Message\`

### userJoined
用户加入聊天室
- **数据**: \`{ chatId: number, user: User }\`

### userLeft
用户离开聊天室
- **数据**: \`{ chatId: number, user: User }\`

### userTyping
用户正在输入
- **数据**: \`{ chatId: number, user: User, isTyping: boolean }\`

### error
错误信息
- **数据**: \`{ message: string }\`
    `,
	})
	getMessagesWebsocketDocs() {
		return {
			message: 'See the description for Messages WebSocket API documentation',
		}
	}

	@Get('meetings')
	@ApiOperation({ summary: '会议 WebSocket 接口文档' })
	@ApiResponse({
		status: 200,
		description: `
# 会议 WebSocket API 文档

WebSocket 接口通过 Socket.IO 提供，连接地址: \`ws://localhost:3000/meetings\`

## 认证
连接时需要在请求头中提供 JWT 令牌:
\`\`\`javascript
const socket = io('ws://localhost:3000/meetings', {
  extraHeaders: {
    Authorization: 'Bearer YOUR_JWT_TOKEN'
  }
});
\`\`\`

## 可用的事件

### join_meeting
加入会议
- **参数**: \`{ meetingId: string }\`
- **返回**: \`{ success: boolean, message?: string, participants?: User[] }\`

### offer
发送 WebRTC offer
- **参数**: \`{ meetingId: string, targetUserId: number, sdp: RTCSessionDescription }\`
- **返回**: \`{ success: boolean }\`

### answer
发送 WebRTC answer
- **参数**: \`{ meetingId: string, targetUserId: number, sdp: RTCSessionDescription }\`
- **返回**: \`{ success: boolean }\`

### ice_candidate
发送 ICE 候选者
- **参数**: \`{ meetingId: string, targetUserId: number, candidate: RTCIceCandidate }\`
- **返回**: \`{ success: boolean }\`

### start_screen_share
开始屏幕共享
- **参数**: \`{ meetingId: string }\`
- **返回**: \`{ success: boolean }\`

### stop_screen_share
停止屏幕共享
- **参数**: \`{ meetingId: string }\`
- **返回**: \`{ success: boolean }\`

### join-room
加入媒体房间
- **参数**: \`{ roomId: string }\`
- **返回**: \`{ routerRtpCapabilities: RTCRtpCapabilities }\`

### connect-transport
连接传输
- **参数**: \`{ transportId: string, dtlsParameters: RTCDtlsParameters }\`
- **返回**: \`{ connected: boolean }\`

### produce
生产媒体流
- **参数**: \`{ transportId: string, kind: 'audio' | 'video', rtpParameters: RTCRtpParameters }\`
- **返回**: \`{ id: string }\`

### consume
消费媒体流
- **参数**: \`{ transportId: string, producerId: string, rtpCapabilities: RTCRtpCapabilities }\`
- **返回**: \`{ id: string, kind: 'audio' | 'video', rtpParameters: RTCRtpParameters }\`

### heartbeat
心跳检测
- **参数**: \`{ timestamp: number }\`
- **返回**: \`{ timestamp: number }\`

## 监听的事件

### userJoined
用户加入会议
- **数据**: \`{ meetingId: string, user: User }\`

### userLeft
用户离开会议
- **数据**: \`{ meetingId: string, user: User }\`

### offer
接收 WebRTC offer
- **数据**: \`{ meetingId: string, fromUserId: number, sdp: RTCSessionDescription }\`

### answer
接收 WebRTC answer
- **数据**: \`{ meetingId: string, fromUserId: number, sdp: RTCSessionDescription }\`

### ice_candidate
接收 ICE 候选者
- **数据**: \`{ meetingId: string, fromUserId: number, candidate: RTCIceCandidate }\`

### screen_share_started
屏幕共享开始
- **数据**: \`{ meetingId: string, userId: number }\`

### screen_share_stopped
屏幕共享停止
- **数据**: \`{ meetingId: string, userId: number }\`

### new-producer
新的媒体生产者
- **数据**: \`{ producerId: string, producerUserId: number, kind: 'audio' | 'video' }\`

### producer-closed
媒体生产者关闭
- **数据**: \`{ producerId: string, producerUserId: number }\`

### error
错误信息
- **数据**: \`{ message: string }\`
    `,
	})
	getMeetingsWebsocketDocs() {
		return {
			message: 'See the description for Meetings WebSocket API documentation',
		}
	}

	@Get('documents')
	@ApiOperation({ summary: '文档协作 WebSocket 接口文档' })
	@ApiResponse({
		status: 200,
		description: `
# 文档协作 WebSocket API 文档

WebSocket 接口通过 Socket.IO 提供，连接地址: \`ws://localhost:3000/documents\`

## 认证
连接时需要在请求头中提供 JWT 令牌:
\`\`\`javascript
const socket = io('ws://localhost:3000/documents', {
  extraHeaders: {
    Authorization: 'Bearer YOUR_JWT_TOKEN'
  }
});
\`\`\`

## 可用的事件

### document:join
加入文档协作
- **参数**: \`{ documentId: string }\`
- **返回**: \`{ success: boolean, document?: Document, operations?: Operation[] }\`

### document:leave
离开文档协作
- **参数**: \`{ documentId: string }\`
- **返回**: \`{ success: boolean }\`

### document:operation
发送文档操作
- **参数**: \`{ documentId: string, operation: Operation }\`
- **返回**: \`{ success: boolean, operation?: Operation }\`

### document:cursor
发送光标位置
- **参数**: \`{ documentId: string, position: CursorPosition }\`
- **返回**: \`{ success: boolean }\`

### document:selection
发送选择区域
- **参数**: \`{ documentId: string, selection: SelectionRange }\`
- **返回**: \`{ success: boolean }\`

## 监听的事件

### document:joined
用户加入文档
- **数据**: \`{ documentId: string, user: User }\`

### document:left
用户离开文档
- **数据**: \`{ documentId: string, user: User }\`

### document:operation
接收文档操作
- **数据**: \`{ documentId: string, operation: Operation, userId: number }\`

### document:cursor
接收光标位置
- **数据**: \`{ documentId: string, position: CursorPosition, user: User }\`

### document:selection
接收选择区域
- **数据**: \`{ documentId: string, selection: SelectionRange, user: User }\`

### error
错误信息
- **数据**: \`{ message: string }\`
    `,
	})
	getDocumentsWebsocketDocs() {
		return {
			message: 'See the description for Documents WebSocket API documentation',
		}
	}

	@Get()
	@ApiOperation({ summary: 'WebSocket 接口概览' })
	@ApiResponse({
		status: 200,
		description: `
# WebSocket API 概览

本应用提供以下 WebSocket 接口:

1. [消息 WebSocket API](/api/docs/websockets/messages) - 用于实时聊天功能
2. [会议 WebSocket API](/api/docs/websockets/meetings) - 用于视频会议功能
3. [文档协作 WebSocket API](/api/docs/websockets/documents) - 用于实时文档协作

请点击上面的链接查看详细文档。
    `,
	})
	getWebsocketDocs() {
		return {
			message: 'See the description for WebSocket API overview',
		}
	}
}
