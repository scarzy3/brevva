import { Router } from "express";
import express from "express";
import { prisma } from "../lib/prisma.js";
import { verifyWebhookSignature } from "../lib/stripe.js";
import { env } from "../config/env.js";

const router = Router();

// Raw body parser — Stripe needs the raw body for signature verification
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig || typeof sig !== "string") {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    if (!env.STRIPE_WEBHOOK_SECRET) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured");
      res.status(500).json({ error: "Webhook secret not configured" });
      return;
    }

    let event;
    try {
      event = verifyWebhookSignature(
        req.body as Buffer,
        sig,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const intent = event.data.object;
          await prisma.payment.updateMany({
            where: { stripePaymentIntentId: intent.id },
            data: {
              status: "COMPLETED",
              paidAt: new Date(),
              netAmount: (intent.amount - (intent.application_fee_amount ?? 0)) / 100,
            },
          });
          break;
        }

        case "payment_intent.payment_failed": {
          const intent = event.data.object;
          await prisma.payment.updateMany({
            where: { stripePaymentIntentId: intent.id },
            data: { status: "FAILED" },
          });
          break;
        }

        case "charge.refunded": {
          const charge = event.data.object;
          if (charge.payment_intent && typeof charge.payment_intent === "string") {
            await prisma.payment.updateMany({
              where: { stripePaymentIntentId: charge.payment_intent },
              data: { status: "REFUNDED" },
            });
          }
          break;
        }

        default:
          // Unhandled event type — log but don't error
          break;
      }
    } catch (err) {
      console.error(`Error processing webhook event ${event.type}:`, err);
      res.status(500).json({ error: "Webhook processing failed" });
      return;
    }

    res.json({ received: true });
  }
);

export default router;
