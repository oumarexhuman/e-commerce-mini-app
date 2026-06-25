import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const Permissions = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);
