import { supabase } from '../config/supabase.js';

// @desc    General authentication middleware
// @access  Private
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token required'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Attach user to request
    req.user = user;
    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// @desc    Partner-specific authentication
// @access  Private (Partner only)
export const authenticatePartner = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Partner authorization token required'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired partner token'
      });
    }

    // Check if user is a partner
    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('id, company_name, email, is_active, bank_verified')
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
        message: 'Partner account is not active. Please complete verification.'
      });
    }

    // Attach partner to request
    req.partner = {
      id: partner.id,
      company_name: partner.company_name,
      email: partner.email,
      bank_verified: partner.bank_verified
    };

    next();

  } catch (error) {
    console.error('Partner auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Partner authentication failed'
    });
  }
};

// @desc    Internal team authentication
// @access  Private (Internal only)
export const authenticateInternal = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Internal authorization token required'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired internal token'
      });
    }

    // Check if user is internal team member
    const { data: internalUser, error: internalError } = await supabase
      .from('internal_users')
      .select('id, name, email, role, is_active')
      .eq('id', user.id)
      .single();

    if (internalError || !internalUser) {
      return res.status(403).json({
        success: false,
        message: 'Internal team access required'
      });
    }

    if (!internalUser.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Internal team account is not active'
      });
    }

    // Attach internal user to request
    req.internalUser = {
      id: internalUser.id,
      name: internalUser.name,
      email: internalUser.email,
      role: internalUser.role
    };

    next();

  } catch (error) {
    console.error('Internal auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal team authentication failed'
    });
  }
};

// @desc    Optional authentication (for public routes that might have auth)
// @access  Optional
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      req.user = user;
    }

    next();

  } catch (error) {
    // Continue without authentication for optional routes
    req.user = null;
    next();
  }
};