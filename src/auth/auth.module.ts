import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { AttemptLimiter, TooManyAttemptsFilter } from './attempt-limiter.js';
import { TwoFactorService } from './two-factor/two-factor.service.js';
import { TwoFactorController } from './two-factor/two-factor.controller.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          // Number(): jsonwebtoken interpreta un string numérico como
          // MILISEGUNDOS ("28800" = 28 s). Tiene que ir como número (segundos).
          expiresIn: Number(config.get('JWT_EXPIRES_IN_SECONDS') ?? 28800),
        },
      }),
    }),
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [AuthService, JwtStrategy, AttemptLimiter, TwoFactorService, { provide: APP_FILTER, useClass: TooManyAttemptsFilter }],
  exports: [AuthService, PassportModule, AttemptLimiter, TwoFactorService],
})
export class AuthModule {}
