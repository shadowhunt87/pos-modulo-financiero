// jwt-auth.guard.ts
import { ForbiddenException, Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { KEY_PREFIX, ServiceKeyAuth } from '../../service-keys/service-key-auth.js';
import { CASHIER_ALLOWED_KEY, STORE_ONLY_ROLES } from '../decorators/cashier-allowed.decorator.js';

/**
 * Sesión de una persona (JWT) o llave de servicio de otro sistema ("Bearer fsk_..."). La llave tiene
 * su propia lista cerrada de rutas (ServiceKeyAuth); el resto de guardias (roles) se aplica igual.
 * D-POS1: los roles de tienda (cajero, vendedor y almacén) solo pasan en las rutas marcadas con @CashierAllowed().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly serviceKeys: ServiceKeyAuth, private readonly reflector: Reflector) {
    super();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization ?? '';
    if (auth.startsWith(`Bearer ${KEY_PREFIX}`)) return this.serviceKeys.authenticate(ctx, req, auth.slice('Bearer '.length));
    const ok = await (super.canActivate(ctx) as Promise<boolean>);
    if (!ok) return false;
    const role = (req as Request & { user?: { role?: string } }).user?.role;
    if (role && STORE_ONLY_ROLES.includes(role) && !this.reflector.getAllAndOverride<boolean>(CASHIER_ALLOWED_KEY, [ctx.getHandler(), ctx.getClass()])) {
      throw new ForbiddenException('Tu usuario es de tienda: solo puede usar el punto de venta');
    }
    return true;
  }
}
