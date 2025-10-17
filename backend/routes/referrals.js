import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { authenticatePartner, authenticateInternal } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/referrals/create
// @desc    Partner creates referral with auto-generated "CRYPT-XXXXXX" code
// @access  Private (Partner)
router.post('/create', authenticatePartner, async (req, res) => {
  try {
    const {
      prospect_company_name,
      contact_name,
      email,
      phone,
      industry,
      estimated_deal_value
    } = req.body;

    const partnerId = req.partner.id;

    console.log(`📝 Creating referral for partner: ${partnerId}`);
    console.log(`🔐 Authenticated user:`, req.partner);
    console.log(`📦 Request data:`, req.body);

    // Validation
    if (!prospect_company_name || !contact_name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: prospect_company_name, contact_name, email, phone'
      });
    }

    // Check if partner exists and is active (IMPORTANT FOR RLS)
    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('id, is_active, bank_verified')
      .eq('id', partnerId)
      .single();

    console.log(`👤 Partner check:`, { partner, partnerError });

    if (partnerError || !partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    if (!partner.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Partner account is not active. Please complete verification.'
      });
    }

    // Create referral with explicit partner_id matching auth.uid()
    const referralData = {
      partner_id: partnerId, // This MUST match auth.uid() for RLS
      prospect_company_name,
      contact_name,
      email,
      phone,
      industry,
      estimated_deal_value: estimated_deal_value || null,
      status: 'code_sent'
    };

    console.log(`📤 Inserting referral:`, referralData);

    const { data: referral, error: referralError } = await supabase
      .from('referrals')
      .insert(referralData)
      .select(`
        *,
        partners:partner_id (company_name, contact_name)
      `)
      .single();

    if (referralError) {
      console.error('❌ Referral creation error:', {
        code: referralError.code,
        message: referralError.message,
        details: referralError.details,
        hint: referralError.hint
      });
      
      // Specific error handling for RLS
      if (referralError.code === '42501') {
        return res.status(403).json({
          success: false,
          message: 'Permission denied. Please ensure your account is properly verified.',
          code: 'RLS_VIOLATION'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to create referral: ' + referralError.message,
        code: referralError.code
      });
    }

    console.log(`✅ Referral created: ${referral.referral_code}`);

    // Create audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: partnerId,
        user_type: 'partner',
        action: 'create',
        resource_type: 'referrals',
        resource_id: referral.id,
        new_values: referral
      });

    res.status(201).json({
      success: true,
      message: 'Referral created successfully',
      data: {
        referral: {
          id: referral.id,
          referral_code: referral.referral_code,
          prospect_company_name: referral.prospect_company_name,
          contact_name: referral.contact_name,
          email: referral.email,
          status: referral.status,
          created_at: referral.created_at
        },
        shareable_link: `${process.env.FRONTEND_URL}/referral/${referral.referral_code}`
      }
    });

  } catch (error) {
    console.error('💥 Create referral error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating referral'
    });
  }
});

// @route   GET /api/referrals
// @desc    Partner views their referrals with pagination
// @access  Private (Partner)
router.get('/', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.partner.id;
    const { page = 1, limit = 10, status, search } = req.query;
    const offset = (page - 1) * limit;

    console.log(`📋 Fetching referrals for partner: ${partnerId}, page: ${page}`);

    // Build query - FIXED: Correct column names
    let query = supabase
      .from('referrals')
      .select(`
        *,
        leads!referral_id (
          id,
          status,
          created_at,
          last_contact
        )
      `, { count: 'exact' })
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Add status filter if provided
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Add search filter if provided
    if (search) {
      query = query.or(`prospect_company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: referrals, error, count } = await query;

    if (error) {
      console.error('❌ Fetch referrals error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch referrals'
      });
    }

    // Calculate statistics with a separate query to avoid complexity
    const { data: stats } = await supabase
      .from('referrals')
      .select('status, total_commission_earned, total_deal_value')
      .eq('partner_id', partnerId);

    const statusCounts = {
      total: stats?.length || 0,
      code_sent: stats?.filter(r => r.status === 'code_sent').length || 0,
      contacted: stats?.filter(r => r.status === 'contacted').length || 0,
      meeting_scheduled: stats?.filter(r => r.status === 'meeting_scheduled').length || 0,
      proposal_sent: stats?.filter(r => r.status === 'proposal_sent').length || 0,
      negotiation: stats?.filter(r => r.status === 'negotiation').length || 0,
      won: stats?.filter(r => r.status === 'won').length || 0,
      fully_paid: stats?.filter(r => r.status === 'fully_paid').length || 0,
      lost: stats?.filter(r => r.status === 'lost').length || 0
    };

    // Calculate financial totals
    const totalCommission = stats?.reduce((sum, r) => sum + (r.total_commission_earned || 0), 0) || 0;
    const totalDealValue = stats?.reduce((sum, r) => sum + (r.total_deal_value || 0), 0) || 0;

    res.json({
      success: true,
      data: {
        referrals: referrals || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        },
        statistics: statusCounts,
        financial_totals: {
          total_commission: totalCommission,
          total_deal_value: totalDealValue
        }
      }
    });

  } catch (error) {
    console.error('💥 Fetch referrals error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching referrals'
    });
  }
});

// @route   GET /api/referrals/:id
// @desc    Get specific referral details with lead status and activities
// @access  Private (Partner)
router.get('/:id', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.partner.id;
    const referralId = req.params.id;

    console.log(`🔍 Fetching referral details: ${referralId} for partner: ${partnerId}`);

    // Get referral with lead details and activities - USE ADMIN CLIENT
    const { data: referral, error } = await supabaseAdmin
      .from('referrals')
      .select(`
        *,
        leads (
          id,
          status,
          erp_system,
          implementation_timeline,
          estimated_value,
          last_contact,
          assigned_to,
          internal_users:assigned_to (name, email),
          activities:lead_activities (
            id,
            type,
            notes,
            created_at,
            recorded_by
          )
        ),
        client_payments (
          id,
          amount,
          commission_calculated,
          payment_date,
          status,
          created_at
        )
      `)
      .eq('id', referralId)
      .eq('partner_id', partnerId)
      .single();

    if (error || !referral) {
      return res.status(404).json({
        success: false,
        message: 'Referral not found or access denied'
      });
    }

    // Calculate total payments and commission
    const confirmedPayments = referral.client_payments?.filter(p => p.status === 'confirmed') || [];
    const totalPayments = confirmedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const totalCommission = confirmedPayments.reduce((sum, payment) => sum + payment.commission_calculated, 0);

    res.json({
      success: true,
      data: {
        referral: {
          ...referral,
          financial_summary: {
            total_payments: totalPayments,
            total_commission: totalCommission,
            estimated_deal_value: referral.estimated_deal_value
          }
        }
      }
    });

  } catch (error) {
    console.error('💥 Fetch referral details error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching referral details'
    });
  }
});

// @route   GET /api/referrals/stats/dashboard
// @desc    Partner dashboard statistics (counts, totals, earnings)
// @access  Private (Partner)
router.get('/stats/dashboard', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.partner.id;

    console.log(`📊 Fetching dashboard stats for partner: ${partnerId}`);

    // Get referral counts by status
    const { data: referrals, error: referralsError } = await supabase
      .from('referrals')
      .select('status, total_commission_earned, total_deal_value')
      .eq('partner_id', partnerId);

    if (referralsError) {
      console.error('❌ Stats fetch error:', referralsError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard statistics'
      });
    }

    // Calculate statistics
    const totalReferrals = referrals.length;
    const activeReferrals = referrals.filter(r => 
      !['won', 'fully_paid', 'lost'].includes(r.status)
    ).length;

    const totalCommissionEarned = referrals.reduce((sum, r) => 
      sum + (r.total_commission_earned || 0), 0
    );

    const totalDealValue = referrals.reduce((sum, r) => 
      sum + (r.total_deal_value || 0), 0
    );

    // Get recent referrals
    const { data: recentReferrals } = await supabase
      .from('referrals')
      .select('id, prospect_company_name, status, referral_code, created_at')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Get eligible payouts (fully_paid referrals with commission)
    const { data: eligiblePayouts } = await supabase
      .from('referrals')
      .select('total_commission_earned')
      .eq('partner_id', partnerId)
      .eq('status', 'fully_paid')
      .eq('commission_eligible', true);

    const availableForPayout = eligiblePayouts?.reduce((sum, r) => 
      sum + (r.total_commission_earned || 0), 0
    ) || 0;

    res.json({
      success: true,
      data: {
        overview: {
          total_referrals: totalReferrals,
          active_referrals: activeReferrals,
          total_commission_earned: totalCommissionEarned,
          total_deal_value: totalDealValue,
          available_for_payout: availableForPayout
        },
        status_breakdown: {
          code_sent: referrals.filter(r => r.status === 'code_sent').length,
          contacted: referrals.filter(r => r.status === 'contacted').length,
          meeting_scheduled: referrals.filter(r => r.status === 'meeting_scheduled').length,
          proposal_sent: referrals.filter(r => r.status === 'proposal_sent').length,
          negotiation: referrals.filter(r => r.status === 'negotiation').length,
          won: referrals.filter(r => r.status === 'won').length,
          fully_paid: referrals.filter(r => r.status === 'fully_paid').length,
          lost: referrals.filter(r => r.status === 'lost').length
        },
        recent_referrals: recentReferrals || []
      }
    });

  } catch (error) {
    console.error('💥 Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching dashboard statistics'
    });
  }
});


// @route   GET /api/referrals/code/:code
// @desc    Internal: lookup referral by code
// @access  Private (Internal)
router.get('/code/:code', authenticateInternal, async (req, res) => {
  try {
    const { code } = req.params;

    console.log(`🔍 Looking up referral code: ${code}`);

    // Validate code format
    if (!code || !/^CRYPT-[A-Z0-9]{6}$/i.test(code)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid referral code format. Must be CRYPT-XXXXXX'
      });
    }

    const normalizedCode = code.toUpperCase();

    console.log(`🔍 Using ADMIN client to bypass RLS for code: ${normalizedCode}`);

    // Use admin client to bypass RLS
    const { data: referral, error } = await supabaseAdmin
      .from('referrals')
      .select(`
        id,
        referral_code,
        prospect_company_name,
        contact_name,
        email,
        phone,
        industry,
        estimated_deal_value,
        status,
        partner_id,
        partners!referrals_partner_id_fkey (
          id,
          company_name,
          contact_name,
          email,
          phone,
          bank_verified
        )
      `)
      .eq('referral_code', normalizedCode)
      .single();

    if (error) {
      console.error('❌ Referral lookup error with admin client:', error);
      
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: `Referral code "${normalizedCode}" not found in database`
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Database error while looking up referral: ' + error.message
      });
    }

    if (!referral) {
      return res.status(404).json({
        success: false,
        message: 'Referral code not found'
      });
    }

    console.log(`✅ Referral found: ${referral.prospect_company_name}`);

    // Format response data
    const responseData = {
      referral: {
        id: referral.id,
        referral_code: referral.referral_code,
        prospect_company_name: referral.prospect_company_name,
        contact_name: referral.contact_name,
        email: referral.email,
        phone: referral.phone,
        industry: referral.industry,
        estimated_deal_value: referral.estimated_deal_value,
        status: referral.status
      },
      partner: referral.partners
    };

    res.json({
      success: true,
      message: 'Referral code verified successfully! 🎉',
      data: responseData
    });

  } catch (error) {
    console.error('💥 Referral lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while looking up referral'
    });
  }
});


export default router;