process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.CSRF_SECRET = 'a-test-csrf-secret-of-sufficient-length-please';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.REDIS_URL = 'redis://localhost:6379';
