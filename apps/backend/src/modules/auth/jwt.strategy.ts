import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'dev',
    });
  }

  async validate(payload: {
    sub: string;
    role: string;
    email: string;
    organizationId?: string;
  }) {
    return {
      userId: payload.sub,
      role: payload.role,
      email: payload.email,
      organizationId: payload.organizationId,
    };
  }
}
