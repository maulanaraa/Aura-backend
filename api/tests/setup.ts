process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://aura:aura_secret@127.0.0.1:55432/auraai?schema=public';
process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-characters';
process.env.AI_SERVICE_URL = 'http://localhost:8000';
process.env.LOG_LEVEL = 'error';
