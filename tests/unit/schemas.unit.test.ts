import { describe, it, expect } from 'vitest';
import {
  createBadgeClassSchema,
  createAssertionSchema,
  courseCompletionWebhookSchema,
} from '../../src/lib/schemas';

describe('createBadgeClassSchema', () => {
  const valid = {
    name: 'Test Badge',
    description: 'A test badge',
    imageUrl: 'https://example.com/badge.png',
    criteria: 'Complete the test',
  };

  it('accepts valid input', () => {
    expect(createBadgeClassSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts valid input with optional fields', () => {
    const result = createBadgeClassSchema.safeParse({
      ...valid,
      externalCourseId: '123',
      templateHtml: '<div>{{badgeName}}</div>',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const { name, ...rest } = valid;
    expect(createBadgeClassSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(createBadgeClassSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects missing description', () => {
    const { description, ...rest } = valid;
    expect(createBadgeClassSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects invalid imageUrl', () => {
    expect(createBadgeClassSchema.safeParse({ ...valid, imageUrl: 'not-a-url' }).success).toBe(
      false,
    );
  });

  it('rejects missing criteria', () => {
    const { criteria, ...rest } = valid;
    expect(createBadgeClassSchema.safeParse(rest).success).toBe(false);
  });
});

describe('createAssertionSchema', () => {
  const valid = {
    badgeClassId: '622cf501-bf52-47f5-a5a0-c7f168f3d6bc',
    recipientEmail: 'user@example.com',
    recipientName: 'Test User',
  };

  it('accepts valid input', () => {
    expect(createAssertionSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects non-UUID badgeClassId', () => {
    expect(createAssertionSchema.safeParse({ ...valid, badgeClassId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('rejects invalid email', () => {
    expect(createAssertionSchema.safeParse({ ...valid, recipientEmail: 'bad' }).success).toBe(
      false,
    );
  });

  it('rejects empty recipientName', () => {
    expect(createAssertionSchema.safeParse({ ...valid, recipientName: '' }).success).toBe(false);
  });

  it('rejects empty body', () => {
    expect(createAssertionSchema.safeParse({}).success).toBe(false);
  });
});

describe('courseCompletionWebhookSchema', () => {
  const valid = {
    resource: 'enrollment',
    action: 'completed',
    payload: {
      user: {
        email: 'user@example.com',
        first_name: 'John',
        last_name: 'Doe',
      },
      course: {
        id: 12345,
        name: 'Test Course',
      },
    },
  };

  it('accepts valid payload', () => {
    expect(courseCompletionWebhookSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing payload.user', () => {
    const data = { ...valid, payload: { course: valid.payload.course } };
    expect(courseCompletionWebhookSchema.safeParse(data).success).toBe(false);
  });

  it('rejects missing payload.course.id', () => {
    const data = {
      ...valid,
      payload: {
        ...valid.payload,
        course: { name: 'Test' },
      },
    };
    expect(courseCompletionWebhookSchema.safeParse(data).success).toBe(false);
  });

  it('rejects course.id as string', () => {
    const data = {
      ...valid,
      payload: {
        ...valid.payload,
        course: { id: '12345', name: 'Test' },
      },
    };
    expect(courseCompletionWebhookSchema.safeParse(data).success).toBe(false);
  });

  it('rejects invalid user email', () => {
    const data = {
      ...valid,
      payload: {
        ...valid.payload,
        user: { ...valid.payload.user, email: 'bad' },
      },
    };
    expect(courseCompletionWebhookSchema.safeParse(data).success).toBe(false);
  });
});
