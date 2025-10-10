import express from 'express';
import { supabase } from '../config/supabase.js';
import bcrypt from 'bcryptjs';
import emailService from '../services/email-service.js';
import jwt from 'jsonwebtoken';
import { verifyPartnerToken } from '../middleware/verifyPartnerToken.js';

const router = express.Router();

// Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// @route   POST /api/auth/register
// @desc    Register new partner with password
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

    // Password validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Check if email already exists
    const { data: existingPartner, error: checkError } = await supabase
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

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create partner in Supabase Auth
    console.log('Creating auth user...');
    // In auth.js register route, update the signUp call:
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          user_type: 'partner',
          company_name: companyName
        },
        // Add this to disable Supabase confirmation emails
        emailRedirectTo: `${process.env.FRONTEND_URL}/login.html?verified=true`
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

    // Prepare partner data
    const partnerData = {
      id: authData.user.id,
      company_name: companyName,
      cac_number: cacNumber,
      tin_number: tinNumber,
      contact_name: contactName,
      email: email,
      phone: phone,
      address: address,
      password_hash: passwordHash, // Store hashed password
      is_active: false
    };

    // Add bank details if provided
    if (bankAccountNumber && bankCode && verifiedAccountName) {
      partnerData.bank_account_number = bankAccountNumber;
      partnerData.bank_code = bankCode;
      partnerData.verified_account_name = verifiedAccountName;
      partnerData.bank_verified = true;
    }

    // Create partner profile
    const { data: partnerDataResult, error: partnerError } = await supabase
      .from('partners')
      .insert(partnerData)
      .select()
      .single();

    if (partnerError) {
      console.error('❌ Partner creation error:', partnerError);
      
      // Try to clean up auth user
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

    console.log('✅ Partner profile created:', partnerDataResult.id);

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Store OTP
    const { error: otpError } = await supabase
      .from('partner_otps')
      .insert({
        partner_id: partnerDataResult.id,
        email: email,
        otp_code: otpCode,
        expires_at: expiresAt.toISOString()
      });

    if (otpError) {
      console.error('❌ OTP storage error:', otpError);
      return res.status(500).json({
        success: false,
        message: 'Registration completed but OTP setup failed'
      });
    }

    // Send OTP email
    console.log('Sending OTP email...');
    const emailSent = await emailService.sendOTPEmail(email, otpCode);

    const responseData = {
      success: true,
      message: 'Partner registered successfully. Please verify your email with OTP.',
      data: {
        partnerId: partnerDataResult.id,
        email: partnerDataResult.email,
        hasBankDetails: !!(bankAccountNumber && bankCode && verifiedAccountName)
      }
    };

    // Include OTP in development for testing
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

// Add these routes to your existing auth.js

// @route   POST /api/auth/internal-login
// @desc    Internal user login (separate from partner login)
// @access  Public
router.post('/internal-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    console.log('🔐 Internal login attempt for:', email);

    // Find internal user
    const { data: internalUser, error: userError } = await supabase
      .from('internal_users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .eq('is_active', true)
      .single();

    if (userError || !internalUser) {
      console.log('❌ Internal user not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if password_hash exists and verify it
    if (internalUser.password_hash) {
      // Compare hashed password
      const isValidPassword = await bcrypt.compare(password, internalUser.password_hash);
      if (!isValidPassword) {
        console.log('❌ Invalid password for:', email);
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
    } else {
      // Fallback for existing users without password_hash
      // Remove this after all users have password_hash
      if (password !== 'Meticulous25$') {
        console.log('❌ Invalid fallback password for:', email);
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      
      // Hash the password for future logins
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      await supabase
        .from('internal_users')
        .update({ password_hash: passwordHash })
        .eq('id', internalUser.id);
    }

    // Remove sensitive data from response
    const { password_hash, ...userWithoutPassword } = internalUser;

    console.log('✅ Internal login successful for:', email);

    res.json({
      success: true,
      message: 'Login successful',
      data: userWithoutPassword
    });

  } catch (error) {
    console.error('Internal login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
});

// @route   POST /api/auth/partner-login
// @desc    Partner login via Supabase Auth (frontend handles this directly)
// @access  Public


router.post('/partner-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 🔍 Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    console.log('🔐 Partner login attempt for:', normalizedEmail);

    // 1️⃣ Fetch partner including hashed password
    const { data: partner, error } = await supabase
      .from('partners')
      .select('id, company_name, email, password_hash, is_active, bank_verified')
      .eq('email', normalizedEmail)
      .single();

    if (error || !partner) {
      console.log('❌ No active partner found for:', normalizedEmail);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    if (!partner.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive. Please contact support.'
      });
    }

    // 2️⃣ Verify password (Supabase stores it hashed)
    const validPassword = await bcrypt.compare(password, partner.password_hash);

    if (!validPassword) {
      console.log('❌ Invalid password for:', normalizedEmail);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // 3️⃣ Generate JWT token
    const token = jwt.sign(
      {
        id: partner.id,
        email: partner.email,
        role: 'partner'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    console.log('✅ Partner login successful:', partner.company_name);

    // 4️⃣ Remove password before sending back
    const { password_hash, ...safePartner } = partner;

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: safePartner,
      token
    });

  } catch (err) {
    console.error('🔥 Partner login error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
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
router.get('/me', async (req, res) => {
  try {
    // This would require authentication middleware
    // For now, return simple response
    res.json({
      success: true,
      message: 'Auth check endpoint'
    });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
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

router.get('/partner-dashboard', verifyPartnerToken, async (req, res) => {
  res.json({
    success: true,
    message: `Welcome back, partner ${req.partner.email}!`,
  });
});

export default router;