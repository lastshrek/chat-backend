import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as Minio from 'minio'
import * as sharp from 'sharp' // 需要先安装: npm install sharp

@Injectable()
export class MinioService {
	private readonly minioClient: Minio.Client
	private readonly logger = new Logger(MinioService.name)
	private readonly bucketName = 'chat-files'

	constructor(private configService: ConfigService) {
		this.minioClient = new Minio.Client({
			endPoint: 'localhost',
			port: 9000,
			useSSL: false,
			accessKey: 'minioadmin',
			secretKey: 'minioadmin',
		})

		this.initBucket()
	}

	private async initBucket() {
		try {
			const exists = await this.minioClient.bucketExists(this.bucketName)
			if (!exists) {
				await this.minioClient.makeBucket(this.bucketName)
				this.logger.log(`Bucket ${this.bucketName} created successfully`)
			}
		} catch (error) {
			this.logger.error(`Error initializing bucket: ${error.message}`, error.stack)
		}
	}

	async uploadFile(
		file: Buffer,
		type: 'audio' | 'image' | 'video' | 'file',
		metadata: Record<string, string> = {}
	): Promise<{ url: string; thumbnail?: string; width?: number; height?: number }> {
		try {
			if (type === 'image') {
				const image = sharp(file)
				const imageMetadata = await image.metadata()

				const fileName = `images/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
				const thumbnailFileName = `thumbnails/images/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`

				const thumbnailBuffer = await image
					.resize(300, 300, {
						fit: 'inside',
						withoutEnlargement: true,
					})
					.jpeg({ quality: 80 })
					.toBuffer()

				await this.minioClient.putObject(this.bucketName, fileName, file, file.length, { 'Content-Type': 'image/jpeg' })

				await this.minioClient.putObject(this.bucketName, thumbnailFileName, thumbnailBuffer, thumbnailBuffer.length, {
					'Content-Type': 'image/jpeg',
				})

				const url = await this.minioClient.presignedGetObject(this.bucketName, fileName, 24 * 60 * 60)
				const thumbnailUrl = await this.minioClient.presignedGetObject(this.bucketName, thumbnailFileName, 24 * 60 * 60)

				return {
					url,
					thumbnail: thumbnailUrl,
					width: imageMetadata.width,
					height: imageMetadata.height,
				}
			} else if (type === 'file') {
				const originalName = metadata['original-name'] || 'unknown.bin'
				const mimeType = metadata['content-type'] || 'application/octet-stream'
				const fileName = `files/${Date.now()}-${Math.random().toString(36).substring(7)}-${originalName}`

				await this.minioClient.putObject(this.bucketName, fileName, file, file.length, { 'Content-Type': mimeType })

				const url = await this.minioClient.presignedGetObject(this.bucketName, fileName, 24 * 60 * 60)
				return { url }
			} else {
				const extension = this.getExtension(type)
				const fileName = `${type}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`

				await this.minioClient.putObject(this.bucketName, fileName, file, file.length, {
					'Content-Type': this.getMimeType(type),
				})

				const url = await this.minioClient.presignedGetObject(this.bucketName, fileName, 24 * 60 * 60)
				return { url }
			}
		} catch (error) {
			this.logger.error(`File upload failed: ${error.message}`, error.stack)
			throw new Error(`File upload failed: ${error.message}`)
		}
	}

	private getExtension(type: string): string {
		switch (type) {
			case 'audio':
				return 'mp3'
			case 'image':
				return 'jpg'
			case 'video':
				return 'mp4'
			case 'file':
				return 'bin'
			default:
				return 'bin'
		}
	}

	private getMimeType(type: string): string {
		switch (type) {
			case 'audio':
				return 'audio/mpeg'
			case 'image':
				return 'image/jpeg'
			case 'video':
				return 'video/mp4'
			case 'file':
				return 'application/octet-stream'
			default:
				return 'application/octet-stream'
		}
	}
}
