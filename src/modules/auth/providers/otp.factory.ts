import { ConfigService } from '@nestjs/config';
import { ConsoleOtpService } from './console-otp.service';
import { IOtpProvider } from './otp-provider.interface';
// import { WhatsAppOtpService } from './whatsapp-otp.service';

export const OtpProviderFactory = {
  provide: 'OTP_PROVIDER',
  useFactory: (configService: ConfigService): IOtpProvider => {
    const driver = configService.get<string>('OTP_DRIVER', 'console');
    
    // Easily add 'whatsapp' or 'email' implementations here in the future
    if (driver === 'console') {
      return new ConsoleOtpService();
    }

    if (driver === 'whatsapp') {
      // return new WhatsAppOtpService();
    }
    
    return new ConsoleOtpService();
  },
  inject: [ConfigService],
};