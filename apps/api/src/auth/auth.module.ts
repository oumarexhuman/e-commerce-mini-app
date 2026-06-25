import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { CsrfService } from './csrf.service';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, CsrfService, SessionAuthGuard, PermissionsGuard],
  exports: [AuthService, CsrfService, SessionAuthGuard, PermissionsGuard],
})
export class AuthModule {}
