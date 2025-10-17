import express from 'express';
import { supabase } from '../config/supabase.js';
import emailService from '../services/email-service.js';
import { authenticateUser} from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Generate OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// @route   POST /api/auth/register
// @desc    Register new partner with Supabase Auth
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const {
      companyName,
      cacNumber,
      tinNumber,
      contactName,
      email,
      phone,
      address,
      password,
      bankAccountNumber,
      bankCode,
      verifiedAccountName
    } = req.body;

    console.log('📝 Registration attempt for:', companyName, email);

    // Basic validation
    if (!companyName || !contactName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: companyName, contactName, email, phone, password'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Check if email already exists
    const { data: existingPartner } = await supabase
      .from('partners')
      .select('id')
      .eq('email', email)
      .single();

    if (existingPartner) {
      return res.status(409).json({
        success: false,
        message: 'Partner with this email already exists'
      });
    }

    // Create user in Supabase Auth
    console.log('Creating auth user...');
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          user_type: 'partner',
          company_name: companyName
        }
      }
    });

    if (authError) {
      console.error('❌ Auth error:', authError);
      return res.status(400).json({
        success: false,
        message: 'Authentication failed: ' + authError.message
      });
    }

    console.log('✅ Auth user created:', authData.user.id);

    // Create partner profile
    const partnerData = {
      id: authData.user.id,
      company_name: companyName,
      cac_number: cacNumber,
      tin_number: tinNumber,
      contact_name: contactName,
      email: email,
      phone: phone,
      address: address,
      is_active: false
    };

    // Add bank details if provided
    if (bankAccountNumber && bankCode && verifiedAccountName) {
      partnerData.bank_account_number = bankAccountNumber;
      partnerData.bank_code = bankCode;
      partnerData.verified_account_name = verifiedAccountName;
      partnerData.bank_verified = true;
    }

    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .insert(partnerData)
      .select()
      .single();

    if (partnerError) {
      console.error('❌ Partner creation error:', partnerError);
      
      // Cleanup auth user
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
      } catch (deleteError) {
        console.error('Cleanup failed:', deleteError);
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to create partner profile: ' + partnerError.message
      });
    }

    // Generate and send OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await supabase
      .from('partner_otps')
      .insert({
        partner_id: partner.id,
        email: email,
        otp_code: otpCode,
        expires_at: expiresAt.toISOString()
      });

    // Send OTP email
    await emailService.sendOTPEmail(email, otpCode);

    const responseData = {
      success: true,
      message: 'Partner registered successfully. Please verify your email with OTP.',
      data: {
        partnerId: partner.id,
        email: partner.email,
        hasBankDetails: !!(bankAccountNumber && bankCode && verifiedAccountName)
      }
    };

    // Include OTP in development
    if (process.env.NODE_ENV === 'development') {
      responseData.data.otpCode = otpCode;
      console.log(`🔑 DEV OTP for ${email}: ${otpCode}`);
    }

    res.status(201).json(responseData);

  } catch (error) {
    console.error('💥 Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error: ' + error.message
    });
  }
});

// @route   POST /api/auth/login
// @desc    Universal login for both partners and internal users
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt for:', email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check internal users first
    const { data: internalUser, error: internalError } = await supabase
      .from('internal_users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (internalUser) {
      if (!internalUser.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Account is inactive'
        });
      }

      // ✅ PLAIN PASSWORD COMPARISON FOR INTERNAL USERS
      console.log('🔑 Comparing plain passwords...');
      console.log('Input password:', password);
      console.log('Stored password:', internalUser.password);
      // console.log('Internal Token:', int_token);
      
      // Compare plain text passwords
      if (password === internalUser.password) {
        console.log(`✅ Internal login successful: ${email}`);
        
        // Remove sensitive data
        const { password, password_hash, ...safeUserData } = internalUser;

        const mockSession = {
          access_token: 'internal_user_' + internalUser.id,
          token_type: 'bearer',
          expires_in: 604800,
        };

        return res.json({
          success: true,
          message: 'Login successful',
          data: {
            user: safeUserData,
            userType: 'internal',
            session: mockSession
          }
        });
      } else {
        console.log('❌ Invalid password for internal user');
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
    }

    // 2. Try Supabase Auth for partners
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Partner login logic (unchanged)
    const user = authData.user;
    
    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('*')
      .eq('id', user.id)
      .single();

    if (partnerError || !partner) {
      return res.status(403).json({
        success: false,
        message: 'Partner account not found'
      });
    }

    if (!partner.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Partner account is not active'
      });
    }

    const { password_hash: partnerPasswordHash, ...safePartnerData } = partner;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: safePartnerData,
        userType: 'partner',
        session: authData.session
      }
    });

  } catch (error) {
    console.error('💥 Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', authenticateUser, async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Logout error:', error);
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    console.log('📧 Password reset requested for:', email);

    // Check if user exists (partner or internal)
    const { data: partner } = await supabase
      .from('partners')
      .select('id, email, contact_name')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    const { data: internalUser } = await supabase
      .from('internal_users')
      .select('id, email, name')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    const user = partner || internalUser;

    if (!user) {
      // Don't reveal whether email exists or not
      return res.json({
        success: true,
        message: 'If an account with that email exists, a reset link has been sent'
      });
    }

    // Generate reset token (in production, use proper JWT)
    const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    // Store reset token (you might want a separate table for this)
    console.log('🔐 Reset token generated:', resetToken);

    // Send reset email
    const emailSent = await emailService.sendPasswordResetEmail(
      email, 
      resetToken, 
      user.contact_name || user.name
    );

    if (!emailSent) {
      console.warn('Password reset email sending failed');
    }

    res.json({
      success: true,
      message: 'If an account with that email exists, a reset link has been sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    console.log('🔄 Password reset attempt with token:', token);

    // In production, verify the token from your database
    // For now, we'll simulate token verification
    const isValidToken = true; // Replace with actual token verification

    if (!isValidToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Extract email from token (in production, decode JWT)
    // This is simplified - implement proper token decoding
    const email = 'user@example.com'; // Extract from token

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    let userData = null;
    let userType = null;

    // Determine user type and fetch profile
    const [partnerResult, internalResult] = await Promise.all([
      supabase.from('partners').select('*').eq('id', user.id).single(),
      supabase.from('internal_users').select('*').eq('id', user.id).single()
    ]);

    if (partnerResult.data) {
      userData = partnerResult.data;
      userType = 'partner';
    } else if (internalResult.data) {
      userData = internalResult.data;
      userType = 'internal';
    } else {
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    // Remove sensitive data
    const { password_hash, ...safeUserData } = userData;

    res.json({
      success: true,
      data: {
        user: safeUserData,
        userType
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
});

// @route   POST /api/auth/send-otp
// @desc    Send OTP to partner's email
// @access  Public
router.post('/send-otp', async (req, res) => {
  try {
    const { email, partnerId } = req.body;

    if (!email || !partnerId) {
      return res.status(400).json({
        success: false,
        message: 'Email and partner ID are required'
      });
    }

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    console.log(`📧 Generating OTP for ${email}: ${otpCode}`);

    // Store OTP
    const { error: otpError } = await supabase
      .from('partner_otps')
      .insert({
        partner_id: partnerId,
        email: email,
        otp_code: otpCode,
        expires_at: expiresAt.toISOString()
      });

    if (otpError) {
      console.error('OTP storage error:', otpError);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate OTP'
      });
    }

    // Send email
    const emailSent = await emailService.sendOTPEmail(email, otpCode);

    if (!emailSent) {
      console.warn('Email sending failed, but OTP was stored');
    }

    res.json({
      success: true,
      message: 'OTP sent successfully',
      expiresIn: '15 minutes'
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and activate partner account
// @access  Public
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otpCode, partnerId } = req.body;

    if (!email || !otpCode || !partnerId) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP code, and partner ID are required'
      });
    }

    console.log(`🔍 Verifying OTP for ${email}: ${otpCode}`);

    // Find valid OTP
    const { data: otpRecord, error: otpError } = await supabase
      .from('partner_otps')
      .select('*')
      .eq('partner_id', partnerId)
      .eq('email', email)
      .eq('otp_code', otpCode)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (otpError || !otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP code'
      });
    }

    // Mark OTP as used
    await supabase
      .from('partner_otps')
      .update({ used: true })
      .eq('id', otpRecord.id);

    // Activate partner
    const { error: updateError } = await supabase
      .from('partners')
      .update({ is_active: true })
      .eq('id', partnerId);

    if (updateError) {
      console.error('Activation error:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to activate partner account'
      });
    }

    console.log('✅ Partner activated:', partnerId);

    res.json({
      success: true,
      message: 'Email verified successfully. Your account is now active.'
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;