// jwt-auth.guard.ts
import { Injectable, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { KEY_PREFIX, ServiceKeyAuth } from '../../service-keys/service-key-auth.js';

/**
 * Sesión de una persona (JWT) o llave de servicio de otro sistema ("Bearer fsk_..."). La llave tiene
 * su propia lista cerrada de rutas (ServiceKeyAuth); el resto de guardias (roles) se aplica igual.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly serviceKeys: ServiceKeyAuth) {
    super();
  }

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization ?? '';
    if (auth.startsWith(`Bearer ${KEY_PREFIX}`)) return this.serviceKeys.authenticate(ctx, req, auth.slice('Bearer '.length));
    return super.canActivate(ctx);
  }
}
