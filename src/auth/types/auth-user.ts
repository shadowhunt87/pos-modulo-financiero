import type { UserRole } from '../../generated/prisma/enums.js';

/** Lo que devuelve JwtStrategy.validate() y queda en request.user */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  companyId: string;
}
