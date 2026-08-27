import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../src/app/create-app.js';
import { connectDatabase } from '../src/database/prisma.js';

let appInstance: any = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await connectDatabase();
    if (!appInstance) {
      appInstance = createApp();
    }
    return appInstance(req, res);
  } catch (error) {
    console.error('Vercel serverless handler error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
