import { Resend } from 'resend';

class EmailService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendOTPEmail(toEmail, otpCode) {
    try {
      console.log(`📧 Attempting to send OTP to: ${toEmail}`);
      
      const { data, error } = await this.resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@cryptware.com',
        to: toEmail,
        subject: 'Cryptware - Verify Your Email',
        html: this.generateOTPEmailTemplate(otpCode)
      });

      if (error) {
        console.error('❌ Resend API error:', error);
        // Fallback to console log in development
        console.log(`📧 DEVELOPMENT MODE - OTP for ${toEmail}: ${otpCode}`);
        return true;
      }

      console.log(`✅ OTP email sent to ${toEmail}:`, data.id);
      return true;
      
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      console.log(`📧 FALLBACK - OTP for ${toEmail}: ${otpCode}`);
      return true;
    }
  }

  generateOTPEmailTemplate(otpCode) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 10px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #1e3a8a, #2563eb); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .otp-code { font-size: 32px; font-weight: bold; color: #2563eb; text-align: center; margin: 30px 0; padding: 20px; background: white; border-radius: 8px; border: 2px dashed #2563eb; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Cryptware Partner Portal</h1>
            <p>Email Verification</p>
          </div>
          <div class="content">
            <h2>Verify Your Email Address</h2>
            <p>Welcome to Cryptware Partner Program! Use the OTP code below to verify your email address:</p>
            
            <div class="otp-code">${otpCode}</div>
            
            <p><strong>This code will expire in 15 minutes.</strong></p>
            <p>If you didn't request this verification, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Cryptware. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export default new EmailService();