import { Injectable } from '@nestjs/common';
import { AesGcmService } from './aes-gcm.service';

export interface EncryptedEmail {
  ciphertext: string;
  hash: string;
}

@Injectable()
export class EmailCryptoService {
  constructor(private readonly aes: AesGcmService) {}

  normalize(email: string): string {
    return email.trim().toLowerCase();
  }

  encrypt(email: string): EncryptedEmail {
    const normalized = this.normalize(email);
    return {
      ciphertext: this.aes.encrypt(normalized),
      hash: this.aes.hmac(normalized),
    };
  }

  decrypt(ciphertext: string): string {
    return this.aes.decrypt(ciphertext);
  }

  hash(email: string): string {
    return this.aes.hmac(this.normalize(email));
  }
}
