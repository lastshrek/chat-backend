import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'
import { MessageStatus } from '@prisma/client'

export interface MessageStatusEvent {
	messageId: number
	status: MessageStatus
	senderId: number
}

export interface MessagesBatchStatusEvent {
	messageIds: number[]
	status: MessageStatus
	senderId: number
}

@Injectable()
export class MessagesEventsService {
	private messageStatusSubject = new Subject<MessageStatusEvent>()
	private messagesBatchStatusSubject = new Subject<MessagesBatchStatusEvent>()

	messageStatus$ = this.messageStatusSubject.asObservable()
	messagesBatchStatus$ = this.messagesBatchStatusSubject.asObservable()

	emitMessageStatus(event: MessageStatusEvent) {
		this.messageStatusSubject.next(event)
	}

	emitMessagesBatchStatus(event: MessagesBatchStatusEvent) {
		this.messagesBatchStatusSubject.next(event)
	}
}
