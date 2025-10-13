import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { supabase } from '../config/supabase.js';

// Security headers configuration
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for API
});

// CORS configuration for production
export const corsConfig = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5500',
      'https://cryptware.com',
      'https://www.cryptware.com',
      'https://partner.cryptware.com',
      'https://admin.cryptware.com'
    ];

    // Add dynamic origins from environment
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }
    if (process.env.ADMIN_URL) {
      allowedOrigins.push(process.env.ADMIN_URL);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn('🚫 CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key',
    'Accept',
    'Origin'
  ],
  maxAge: 86400, // 24 hours
};

// Rate limiting configurations
export const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message: message || 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use IP + user agent for more accurate rate limiting
      return req.ip + '-' + (req.get('User-Agent') || 'unknown');
    },
    skip: (req) => {
      // Skip rate limiting for health checks and certain IPs
      if (req.path === '/health' || req.path === '/ready') return true;
      if (process.env.WHITELISTED_IPS?.includes(req.ip)) return true;
      return false;
    }
  });
};

// Specific rate limiters
export const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts per 15 minutes
  'Too many authentication attempts, please try again in 15 minutes.'
);

export const generalRateLimit = createRateLimit(
  1 * 60 * 1000, // 1 minute
  100, // 100 requests per minute
  'Too many requests, please slow down.'
);

export const strictRateLimit = createRateLimit(
  1 * 60 * 1000, // 1 minute
  10, // 10 requests per minute for sensitive endpoints
  'Too many requests to this endpoint, please try again later.'
);

// Request logging middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  // Add request ID to request object
  req.id = requestId;

  // Log request details
  console.log(`📥 [${requestId}] ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    timestamp: new Date().toISOString()
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'ERROR' : 'INFO';
    
    console.log(`📤 [${requestId}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      timestamp: new Date().toISOString()
    });

    // Log to Supabase for production monitoring
    if (process.env.NODE_ENV === 'production') {
      logRequestToDatabase({
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      }).catch(err => {
        console.error('Failed to log request to database:', err);
      });
    }
  });

  next();
};

// Input sanitization middleware
export const sanitizeInput = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params) {
    sanitizeObject(req.params);
  }

  next();
};

// Helper function to sanitize objects recursively
function sanitizeObject(obj) {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      // Basic XSS prevention
      obj[key] = obj[key]
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
      
      // SQL injection prevention (basic)
      obj[key] = obj[key].replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC)\b)/gi, '');
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

// API Key authentication middleware
export const requireApiKey = async (req, res, next) => {
  const apiKey = req.get('X-API-Key');
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'API key required'
    });
  }

  // In a real implementation, you'd validate against a database
  // For now, we'll use environment variable
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({
      success: false,
      message: 'Invalid API key'
    });
  }

  next();
};

// Database logging function
async function logRequestToDatabase(logData) {
  try {
    const { error } = await supabase
      .from('request_logs')
      .insert({
        request_id: logData.requestId,
        method: logData.method,
        path: logData.path,
        status_code: logData.statusCode,
        duration_ms: logData.duration,
        ip_address: logData.ip,
        user_agent: logData.userAgent,
        created_at: logData.timestamp
      });

    if (error) {
      console.error('Failed to log request:', error);
    }
  } catch (error) {
    console.error('Error logging request to database:', error);
  }
}

// Export security middleware stack
export const securityMiddleware = [
  securityHeaders,
  cors(corsConfig),
  requestLogger,
  sanitizeInput
];

export default {
  securityHeaders,
  corsConfig,
  createRateLimit,
  authRateLimit,
  generalRateLimit,
  strictRateLimit,
  requestLogger,
  sanitizeInput,
  requireApiKey,
  securityMiddleware
};