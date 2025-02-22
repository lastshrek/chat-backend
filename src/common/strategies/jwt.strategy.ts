import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { LoggerService } from '../services/logger.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(private logger: LoggerService) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: process.env.JWT_SECRET,
		})
	}

	async validate(payload: any) {
		this.logger.debug(`Validating JWT payload: ${JSON.stringify(payload)}`, 'JwtStrategy')
		return { sub: payload.sub, username: payload.username }
	}
}
