export interface IOtpProvider {
  sendOtp(mobileNumber: string, code: string): Promise<boolean>;
}