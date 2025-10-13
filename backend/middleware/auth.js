import { supabase } from '../config/supabase.js';

export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token required'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Check if this is an internal user token (starts with 'internal_user_')
    if (token.startsWith('internal_user_')) {
      const internalUserId = token.replace('internal_user_', '');
      
      // Verify internal user exists and is active
      const { data: internalUser, error } = await supabase
        .from('internal_users')
        .select('id, name, email, role, is_active')
        .eq('id', internalUserId)
        .eq('is_active', true)
        .single();

      if (error || !internalUser) {
        return res.status(401).json({
          success: false,
          message: 'Invalid internal user token'
        });
      }

      req.user = {
        id: internalUser.id,
        email: internalUser.email,
        user_metadata: { user_type: 'internal' }
      };
      return next();
    }
    
    // Otherwise, verify token with Supabase (for partners)
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

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

// Add this middleware specifically for partners
export const authenticatePartner = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token required'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token with Supabase (for partners)
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Verify this is actually a partner
    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('id, company_name, email, is_active')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (partnerError || !partner) {
      return res.status(403).json({
        success: false,
        message: 'Partner account not found or inactive'
      });
    }

    req.user = user;
    req.partner = partner; // Add partner data to request
    next();

  } catch (error) {
    console.error('Partner auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Internal team middleware
export const authenticateInternal = async (req, res, next) => {
  try {
    await authenticateUser(req, res, async () => {
      const user = req.user;

      // Check if user is internal team
      const { data: internalUser, error } = await supabase
        .from('internal_users')
        .select('id, name, email, role, is_active')
        .eq('id', user.id)
        .single();

      if (error || !internalUser) {
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

      req.internalUser = internalUser;
      next();
    });
  } catch (error) {
    console.error('Internal auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal team authentication failed'
    });
  }
};