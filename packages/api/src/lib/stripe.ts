import Stripe from "stripe";
import { env } from "../config/env.js";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Set it in your environment variables."
    );
  }
  if (!stripeInstance) {
    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
    });
  }
  return stripeInstance;
}

/**
 * Create a PaymentIntent for ACH or card payments.
 * For ACH (us_bank_account), automatic confirmation is used with a mandate.
 */
export async function createPaymentIntent(opts: {
  amount: number;
  stripePaymentMethodId: string;
  stripeCustomerId?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();

  return stripe.paymentIntents.create({
    amount: Math.round(opts.amount * 100), // dollars → cents
    currency: "usd",
    payment_method: opts.stripePaymentMethodId,
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId }
      : {}),
    confirm: true,
    metadata: opts.metadata ?? {},
    // Allow ACH and card
    payment_method_types: ["us_bank_account", "card"],
    mandate_data: {
      customer_acceptance: {
        type: "online",
        online: {
          ip_address: "0.0.0.0",
          user_agent: "brevva-api",
        },
      },
    },
  });
}

/**
 * Retrieve a PaymentIntent by ID.
 */
export async function retrievePaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Refund a PaymentIntent (full refund).
 */
export async function refundPayment(
  paymentIntentId: string
): Promise<Stripe.Refund> {
  const stripe = getStripe();
  return stripe.refunds.create({ payment_intent: paymentIntentId });
}

/**
 * Verify a Stripe webhook signature.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
