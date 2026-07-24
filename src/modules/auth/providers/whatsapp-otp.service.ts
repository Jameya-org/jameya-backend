import { Injectable } from "@nestjs/common";
import { IOtpProvider } from "./otp-provider.interface";

@Injectable()
export class WhatsAppOtpService implements IOtpProvider {
    async sendOtp(mobileNumber: string, code: string): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
}