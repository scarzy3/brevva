import { z } from "zod";
import { paginationSchema } from "../lib/pagination.js";

export const createThreadSchema = z.object({
  tenantId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(10000),
});

export const threadListQuerySchema = paginationSchema.extend({
  tenantId: z.string().uuid().optional(),
});

export const threadIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const messageIdParamSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ThreadListQuery = z.infer<typeof threadListQuerySchema>;
