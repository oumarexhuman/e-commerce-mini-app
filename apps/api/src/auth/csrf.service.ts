import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { doubleCsrf } from 'csrf-csrf';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

@Injectable()
export class CsrfService {
  readonly middleware: RequestHandler;
  private readonly generator: (req: Request, res: Response, overwrite?: boolean) => string;

  constructor(config: ConfigService) {
    const secret = config.getOrThrow<string>('CSRF_SECRET');
    const cookieName = config.getOrThrow<string>('CSRF_COOKIE_NAME');
    const secure = config.getOrThrow<boolean>('SESSION_COOKIE_SECURE');

    const { doubleCsrfProtection, generateToken } = doubleCsrf({
      getSecret: () => secret,
      cookieName,
      cookieOptions: {
        httpOnly: false,
        sameSite: 'lax',
        secure,
        path: '/',
      },
      size: 64,
      ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
      getTokenFromRequest: (req) => req.headers['x-csrf-token'],
    });

    this.generator = generateToken;
    this.middleware = (req: Request, res: Response, next: NextFunction) => {
      doubleCsrfProtection(req, res, next);
    };
  }

  generate(req: Request, res: Response): string {
    return this.generator(req, res, true);
  }
}
