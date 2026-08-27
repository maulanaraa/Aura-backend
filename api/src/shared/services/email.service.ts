import { logger } from '../utils/logger.js';

/**
 * Transactional email abstraction. Swap the implementation wired in
 * `app/container.ts` and nothing else in the codebase changes (same pattern
 * as IStorageService).
 */
export interface IEmailService {
  sendVerificationEmail(to: string, verifyUrl: string): Promise<void>;
}

export class ResendEmailService implements IEmailService {
  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
  ) {}

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: [to],
        subject: 'Verify your Aura account',
        html: buildVerificationEmailHtml(verifyUrl),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error('Verification email send failed via Resend', { to, status: response.status, body });
      throw new Error(`Resend API responded with ${response.status}`);
    }
  }
}

/** Dev/CI fallback when no email provider is configured — logs the link instead of emailing it. */
export class ConsoleEmailService implements IEmailService {
  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    logger.info('Verification email (no EMAIL_FUNCTION_URL configured — logging link instead)', {
      to,
      verifyUrl,
    });
  }
}

function buildVerificationEmailHtml(verifyUrl: string): string {
  return `
    <p>Halo,</p>
    <p>Klik tombol di bawah untuk memverifikasi alamat email kamu:</p>
    <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#F26CA7;color:#fff;border-radius:8px;text-decoration:none;">Verifikasi Email</a></p>
    <p>Atau salin link ini ke browser: ${verifyUrl}</p>
    <p>Link ini berlaku selama 24 jam.</p>
  `.trim();
}
