// Validation middleware for common inputs
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
  
  module.exports = {
    validatePartnerRegistration,
    validateBankVerification,
    validateEmail,
    validatePhone,
    validateBankAccount
  };