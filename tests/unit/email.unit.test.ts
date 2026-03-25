import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import nodemailer from 'nodemailer';

vi.mock('nodemailer');

const validParams = {
  recipientEmail: 'user@example.com',
  recipientName: 'Test User',
  badgeName: 'Test Badge',
  badgeDescription: 'A test badge',
  badgeImageUrl: 'https://example.com/badge.png',
  issuerName: 'Test Academy',
  verifyUrl: 'https://test.example.com/verify/abc-123',
  expiresAt: null as Date | null,
};

describe('sendBadgeIssuedEmail', () => {
  const originalHost = process.env.SMTP_HOST;
  let mockSendMail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset the module to clear the cached transporter singleton
    vi.resetModules();
    mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-123' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: mockSendMail } as any);
  });

  afterEach(() => {
    process.env.SMTP_HOST = originalHost;
  });

  it('skips silently when SMTP_HOST is not set', async () => {
    delete process.env.SMTP_HOST;
    const { sendBadgeIssuedEmail } = await import('../../src/services/email');

    await expect(sendBadgeIssuedEmail(validParams)).resolves.toBeUndefined();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sends email with correct subject when SMTP is configured', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    const { sendBadgeIssuedEmail } = await import('../../src/services/email');

    await sendBadgeIssuedEmail(validParams);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'You earned: Test Badge',
      }),
    );
  });

  it('includes badge name and recipient in HTML body', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    const { sendBadgeIssuedEmail } = await import('../../src/services/email');

    await sendBadgeIssuedEmail(validParams);

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('Test User');
    expect(call.html).toContain('Test Badge');
    expect(call.html).toContain('Test Academy');
    expect(call.html).toContain('https://test.example.com/verify/abc-123');
  });

  it('includes expiration date when provided', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    const { sendBadgeIssuedEmail } = await import('../../src/services/email');

    await sendBadgeIssuedEmail({
      ...validParams,
      expiresAt: new Date('2027-06-01'),
    });

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('2027-06-01');
    expect(call.html).toContain('expires on');
  });

  it('does not throw when sendMail fails', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));
    const { sendBadgeIssuedEmail } = await import('../../src/services/email');

    await expect(sendBadgeIssuedEmail(validParams)).resolves.toBeUndefined();
  });
});
