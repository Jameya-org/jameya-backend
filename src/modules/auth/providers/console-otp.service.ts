import { Injectable, Logger } from '@nestjs/common';
import { IOtpProvider } from './otp-provider.interface';

@Injectable()
export class ConsoleOtpService implements IOtpProvider {
  private readonly logger = new Logger(ConsoleOtpService.name);

  async sendOtp(mobileNumber: string, code: string): Promise<boolean> {
    this.logger.log(`\n========================================\n[DEV OTP] Sent to ${mobileNumber}: ${code}\n========================================`);
    return true;
  }
}