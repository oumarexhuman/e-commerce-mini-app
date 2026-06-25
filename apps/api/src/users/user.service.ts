import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailCryptoService } from '../crypto/email-crypto.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailCryptoService,
  ) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { emailHash: this.email.hash(email) },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async getAuthenticatedUser(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        permissions: { include: { permission: true } },
      },
    });

    if (!user || !user.isActive) {
      return null;
    }

    const rolePermissions = new Set<string>();
    const roleCodes: string[] = [];
    for (const ur of user.roles) {
      roleCodes.push(ur.role.code);
      for (const rp of ur.role.permissions) {
        rolePermissions.add(rp.permission.code);
      }
    }

    const denies = new Set<string>();
    for (const up of user.permissions) {
      if (up.effect === 'DENY') {
        denies.add(up.permission.code);
      } else {
        rolePermissions.add(up.permission.code);
      }
    }

    const effective = [...rolePermissions].filter((p) => !denies.has(p));

    return {
      id: user.id,
      email: this.email.decrypt(user.emailCiphertext),
      displayName: user.displayName,
      roles: roleCodes,
      permissions: effective,
    };
  }
}
