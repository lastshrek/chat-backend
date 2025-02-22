import { Injectable } from '@nestjs/common'
import * as mediasoup from 'mediasoup'
import { Worker, Router, WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types'

@Injectable()
export class MediasoupService {
	private worker: Worker
	private router: Router
	private readonly rooms = new Map<string, Router>()

	async onModuleInit() {
		// 创建 mediasoup worker
		this.worker = await mediasoup.createWorker({
			logLevel: 'warn',
			rtcMinPort: 40000,
			rtcMaxPort: 49999,
		})

		// 创建 router
		this.router = await this.worker.createRouter({
			mediaCodecs: [
				{
					kind: 'audio',
					mimeType: 'audio/opus',
					clockRate: 48000,
					channels: 2,
				},
				{
					kind: 'video',
					mimeType: 'video/VP8',
					clockRate: 90000,
					parameters: {
						'x-google-start-bitrate': 1000,
					},
				},
			],
		})
	}

	async createRoom(roomId: string) {
		if (!this.rooms.has(roomId)) {
			const router = await this.worker.createRouter({
				mediaCodecs: [
					{
						kind: 'audio',
						mimeType: 'audio/opus',
						clockRate: 48000,
						channels: 2,
					},
					{
						kind: 'video',
						mimeType: 'video/VP8',
						clockRate: 90000,
						parameters: {
							'x-google-start-bitrate': 1000,
						},
					},
				],
			})
			this.rooms.set(roomId, router)
		}
		return this.rooms.get(roomId)
	}

	async createWebRtcTransport(router: Router) {
		const transport = await router.createWebRtcTransport({
			listenIps: [
				{
					ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
					announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
				},
			],
			enableUdp: true,
			enableTcp: true,
			preferUdp: true,
			initialAvailableOutgoingBitrate: 1000000,
		})

		return transport
	}
}
