import { SetMetadata } from '@nestjs/common'

export const PUBLIC_ROUTE = 'PUBLIC_ROUTE'
export const Public = () => SetMetadata(PUBLIC_ROUTE, true)
