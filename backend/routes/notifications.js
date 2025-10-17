import express from 'express';
import { authenticatePartner, authenticateInternal, authenticateUser } from '../middleware/auth.js';
import { validateNotification } from '../middleware/validation.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// @route   POST /api/notifications
// @desc    Send notifications to partners or internal users
// @access  Private (Internal)
router.post('/', authenticateInternal, validateNotification, async (req, res) => {
  try {
    const internalUserId = req.internalUser.id;
    const { user_id, user_type, type, title, message, metadata } = req.body;

    console.log(`📢 Sending notification: ${type} to ${user_type}`);

    let notificationData;

    if (user_type === 'all') {
      // Send to all partners
      const { data: partners } = await supabase
        .from('partners')
        .select('id')
        .eq('is_active', true);

      const notifications = (partners || []).map(partner => ({
        user_id: partner.id,
        user_type: 'partner',
        type,
        title,
        message,
        metadata: {
          ...metadata,
          sent_by: internalUserId,
          broadcast: true
        }
      }));

      const { data: createdNotifications, error } = await supabase
        .from('notifications')
        .insert(notifications)
        .select();

      if (error) throw error;

      notificationData = createdNotifications;

    } else {
      // Send to specific user or user type
      const { data: notification, error } = await supabase
        .from('notifications')
        .insert({
          user_id: user_id || null,
          user_type,
          type,
          title,
          message,
          metadata: {
            ...metadata,
            sent_by: internalUserId
          }
        })
        .select()
        .single();

      if (error) throw error;

      notificationData = [notification];
    }

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'create',
        resource_type: 'notifications',
        notes: `Notification sent: ${type} to ${user_type}${user_id ? ` (user: ${user_id})` : ''}`
      });

    res.status(201).json({
      success: true,
      message: `Notification sent successfully to ${notificationData.length} recipient(s)`,
      data: {
        notifications: notificationData
      }
    });

  } catch (error) {
    console.error('💥 Send notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while sending notification'
    });
  }
});

// @route   GET /api/notifications
// @desc    Get notifications (role-based)
// @access  Private (Partner/Internal)
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unread_only = 'false', type } = req.query;
    const offset = (page - 1) * limit;

    // Determine user type
    const [partner, internal] = await Promise.all([
      supabase.from('partners').select('id').eq('id', userId).single(),
      supabase.from('internal_users').select('id').eq('id', userId).single()
    ]);

    const userType = partner.data ? 'partner' : internal.data ? 'internal' : null;

    if (!userType) {
      return res.status(403).json({
        success: false,
        message: 'User type not determined'
      });
    }

    // Build query based on user type
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .or(`user_id.eq.${userId},user_type.eq.${userType},user_type.eq.all`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unread_only === 'true') {
      query = query.is('read_at', null);
    }

    if (type) {
      query = query.eq('type', type);
    }

    const { data: notifications, error, count } = await query;

    if (error) throw error;

    // Get unread count
    const { data: unreadNotifications } = await supabase
      .from('notifications')
      .select('id')
      .or(`user_id.eq.${userId},user_type.eq.${userType},user_type.eq.all`)
      .is('read_at', null);

    res.json({
      success: true,
      data: {
        notifications: notifications || [],
        unread_count: unreadNotifications?.length || 0,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('💥 Notifications fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching notifications'
    });
  }
});

// @route   PATCH /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private (Partner/Internal)
router.patch('/:id/read', async (req, res) => {
  try {
    const notificationId = req.params.id;
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    let userId;

    // Try to authenticate as partner first
    try {
      const partnerReq = { headers: { authorization: authHeader } };
      const partnerRes = { json: () => {} };
      await authenticatePartner(partnerReq, partnerRes, () => {
        userId = partnerReq.partner.id;
      });
    } catch (partnerError) {
      // If partner auth fails, try internal auth
      try {
        const internalReq = { headers: { authorization: authHeader } };
        const internalRes = { json: () => {} };
        await authenticateInternal(internalReq, internalRes, () => {
          userId = internalReq.internalUser.id;
        });
      } catch (internalError) {
        return res.status(401).json({
          success: false,
          message: 'Invalid authentication'
        });
      }
    }

    console.log(`📝 Marking notification as read: ${notificationId} by user: ${userId}`);

    // Verify notification exists and belongs to user
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .or(`user_id.eq.${userId},user_type.eq.all`)
      .single();

    if (fetchError || !notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or access denied'
      });
    }

    // Mark as read
    const { data: updatedNotification, error } = await supabase
      .from('notifications')
      .update({
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .select()
      .single();

    if (error) {
      console.error('❌ Mark read error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: { notification: updatedNotification }
    });

  } catch (error) {
    console.error('💥 Mark read error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while marking notification as read'
    });
  }
});

export default router;