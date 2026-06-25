import { ConfigService } from '@nestjs/config';
import { AesGcmService } from '../src/crypto/aes-gcm.service';
import { EmailCryptoService } from '../src/crypto/email-crypto.service';

function configFor(key: string): ConfigService {
  return { getOrThrow: <T>(_k: string) => key as unknown as T } as ConfigService;
}

const VALID_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('AesGcmService', () => {
  const aes = new AesGcmService(configFor(VALID_KEY));

  it('round-trips plaintext through encrypt then decrypt', () => {
    const plaintext = 'sensitive@example.com';
    const ciphertext = aes.encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(aes.decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces a different ciphertext for the same plaintext (random IV)', () => {
    const a = aes.encrypt('hello');
    const b = aes.encrypt('hello');
    expect(a).not.toBe(b);
    expect(aes.decrypt(a)).toBe('hello');
    expect(aes.decrypt(b)).toBe('hello');
  });

  it('rejects keys that are not exactly 32 bytes of hex', () => {
    expect(() => new AesGcmService(configFor('tooshort'))).toThrow(/ENCRYPTION_KEY/);
  });

  it('emits a deterministic HMAC for the same input', () => {
    expect(aes.hmac('foo')).toBe(aes.hmac('foo'));
    expect(aes.hmac('foo')).not.toBe(aes.hmac('bar'));
  });
});

describe('EmailCryptoService', () => {
  const aes = new AesGcmService(configFor(VALID_KEY));
  const svc = new EmailCryptoService(aes);

  it('normalises before hashing so case and surrounding whitespace do not matter', () => {
    expect(svc.hash('  Foo@Example.com ')).toBe(svc.hash('foo@example.com'));
  });

  it('encrypt returns ciphertext that decrypts back to the normalised plaintext', () => {
    const { ciphertext } = svc.encrypt('Foo@Example.COM');
    expect(svc.decrypt(ciphertext)).toBe('foo@example.com');
  });
});
