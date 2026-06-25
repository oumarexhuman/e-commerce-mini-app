import { Global, Module } from '@nestjs/common';
import { AesGcmService } from './aes-gcm.service';
import { EmailCryptoService } from './email-crypto.service';

@Global()
@Module({
  providers: [AesGcmService, EmailCryptoService],
  exports: [AesGcmService, EmailCryptoService],
})
export class CryptoModule {}
