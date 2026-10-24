import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ExtractedItem = z.object({
  merchant: z.string().min(1),
  item_name: z.string().nullable(),
  order_number: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().length(3).nullable(),
  purchase_date: isoDate.nullable(),
  kind: z.enum(['purchase', 'trial', 'subscription', 'other']),
  trial_end_date: isoDate.nullable(),
  return_by_date: isoDate.nullable(),
  next_charge_date: isoDate.nullable(),
  warranty_months: z.number().int().nullable(),
  merchant_email: z.string().nullable(),
  policy_text: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type ExtractedItem = z.infer<typeof ExtractedItem>;

export const ExtractionResult = z.object({ items: z.array(ExtractedItem) });
export type ExtractionResult = z.infer<typeof ExtractionResult>;

export const BankTxn = z.object({ date: isoDate, description: z.string(), amount: z.number() });
export type BankTxn = z.infer<typeof BankTxn>;

export const SubscriptionCategory = z.enum(['streaming', 'music', 'software', 'fitness', 'news', 'cloud', 'food', 'other']);
export type SubscriptionCategory = z.infer<typeof SubscriptionCategory>;

export const SubscriptionLabel = z.object({
  normalized_name: z.string(),
  merchant: z.string(),
  category: SubscriptionCategory,
  reason: z.string(),
});
export const AuditResult = z.object({ subscriptions: z.array(SubscriptionLabel) });
export type AuditResult = z.infer<typeof AuditResult>;

export const DraftEmail = z.object({
  to_address: z.string().nullable(),
  subject: z.string().min(3),
  body: z.string().min(40),
});
export type DraftEmail = z.infer<typeof DraftEmail>;

export const PolicyGuess = z.object({
  returnDays: z.number().int().nullable(),
  warrantyMonths: z.number().int().nullable(),
  trialDays: z.number().int().nullable(),
  reasoning: z.string(),
});
export type PolicyGuess = z.infer<typeof PolicyGuess>;

export const Brief = z.object({
  headline: z.string().max(140),
  second_line: z.string().max(200),
  markdown: z.string(),
});
export type Brief = z.infer<typeof Brief>;

export const FileKind = z.enum(['receipt_image', 'invoice_pdf', 'email', 'mbox', 'bank_csv', 'unknown']);
export type FileKind = z.infer<typeof FileKind>;
export const DeadlineType = z.enum(['trial_end', 'return_by', 'warranty_until', 'renewal']);
export type DeadlineType = z.infer<typeof DeadlineType>;
export const DeadlineSource = z.enum(['document', 'policy', 'llm_guess']);
export type DeadlineSource = z.infer<typeof DeadlineSource>;
export const ActionType = z.enum(['cancel_email', 'return_email', 'warranty_email', 'review']);
export type ActionType = z.infer<typeof ActionType>;
export const SubFlag = z.enum(['zombie', 'duplicate', 'price_increase']);
export type SubFlag = z.infer<typeof SubFlag>;
