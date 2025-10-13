import Joi from 'joi';

// Existing validation functions
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhone = (phone) => {
  const phoneRegex = /^\+?[\d\s-()]{10,}$/;
  return phoneRegex.test(phone);
};

const validateBankAccount = (accountNumber) => {
  return /^\d{10}$/.test(accountNumber);
};

// Partner registration validation
const validatePartnerRegistration = (req, res, next) => {
  const {
    companyName,
    contactName,
    email,
    phone,
    password
  } = req.body;

  const errors = [];

  if (!companyName || companyName.length < 2) {
    errors.push('Company name is required and must be at least 2 characters');
  }

  if (!contactName || contactName.length < 2) {
    errors.push('Contact name is required and must be at least 2 characters');
  }

  if (!email || !validateEmail(email)) {
    errors.push('Valid email is required');
  }

  if (!phone || !validatePhone(phone)) {
    errors.push('Valid phone number is required');
  }

  if (!password || password.length < 6) {
    errors.push('Password is required and must be at least 6 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors
    });
  }

  next();
};

// Bank verification validation
const validateBankVerification = (req, res, next) => {
  const { accountNumber, bankCode, partnerId } = req.body;

  const errors = [];

  if (!accountNumber || !validateBankAccount(accountNumber)) {
    errors.push('Valid 10-digit account number is required');
  }

  if (!bankCode) {
    errors.push('Bank code is required');
  }

  if (!partnerId) {
    errors.push('Partner ID is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors
    });
  }

  next();
};

// New Joi-based validations

// Query parameter validation for analytics
const validateQueryParams = (req, res, next) => {
  const schema = Joi.object({
    type: Joi.string().valid('overview', 'referral_conversion', 'revenue_trends', 'partner_performance', 'lead_sources').default('overview'),
    date_from: Joi.date().iso(),
    date_to: Joi.date().iso().min(Joi.ref('date_from')),
    partner_id: Joi.string().uuid(),
    group_by: Joi.string().valid('day', 'week', 'month', 'quarter').default('month'),
    period: Joi.string().valid('week', 'month', 'quarter', 'year').default('month'),
    team_member_id: Joi.string().uuid(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('all', 'active', 'inactive', 'verified', 'unverified'),
    performance: Joi.string().valid('all', 'beginner', 'active', 'premium', 'elite'),
    search: Joi.string().max(100)
  });

  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }

  // Set validated values
  req.query = value;
  next();
};

// Partner status update validation
const validatePartnerStatusUpdate = (req, res, next) => {
  const schema = Joi.object({
    is_active: Joi.boolean().required(),
    notes: Joi.string().max(500).optional()
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }

  req.body = value;
  next();
};

// System config validation
const validateSystemConfig = (req, res, next) => {
  const schema = Joi.object({
    commission_rate: Joi.number().min(0.01).max(0.5).optional(),
    referral_code_prefix: Joi.string().max(10).optional(),
    otp_expiry_minutes: Joi.number().integer().min(1).max(60).optional(),
    payout_processing_hours: Joi.number().integer().min(1).max(168).optional()
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }

  req.body = value;
  next();
};

// Internal user management validation
const validateInternalUser = (req, res, next) => {
  const baseSchema = {
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    role: Joi.string().valid('admin', 'team_member').default('team_member'),
    is_active: Joi.boolean().default(true)
  };

  const schema = Joi.object(
    req.method === 'POST' 
      ? baseSchema 
      : Object.keys(baseSchema).reduce((acc, key) => {
          acc[key] = baseSchema[key].optional();
          return acc;
        }, {})
  );

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }

  req.body = value;
  next();
};

// Notification validation
const validateNotification = (req, res, next) => {
  const schema = Joi.object({
    user_id: Joi.string().uuid().optional(),
    user_type: Joi.string().valid('partner', 'internal', 'all').required(),
    type: Joi.string().valid('payout_processed', 'referral_updated', 'system_announcement', 'account_activated', 'account_deactivated').required(),
    title: Joi.string().max(200).required(),
    message: Joi.string().max(1000).required(),
    metadata: Joi.object().optional()
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }

  req.body = value;
  next();
};

// Export all validations
export {
  validatePartnerRegistration,
  validateBankVerification,
  validateEmail,
  validatePhone,
  validateBankAccount,
  validateQueryParams,
  validatePartnerStatusUpdate,
  validateSystemConfig,
  validateInternalUser,
  validateNotification
};

// Default export for backward compatibility
export default {
  validatePartnerRegistration,
  validateBankVerification,
  validateEmail,
  validatePhone,
  validateBankAccount,
  validateQueryParams,
  validatePartnerStatusUpdate,
  validateSystemConfig,
  validateInternalUser,
  validateNotification
};