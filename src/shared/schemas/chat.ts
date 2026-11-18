import { z } from "zod";
import { CHAT_SESSION_STATUSES } from "../constants";
import { paginatedSchema } from "./common";

export const chatSessionSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: z.enum(CHAT_SESSION_STATUSES),
  launchId: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type ChatSessionDto = z.infer<typeof chatSessionSchema>;

export const chatSessionResponseSchema = z.object({
  session: chatSessionSchema,
});

export const chatSessionsPageSchema = paginatedSchema(chatSessionSchema);

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.iso.datetime(),
});
export type ChatMessageDto = z.infer<typeof chatMessageSchema>;

export const chatMessagesPageSchema = paginatedSchema(chatMessageSchema);

export const CHAT_TEXT_MAX = 2000;

export const sendChatMessageRequestSchema = z.object({
  text: z.string().trim().min(1).max(CHAT_TEXT_MAX),
});

export const chatReplySchema = z.object({
  messages: z.array(chatMessageSchema),
  draftLaunchId: z.string().optional(),
});
export type ChatReply = z.infer<typeof chatReplySchema>;
