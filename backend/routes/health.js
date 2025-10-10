import express from 'express';
import { supabaseAdmin } from '../config/supabase-admin.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // Check database connection with ADMIN client
    const { data, error } = await supabaseAdmin
      .from('system_config')
      .select('config_key')
      .limit(1);

    const dbStatus = error ? 'disconnected' : 'connected';

    res.json({
      success: true,
      message: 'Cryptware Referral API is running',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: dbStatus,
      version: '1.0.0'
    });

  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      message: 'Service unhealthy',
      error: error.message
    });
  }
});

export default router;