import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { IOtpProvider } from './otp-provider.interface';

@Injectable()
export class EmailOtpService implements IOtpProvider {
  private readonly logger = new Logger(EmailOtpService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        '⚠️ RESEND_API_KEY is not set. Resend email service will fail unless an API key is provided.',
      );
    }
    this.resend = new Resend(apiKey || 're_placeholder');
    this.fromEmail = this.configService.get<string>(
      'RESEND_FROM',
      'Jameya Support <onboarding@resend.dev>',
    );
  }

  async sendOtp(target: string, code: string): Promise<boolean> {
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: [target],
        subject: 'Your Jameya Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #2c3e50; text-align: center;">Jameya Verification Code</h2>
            <p style="font-size: 16px; color: #555;">Use the verification code below to complete your login or registration:</p>
            <div style="background-color: #f4f6f8; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #16a085;">${code}</span>
            </div>
            <p style="font-size: 14px; color: #888;">This code will expire in 5 minutes. If you did not request this code, please ignore this email.</p>
          </div>
        `,
      });

      if (error) {
        this.logger.error(
          `❌ Failed to send Email OTP via Resend to ${target}: ${error.message}`,
        );
        return false;
      }

      this.logger.log(
        `✅ Email OTP (${code}) sent successfully via Resend to ${target} (id: ${data?.id})`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `❌ Exception sending Email OTP to ${target}: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }
}