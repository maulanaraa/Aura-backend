import { createApp } from '../dist/app/create-app.js';
import { connectDatabase } from '../dist/database/prisma.js';

let appInstance = null;

export default async function handler(req, res) {
  try {
    await connectDatabase();
    if (!appInstance) {
      appInstance = createApp();
    }
    return appInstance(req, res);
  } catch (error) {
    console.error('Vercel serverless handler error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
