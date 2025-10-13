import express from 'express';
import { authenticateInternal } from '../middleware/auth.js';
import { validateSystemConfig, validateInternalUser } from '../middleware/validation.js';

const router = express.Router();

// Require admin role for all routes
const requireAdmin = (req, res, next) => {
  if (req.internalUser.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// @route   GET /api/admin/config
// @desc    System configuration
// @access  Private (Admin)
router.get('/config', authenticateInternal, requireAdmin, async (req, res) => {
  try {
    console.log('⚙️ Fetching system configuration');

    const { data: config, error } = await supabase
      .from('system_config')
      .select('*')
      .eq('is_active', true)
      .order('config_key');

    if (error) {
      console.error('❌ Config fetch error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch system configuration'
      });
    }

    // Convert to key-value object
    const configObject = (config || []).reduce((acc, item) => {
      acc[item.config_key] = {
        value: item.config_value,
        description: item.description,
        id: item.id
      };
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        config: configObject,
        last_updated: config?.[0]?.updated_at || new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 Config fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching configuration'
    });
  }
});

// @route   PATCH /api/admin/config
// @desc    Update system settings
// @access  Private (Admin)
router.patch('/config', authenticateInternal, requireAdmin, validateSystemConfig, async (req, res) => {
  try {
    const internalUserId = req.internalUser.id;
    const updates = req.body;

    console.log('⚙️ Updating system configuration:', Object.keys(updates));

    const updatePromises = Object.entries(updates).map(([key, value]) => 
      supabase
        .from('system_config')
        .update({
          config_value: value.toString(),
          updated_at: new Date().toISOString()
        })
        .eq('config_key', key)
    );

    const results = await Promise.all(updatePromises);
    
    const errors = results.filter(result => result.error);
    if (errors.length > 0) {
      console.error('❌ Config update errors:', errors);
      return res.status(500).json({
        success: false,
        message: 'Failed to update some configuration settings'
      });
    }

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'update',
        resource_type: 'system_config',
        notes: `System configuration updated: ${Object.keys(updates).join(', ')}`
      });

    res.json({
      success: true,
      message: 'System configuration updated successfully',
      data: {
        updated_keys: Object.keys(updates),
        updated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 Config update error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating configuration'
    });
  }
});

// @route   GET /api/admin/audit-logs
// @desc    Audit trail access
// @access  Private (Admin)
router.get('/audit-logs', authenticateInternal, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      user_id, 
      user_type, 
      action,
      date_from,
      date_to 
    } = req.query;

    const offset = (page - 1) * limit;

    console.log('📋 Fetching audit logs', { user_id, user_type, action });

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (user_id) query = query.eq('user_id', user_id);
    if (user_type) query = query.eq('user_type', user_type);
    if (action) query = query.eq('action', action);
    if (date_from) query = query.gte('created_at', date_from);
    if (date_to) query = query.lte('created_at', date_to);

    const { data: logs, error, count } = await query;

    if (error) {
      console.error('❌ Audit logs error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch audit logs'
      });
    }

    res.json({
      success: true,
      data: {
        logs: logs || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('💥 Audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching audit logs'
    });
  }
});

// @route   GET /api/admin/health
// @desc    System health monitoring
// @access  Private (Admin)
router.get('/health', authenticateInternal, requireAdmin, async (req, res) => {
  try {
    console.log('❤️ Performing system health check');

    // Check database connectivity
    const dbCheckStart = Date.now();
    const { data: dbData, error: dbError } = await supabase
      .from('system_config')
      .select('config_key')
      .limit(1);
    const dbResponseTime = Date.now() - dbCheckStart;

    // Check recent activity
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const [
      recentReferrals,
      recentPayments,
      recentLogs
    ] = await Promise.all([
      supabase
        .from('referrals')
        .select('id')
        .gte('created_at', oneHourAgo.toISOString()),
      supabase
        .from('client_payments')
        .select('id')
        .gte('created_at', oneHourAgo.toISOString()),
      supabase
        .from('audit_logs')
        .select('id')
        .gte('created_at', oneHourAgo.toISOString())
    ]);

    const healthStatus = {
      database: {
        status: dbError ? 'unhealthy' : 'healthy',
        response_time: dbResponseTime,
        error: dbError?.message
      },
      activity: {
        referrals_last_hour: recentReferrals.data?.length || 0,
        payments_last_hour: recentPayments.data?.length || 0,
        logs_last_hour: recentLogs.data?.length || 0
      },
      system: {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      }
    };

    const overallStatus = dbError ? 'degraded' : 'healthy';

    res.json({
      success: true,
      data: {
        status: overallStatus,
        ...healthStatus
      }
    });

  } catch (error) {
    console.error('💥 Health check error:', error);
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
});

// @route   GET /api/admin/users
// @desc    Internal user management
// @access  Private (Admin)
router.get('/users', authenticateInternal, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'active' } = req.query;
    const offset = (page - 1) * limit;

    console.log('👥 Fetching internal users');

    let query = supabase
      .from('internal_users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    }

    const { data: users, error, count } = await query;

    if (error) {
      console.error('❌ Users fetch error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch internal users'
      });
    }

    res.json({
      success: true,
      data: {
        users: users || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('💥 Users fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching users'
    });
  }
});

// @route   POST /api/admin/users
// @desc    Create internal users
// @access  Private (Admin)
router.post('/users', authenticateInternal, requireAdmin, validateInternalUser, async (req, res) => {
  try {
    const internalUserId = req.internalUser.id;
    const { name, email, role, is_active } = req.body;

    console.log('👥 Creating internal user:', email);

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('internal_users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create user in auth and internal_users
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: generateTemporaryPassword(),
      options: {
        data: {
          user_type: 'internal',
          name: name,
          role: role
        }
      }
    });

    if (authError) {
      console.error('❌ Auth creation error:', authError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create authentication user: ' + authError.message
      });
    }

    // Create internal user record
    const { data: user, error: userError } = await supabase
      .from('internal_users')
      .insert({
        id: authData.user.id,
        name,
        email,
        role,
        is_active: is_active !== undefined ? is_active : true
      })
      .select()
      .single();

    if (userError) {
      console.error('❌ User creation error:', userError);
      // Cleanup auth user
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({
        success: false,
        message: 'Failed to create internal user: ' + userError.message
      });
    }

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'create',
        resource_type: 'internal_users',
        resource_id: user.id,
        new_values: user
      });

    res.status(201).json({
      success: true,
      message: 'Internal user created successfully',
      data: { user }
    });

  } catch (error) {
    console.error('💥 User creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating user'
    });
  }
});

// @route   PATCH /api/admin/users/:id
// @desc    Update internal users
// @access  Private (Admin)
router.patch('/users/:id', authenticateInternal, requireAdmin, validateInternalUser, async (req, res) => {
  try {
    const userId = req.params.id;
    const internalUserId = req.internalUser.id;
    const updates = req.body;

    console.log('👥 Updating internal user:', userId);

    // Get current user for audit
    const { data: currentUser, error: fetchError } = await supabase
      .from('internal_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError || !currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user
    const { data: user, error } = await supabase
      .from('internal_users')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('❌ User update error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update user: ' + error.message
      });
    }

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'update',
        resource_type: 'internal_users',
        resource_id: userId,
        old_values: currentUser,
        new_values: user
      });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('💥 User update error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating user'
    });
  }
});

// Helper function to generate temporary password
function generateTemporaryPassword() {
  return 'Temp123!' + Math.random().toString(36).slice(-8);
}

export default router;