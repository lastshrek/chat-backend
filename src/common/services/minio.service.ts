import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as Minio from 'minio'
import * as sharp from 'sharp' // 需要先安装: npm install sharp

@Injectable()
export class MinioService {
	private minioClient: Minio.Client
	private readonly logger = new Logger(MinioService.name)
	private readonly bucketName: string

	constructor(private configService: ConfigService) {
		// 从环境变量获取配置
		this.minioClient = new Minio.Client({
			endPoint: configService.get('MINIO_ENDPOINT'),
			port: parseInt(configService.get('MINIO_PORT')),
			useSSL: configService.get('MINIO_USE_SSL') === 'true',
			accessKey: configService.get('MINIO_ACCESS_KEY'),
			secretKey: configService.get('MINIO_SECRET_KEY'),
		})

		this.bucketName = configService.get('MINIO_BUCKET_NAME')
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
			this.logger.error(`Error initializing bucket: ${error.message}`)
		}
	}

	async uploadFile(
		file: Buffer,
		type: 'voice' | 'image' | 'video',
		metadata: Record<string, string> = {}
	): Promise<{ url: string; thumbnail?: string; width?: number; height?: number }> {
		try {
			const extension = this.getExtension(type)
			const fileName = `${type}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`

			if (type === 'image') {
				// 处理图片和生成缩略图
				const image = sharp(file)
				const metadata = await image.metadata()

				// 生成缩略图
				const thumbnailBuffer = await image
					.resize(300, 300, {
						fit: 'inside',
						withoutEnlargement: true,
					})
					.jpeg({ quality: 80 })
					.toBuffer()

				// 上传原图
				await this.minioClient.putObject(this.bucketName, fileName, file, {
					'Content-Type': this.getMimeType(type),
					...metadata,
				})

				// 上传缩略图
				const thumbnailFileName = `thumbnails/${fileName}`
				await this.minioClient.putObject(this.bucketName, thumbnailFileName, thumbnailBuffer, {
					'Content-Type': 'image/jpeg',
					'X-Amz-Meta-Original-Image': fileName,
				})

				// 生成 URL
				const url = await this.minioClient.presignedGetObject(this.bucketName, fileName, 24 * 60 * 60)

				const thumbnailUrl = await this.minioClient.presignedGetObject(this.bucketName, thumbnailFileName, 24 * 60 * 60)

				return {
					url,
					thumbnail: thumbnailUrl,
					width: metadata.width,
					height: metadata.height,
				}
			} else {
				// 处理其他类型文件
				await this.minioClient.putObject(this.bucketName, fileName, file, {
					'Content-Type': this.getMimeType(type),
					...metadata,
				})

				const url = await this.minioClient.presignedGetObject(this.bucketName, fileName, 24 * 60 * 60)

				return { url }
			}
		} catch (error) {
			this.logger.error(`File upload failed: ${error.message}`)
			throw new Error('File upload failed')
		}
	}

	private getExtension(type: string): string {
		switch (type) {
			case 'voice':
				return 'mp3'
			case 'image':
				return 'jpg'
			case 'video':
				return 'mp4'
			default:
				return 'bin'
		}
	}

	private getMimeType(type: string): string {
		switch (type) {
			case 'voice':
				return 'audio/mpeg'
			case 'image':
				return 'image/jpeg'
			case 'video':
				return 'video/mp4'
			default:
				return 'application/octet-stream'
		}
	}
}
