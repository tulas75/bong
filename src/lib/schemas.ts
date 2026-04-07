/**
 * @module schemas
 * Zod validation schemas for all API request bodies.
 */

import { z } from 'zod';

/** Schema for `POST /api/v1/badges` — create a new badge class. */
export const createBadgeClassSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  imageUrl: z.string().url(),
  criteria: z.string().min(1),
  achievementType: z
    .enum([
      'Achievement',
      'ApprenticeshipCertificate',
      'Assessment',
      'AssociateDegree',
      'Award',
      'BachelorDegree',
      'Badge',
      'Certificate',
      'CertificateOfCompletion',
      'Certification',
      'CoCurricular',
      'CommunityService',
      'Competency',
      'Course',
      'Degree',
      'Diploma',
      'DoctoralDegree',
      'Fieldwork',
      'GeneralEducationDevelopment',
      'JourneymanCertificate',
      'LearningProgram',
      'License',
      'Licensure',
      'MasterCertificate',
      'MasterDegree',
      'MicroCredential',
      'NationalityStatus',
      'ProfessionalDoctorate',
      'QualityAssuranceCredential',
      'ResearchDoctorate',
      'SecondarySchoolDiploma',
    ])
    .default('Badge'),
  externalCourseId: z.string().optional(),
  templateHtml: z.string().optional(),
});

/** Schema for `POST /api/v1/assertions` — issue a badge to a recipient. */
export const createAssertionSchema = z.object({
  badgeClassId: z.string().uuid(),
  recipientEmail: z.string().email(),
  recipientName: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
  cryptosuite: z.enum(['eddsa-rdfc-2022', 'ecdsa-sd-2023']).default('eddsa-rdfc-2022'),
});

/** Schema for `POST /api/v1/assertions/:id/revoke` — revoke an assertion with a reason. */
export const revokeAssertionSchema = z.object({
  reason: z.string().min(1),
});

/** Schema for `POST /api/v1/webhooks/course-completed` — LMS course completion payload. */
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
