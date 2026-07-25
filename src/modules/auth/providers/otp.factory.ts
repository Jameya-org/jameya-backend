import { ConfigService } from '@nestjs/config';
import { IOtpProvider } from './otp-provider.interface';
import { EmailOtpService } from './email-otp.service';
import { ConsoleOtpService } from './console-otp.service';

export const OtpProviderFactory = {
  provide: 'OTP_PROVIDER',
  useFactory: (
    configService: ConfigService,
    emailOtp: EmailOtpService,
    consoleOtp: ConsoleOtpService,
  ): IOtpProvider => {
    const driver = configService.get<string>('OTP_DRIVER', 'email');

    if (driver === 'email') {
      return emailOtp;
    }

    return consoleOtp;
  },
  inject: [ConfigService, EmailOtpService, ConsoleOtpService],
};