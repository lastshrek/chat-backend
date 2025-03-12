import { Module } from '@nestjs/common'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { MinioService } from '../common/services/minio.service'

@Module({
	controllers: [ProjectsController],
	providers: [ProjectsService, MinioService],
	exports: [ProjectsService],
})
export class ProjectsModule {}
