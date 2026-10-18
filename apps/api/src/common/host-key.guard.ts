import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@slotbook/shared';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { APP_CONFIG, AppConfig } from '../config';
import { AppException } from './app-exception';

/** Protects host routes with the shared key in X-Host-Key (A3), compared in constant time (NFR-4). */
@Injectable()
export class HostKeyGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.expected = digest(config.hostAccessKey);
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().header('x-host-key');
    // Hashing both sides gives equal-length buffers, so the comparison never leaks the key's length.
    if (header && timingSafeEqual(digest(header), this.expected)) return true;
    throw new AppException(401, ErrorCode.UNAUTHORIZED, 'A valid host key is required');
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
