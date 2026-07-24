import { Injectable } from '@nestjs/common';
import { OtpRepository } from './otp.repository';

@Injectable()
export class OtpService {
  constructor(private readonly otpRepository: OtpRepository) {}
}
