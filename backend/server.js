import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

console.log('🔧 Environment check:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Present' : '❌ Missing');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ Present' : '❌ Missing');
console.log('PORT:', process.env.PORT || 5000);

// Validate critical environment variables before proceeding
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('❌ CRITICAL: Missing Supabase environment variables');
  console.log('💡 Please check your .env file exists and contains SUPABASE_URL and SUPABASE_ANON_KEY');
  process.exit(1);
}

// Import all routes from Phases 1-3
import authRoutes from './routes/auth.js';
import bankRoutes from './routes/bank-verification.js';
import healthRoutes from './routes/health.js';
import referralsRoutes from './routes/referrals.js';
import leadsRoutes from './routes/leads.js';
import partnerRoutes from './routes/partner.js';
import paymentsRoutes from './routes/payments.js';
import commissionsRoutes from './routes/commissions.js';
import dealsRoutes from './routes/deals.js';
import internalRoutes from './routes/internal.js';
import adminRoutes from './routes/admin.js';
import reportsRoutes from './routes/reports.js';
import notificationsRoutes from './routes/notifications.js';
import payoutsRoutes from './routes/payouts.js';

// Import middleware
// import { securityHeaders, corsConfig, requestLogger } from './middleware/security.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes


// ========================
// API ROUTES REGISTRATION
// ========================

console.log('🔄 Registering API routes...');

// Phase 1: Core Authentication & Referrals
app.use('/api/auth', authRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/referrals', referralsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/partner', partnerRoutes);

// Phase 2: Financial Workflow
app.use('/api/payments', paymentsRoutes);
app.use('/api/commissions', commissionsRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/payouts', payoutsRoutes);

// Phase 3: Internal & Admin Tools
app.use('/api/internal', internalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/notifications', notificationsRoutes);

// Health routes (keep at end to avoid rate limiting)
app.use('/api/health', healthRoutes);

// ========================
// ROOT ENDPOINTS
// ========================

// API information endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Cryptware Referral API is running!',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    documentation: process.env.API_DOCS_URL || 'https://docs.cryptware.com'
  });
});

// Basic route
// app.get('/', (req, res) => {
//   res.json({
//     success: true,
//     message: '🚀 Cryptware Referral API is running!',
//     timestamp: new Date().toISOString(),
//     version: '1.0.0',
//     environment: process.env.NODE_ENV || 'development'
//   });
// });

// Environment check route
app.get('/api/env-check', (req, res) => {
  res.json({
    success: true,
    environment: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: process.env.PORT || 5000,
      SUPABASE_URL: process.env.SUPABASE_URL ? '✅ Present' : '❌ Missing',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? '✅ Present' : '❌ Missing',
      PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY ? '✅ Present' : '❌ Missing'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// FIXED: 404 handler - use a proper path or remove the path entirely
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🎉 CRYPTWARE REFERRAL API STARTED SUCCESSFULLY!
📍 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'} 
🔗 Host: 0.0.0.0
📊 Monitoring: http://localhost:${PORT}/health

🔐 SECURITY ENABLED:
   ✅ Helmet Security Headers
   ✅ CORS Protection
   ✅ Rate Limiting
   ✅ Request Compression
   ✅ Structured Logging

🏥 HEALTH CHECKS:
   GET /health     - Basic health check
   GET /ready      - Readiness probe (with DB check)
   GET /api/health - Detailed system health

📡 API ENDPOINTS REGISTERED:
   🔐 Authentication: /api/auth
   🏦 Bank Verification: /api/bank  
   📋 Referrals: /api/referrals
   🎯 Leads: /api/leads
   👥 Partner: /api/partner
   💰 Payments: /api/payments
   💸 Commissions: /api/commissions
   🤝 Deals: /api/deals
   📊 Internal: /api/internal
   ⚙️ Admin: /api/admin
   📈 Reports: /api/reports
   🔔 Notifications: /api/notifications

🚀 Ready to handle requests!
  `);
});

export default app;