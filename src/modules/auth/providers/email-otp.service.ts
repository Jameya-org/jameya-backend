import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { IOtpProvider } from './otp-provider.interface';

@Injectable()
export class EmailOtpService implements IOtpProvider {
  private readonly logger = new Logger(EmailOtpService.name);

  constructor(private readonly mailerService: MailerService) { }

  async sendOtp(target: string, code: string): Promise<boolean> {
    try {
      await this.mailerService.sendMail({
        to: target,
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

      this.logger.log(`✅ Email OTP (${code}) sent successfully to ${target}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send Email OTP to ${target}: ${error.message}`, error.stack);
      return false;
    }
  }
}