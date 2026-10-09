import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../types/auth-user.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // getOrThrow: falla al arrancar si no hay secret (nunca queda undefined)
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      // Fijar el algoritmo evita ataques de "algorithm confusion"
      algorithms: ['HS256'],
    });
  }

  async validate(payload: { sub: string }): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { company: { select: { active: true } } },
    });

    // Si desactivan al usuario o a su empresa, el token deja de servir al instante
    if (!user || !user.active || !user.company.active) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };
  }
}
