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

// Now import routes AFTER environment validation
import authRoutes from './routes/auth.js';
import bankRoutes from './routes/bank-verification.js';
import healthRoutes from './routes/health.js';

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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
app.use('/api/auth', authRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/health', healthRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Cryptware Referral API is running!',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

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

app.listen(PORT, () => {
  console.log(`
🎉 SERVER STARTED SUCCESSFULLY!
📍 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Supabase: ${process.env.SUPABASE_URL ? '✅ Connected' : '❌ Missing'}

📡 Available Endpoints:
   GET  /              - Health check
   GET  /api/env-check - Environment check
   GET  /api/health    - Detailed health
   GET  /api/auth/test - Auth test
   GET  /api/bank/test - Bank test
   POST /api/auth/register - Partner registration
  `);
});

export default app;