import { z } from 'zod';

export const createBadgeClassSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  imageUrl: z.string().url(),
  criteria: z.string().min(1),
  achievementType: z
    .enum([
      'Achievement',
      'Assessment',
      'Award',
      'Badge',
      'Certificate',
      'Certification',
      'Course',
      'Degree',
      'Diploma',
      'License',
      'MicroCredential',
    ])
    .default('Badge'),
  externalCourseId: z.string().optional(),
  templateHtml: z.string().optional(),
});

export const createAssertionSchema = z.object({
  badgeClassId: z.string().uuid(),
  recipientEmail: z.string().email(),
  recipientName: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

export const revokeAssertionSchema = z.object({
  reason: z.string().min(1),
});

export const courseCompletionWebhookSchema = z.object({
  resource: z.string(),
  action: z.string(),
  payload: z.object({
    user: z.object({
      email: z.string().email(),
      first_name: z.string(),
      last_name: z.string(),
    }),
    course: z.object({
      id: z.number(),
      name: z.string(),
    }),
  }),
});
