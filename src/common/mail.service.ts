import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/** Escape text before putting it into an HTML email (names are user-controlled). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Thin wrapper over Nodemailer using the SAME settings as the weekly report
 * emails (MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS). It never throws:
 * `send` reports success as a boolean, so a mail problem can never break the
 * request that triggered it. Short timeouts stop a slow SMTP server from
 * hanging anything.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(mail: MailInput): Promise<boolean> {
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASS;
    if (!user || !pass) {
      this.logger.warn('MAIL_USER / MAIL_PASS are not set; email not sent');
      return false;
    }
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.MAIL_PORT || '587'),
        secure: false,
        auth: { user, pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
      await transporter.sendMail({ from: `"BrainHealth" <${user}>`, ...mail });
      return true;
    } catch (e) {
      // Log the failure, never the recipient or the content.
      this.logger.error(`email could not be sent: ${(e as Error).message}`);
      return false;
    }
  }
}
