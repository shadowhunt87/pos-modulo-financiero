import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
  ) {}

  /**
   * Crea un usuario dentro de la empresa del admin que lo registra.
   * `companyId` viene del JWT del admin, NUNCA del body.
   */
  async register(dto: RegisterDto, companyId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        name: dto.name,
        role: dto.role ?? UserRole.ACCOUNTANT,
        companyId,
      },
    });

    // Solo datos públicos: sin hash y sin token (el admin no necesita el JWT
    // del usuario que acaba de crear).
    return this.toPublicUser(user);
  }

  async login(dto: LoginDto, ip: string) {
    // Antes de tocar la BD o bcrypt: un atacante bloqueado tampoco gasta CPU del servidor
    const rules = loginRules(dto.email, ip);
    const wait = this.limiter.check(rules);
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
      this.limiter.recordFailure(rules);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    this.limiter.clear([loginPairKey(dto.email, ip)]);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.buildAuthResponse(user);
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
