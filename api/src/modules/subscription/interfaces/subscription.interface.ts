export type SubscriptionPlan = 'STARTER' | 'PRO' | 'ELITE';

export interface PlanDetail {
  id: SubscriptionPlan;
  name: string;
  price: number;
  monthlyScanLimit: number;
  description: string;
  features: string[];
}

export interface CheckoutInput {
  plan: 'PRO' | 'ELITE';
}

export interface CheckoutResponseDto {
  orderId: string;
  snapToken: string;
  redirectUrl: string;
  amount: number;
  plan: 'PRO' | 'ELITE';
}

export interface MidtransNotificationPayload {
  order_id: string;
  transaction_status: string;
  fraud_status?: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  payment_type?: string;
  transaction_time?: string;
}
