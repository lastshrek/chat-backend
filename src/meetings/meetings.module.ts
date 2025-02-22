import { Module } from '@nestjs/common'
import { MeetingsController } from './meetings.controller'
import { MeetingsService } from './meetings.service'
import { MeetingsGateway } from './meetings.gateway'
import { MediasoupService } from './mediasoup.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
	controllers: [MeetingsController],
	providers: [MeetingsService, MeetingsGateway, MediasoupService],
	exports: [MeetingsService],
	imports: [PrismaModule],
})
export class MeetingsModule {}
