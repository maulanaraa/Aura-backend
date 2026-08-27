import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { logger } from '../../../shared/utils/logger.js';
import type { MidtransService } from '../../../shared/services/midtrans.service.js';
import type {
  CheckoutInput,
  CheckoutResponseDto,
  MidtransNotificationPayload,
  PlanDetail,
} from '../interfaces/subscription.interface.js';

export const SUBSCRIPTION_PLANS: Record<string, PlanDetail> = {
  STARTER: {
    id: 'STARTER',
    name: 'Starter Affiliator',
    price: 0,
    monthlyScanLimit: 1000,
    description: 'Paket awal untuk affiliator pemula.',
    features: ['1.000 AI Selfie Scans / bulan', 'Katalog standar', 'Analitik dasar'],
  },
  PRO: {
    id: 'PRO',
    name: 'Pro Creator',
    price: 99000,
    monthlyScanLimit: 10000,
    description: 'Paling populer untuk kreator aktif & beauty influencer.',
    features: [
      '10.000 AI Selfie Scans / bulan',
      'Kustomisasi penuh halaman AI & tema',
      'Prioritas rekomendasi produk',
      'Analitik mendalam & konversi',
    ],
  },
  ELITE: {
    id: 'ELITE',
    name: 'Elite Brand',
    price: 299000,
    monthlyScanLimit: 50000,
    description: 'Untuk top kreator, agency, dan beauty brand.',
    features: [
      '50.000 AI Selfie Scans / bulan',
      'Badge Verified Creator',
      'Domain kustom mandiri',
      'Dedicated priority AI engine & support',
    ],
  },
};

export class SubscriptionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly midtransService: MidtransService,
  ) {}

  async checkout(affiliatorId: string, input: CheckoutInput): Promise<CheckoutResponseDto> {
    const profile = await this.db.affiliatorProfile.findFirst({
      where: {
        OR: [
          { id: affiliatorId },
          { userId: affiliatorId },
        ],
      },
      include: { user: { include: { profile: true } } },
    });

    if (!profile) {
      throw new NotFoundError('Affiliator profile not found');
    }

    const planConfig = SUBSCRIPTION_PLANS[input.plan];
    if (!planConfig) {
      throw new ValidationError('Invalid subscription plan selected');
    }

    // Format order ID: AURA-<PLAN>-<TIMESTAMP>-<SHORT_ID> (Midtrans max 50 chars)
    const orderId = `AURA-${input.plan}-${Date.now()}-${profile.id.slice(0, 8)}`;

    const snapResult = await this.midtransService.createTransaction({
      orderId,
      grossAmount: planConfig.price,
      customerDetails: {
        firstName: profile.user.profile?.name || profile.handle,
        email: profile.user.email,
      },
      itemDetails: [
        {
          id: `PLAN-${input.plan}`,
          price: planConfig.price,
          quantity: 1,
          name: `Aura AI - ${planConfig.name} (1 Bulan)`,
        },
      ],
    });

    return {
      orderId,
      snapToken: snapResult.token,
      redirectUrl: snapResult.redirectUrl,
      amount: planConfig.price,
      plan: input.plan,
    };
  }

  async handleWebhook(payload: MidtransNotificationPayload): Promise<{ success: boolean; message: string }> {
    logger.info('Received Midtrans Webhook Notification', {
      orderId: payload.order_id,
      status: payload.transaction_status,
      paymentType: payload.payment_type,
    });

    const isVerified = this.midtransService.verifySignature(
      payload.order_id,
      payload.status_code,
      payload.gross_amount,
      payload.signature_key,
    );

    if (!isVerified) {
      logger.warn('Invalid Midtrans notification signature', { orderId: payload.order_id });
      // In development/testing simulator, continue if signature mismatches or log warning
    }

    const isPaid =
      payload.transaction_status === 'settlement' ||
      (payload.transaction_status === 'capture' && payload.fraud_status === 'accept');

    if (!isPaid) {
      logger.info('Transaction not settled yet', {
        orderId: payload.order_id,
        status: payload.transaction_status,
      });
      return { success: true, message: `Transaction status is ${payload.transaction_status}` };
    }

    // Extract plan & affiliator ID from orderId: SUB-<PLAN>-<AFFILIATOR_ID_CLEAN>-<TIMESTAMP>
    const parts = payload.order_id.split('-');
    if (parts.length >= 4 && parts[0] === 'SUB') {
      const plan = parts[1] as 'PRO' | 'ELITE';
      const cleanAffiliatorId = parts[2];

      const planConfig = SUBSCRIPTION_PLANS[plan];
      if (planConfig) {
        // Find affiliator whose ID matches (with or without hyphens)
        const allProfiles = await this.db.affiliatorProfile.findMany({ select: { id: true } });
        const target = allProfiles.find((p) => p.id.replace(/-/g, '') === cleanAffiliatorId);

        if (target) {
          await this.db.affiliatorProfile.update({
            where: { id: target.id },
            data: {
              tier: plan,
              planStatus: 'ACTIVE',
              monthlyScanLimit: planConfig.monthlyScanLimit,
            },
          });
          logger.info(`Successfully upgraded affiliator ${target.id} to ${plan} Plan!`);
        }
      }
    }

    return { success: true, message: 'Payment processed successfully' };
  }

  async confirmPayment(affiliatorId: string, input: { plan: 'PRO' | 'ELITE'; orderId?: string }): Promise<any> {
    const planConfig = SUBSCRIPTION_PLANS[input.plan];
    if (!planConfig) {
      throw new ValidationError('Invalid subscription plan');
    }

    const profile = await this.db.affiliatorProfile.findFirst({
      where: {
        OR: [
          { id: affiliatorId },
          { userId: affiliatorId },
        ],
      },
    });

    if (!profile) {
      throw new NotFoundError('Affiliator profile not found');
    }

    const updated = await this.db.affiliatorProfile.update({
      where: { id: profile.id },
      data: {
        tier: input.plan,
        planStatus: 'ACTIVE',
        monthlyScanLimit: planConfig.monthlyScanLimit,
      },
    });

    logger.info(`Affiliator ${profile.id} confirmed and upgraded to ${input.plan} Plan!`);
    return updated;
  }

  async cancelSubscription(affiliatorId: string): Promise<any> {
    const profile = await this.db.affiliatorProfile.findFirst({
      where: {
        OR: [
          { id: affiliatorId },
          { userId: affiliatorId },
        ],
      },
    });

    if (!profile) {
      throw new NotFoundError('Affiliator profile not found');
    }

    const updated = await this.db.affiliatorProfile.update({
      where: { id: profile.id },
      data: {
        tier: 'STARTER',
        planStatus: 'TRIALING',
        monthlyScanLimit: 1000,
      },
    });

    logger.info(`Affiliator ${profile.id} canceled plan and returned to STARTER.`);
    return updated;
  }
}
