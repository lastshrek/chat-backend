import { Module, forwardRef } from '@nestjs/common'
import { DocumentsService } from './documents.service'
import { DocumentsGateway } from './documents.gateway'
import { DocumentsController } from './documents.controller'
import { CommonModule } from '../common/common.module'

@Module({
	imports: [CommonModule],
	providers: [DocumentsService, DocumentsGateway],
	controllers: [DocumentsController],
	exports: [DocumentsService, DocumentsGateway],
})
export class DocumentsModule {}
