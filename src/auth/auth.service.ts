import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuditMeta } from '../common/audit.js';
import { writeAudit } from '../common/audit.js';
import { AuditAction } from '../generated/prisma/enums.js';
import { TwoFactorService } from './two-factor/two-factor.service.js';
import type { AuthUser } from './types/auth-user.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { AttemptLimiter, TooManyAttemptsException, loginPairKey, loginRules } from './attempt-limiter.js';

const BCRYPT_ROUNDS = 10;

// Hash de mentira: si el email no existe igual corremos bcrypt.compare, así el
// login tarda lo mismo exista o no el usuario (evita enumerar emails por tiempo).
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', BCRYPT_ROUNDS);

interface UserView {
  id: string;
  email: string;
  name: string;
  role: string;
  companyId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly limiter: AttemptLimiter,
    private readonly twoFactor: TwoFactorService,
  ) {}

  /**
   * Crea un usuario dentro de la empresa del admin que lo registra.
   * `companyId` viene del JWT del admin, NUNCA del body.
   */
  async register(dto: RegisterDto, admin: AuthUser, ip: string, meta: AuditMeta) {
    const companyId = admin.companyId;
    // ANEXO-S0 3.10b (N3): crear CUALQUIER usuario pide la clave (y el código) del ADMIN: un token robado no basta
    await this.twoFactor.confirmActor(admin, dto.confirmPassword, dto.confirmCode, ip, meta);
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email: dto.email, password: hash, name: dto.name, role: dto.role ?? UserRole.ACCOUNTANT, companyId },
      });
      if (u.role === UserRole.ADMIN) await writeAudit(tx, admin, 'User', u.id, AuditAction.CREATE, { event: 'ADMIN_GRANTED', via: 'REGISTER' }, meta);
      return u;
    });

    // Solo datos públicos: sin hash y sin token (el admin no necesita el JWT
    // del usuario que acaba de crear).
    return this.toPublicUser(user);
  }

  async login(dto: LoginDto, ip: string) {
    // Antes de tocar la BD o bcrypt: un atacante bloqueado tampoco gasta CPU del servidor
    // Reserva ANTES de verificar (consume/refund): ya no se salta con peticiones simultáneas (ANEXO-S0 3.11 c)
    const rules = loginRules(dto.email, ip);
    const wait = this.limiter.consume(rules);
    if (wait > 0) throw new TooManyAttemptsException(wait);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { company: { select: { active: true } } },
    });

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.password ?? DUMMY_HASH,
    );

    // Un usuario técnico (llave de servicio) nunca entra con clave, aunque alguien se la cambie
    if (!user || !user.active || !user.company.active || !passwordMatches || user.isService) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    // Acierto: se devuelve la reserva y, como antes, se reinicia el par cuenta+IP
    this.limiter.refund(rules.map((r) => r.key));
    this.limiter.clear([loginPairKey(dto.email, ip)]);

    // Con 2FA (o rol obligado): sin token todavía; sigue en /auth/login/2fa
    const next = await this.twoFactor.afterPassword(user);
    if (next.kind === 'challenge') {
      const { kind: _k, ...rest } = next;
      return rest;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.buildAuthResponse(user);
  }

  /** Segundo paso del login (E2): código de la app o de emergencia, o la inscripción obligatoria. */
  async loginSecondStep(challengeToken: string, code: string, ip: string, meta: AuditMeta) {
    const { user, extra } = await this.twoFactor.verifyLogin(challengeToken, code, ip, meta);
    return { ...this.buildAuthResponse(user), ...extra };
  }

  /** Token nuevo releyendo el usuario (tras activar o quitar el 2FA). */
  async issueTokenFor(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.buildAuthResponse(u);
  }

  /** Token nuevo para un usuario ya autenticado (p. ej. tras cambiar su clave). */
  issueToken(user: UserView) {
    return this.buildAuthResponse(user);
  }

  private toPublicUser(user: UserView) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    };
  }

  private buildAuthResponse(user: UserView) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: this.toPublicUser(user),
    };
  }
}
