import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { authenticateUser, authenticatePartner } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/partner/dashboard
// @desc    Partner main dashboard (stats, recent referrals, earnings)
// @access  Private (Partner)
router.get('/dashboard', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.user.id;

    console.log(`📊 Fetching partner dashboard: ${partnerId}`);

    // Get comprehensive dashboard data
    const [ 
      referralsResponse,
      payoutsResponse,
      recentActivityResponse,
      eligiblePayoutsResponse
    ] = await Promise.all([
      // Referrals statistics
      supabase
        .from('referrals')
        .select('status, total_commission_earned, total_deal_value, created_at')
        .eq('partner_id', partnerId),

      // Payouts summary
      supabase
        .from('partner_payouts')
        .select('amount, status, requested_at')
        .eq('partner_id', partnerId),

      // Recent referrals
      supabase
        .from('referrals')
        .select(`
          id,
          prospect_company_name,
          referral_code,
          status,
          total_commission_earned,
          created_at
        `)
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })
        .limit(5),

      // Eligible payouts (fully_paid referrals with commission, payout not requested)
      supabase
        .from('referrals')
        .select('id, prospect_company_name, total_commission_earned, payout_requested')
        .eq('partner_id', partnerId)
        .eq('status', 'fully_paid')
        .eq('commission_eligible', true)
        .eq('payout_requested', false)
    ]);

    if (referralsResponse.error) {
      console.error('❌ Dashboard data error:', referralsResponse.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard data'
      });
    }

    const referrals = referralsResponse.data || [];
    const payouts = payoutsResponse.data || [];
    const recentReferrals = recentActivityResponse.data || [];
    const eligiblePayouts = eligiblePayoutsResponse.data || [];

    // Calculate comprehensive statistics
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

    // Calculate available for payout (fully_paid referrals with commission)
    const eligibleReferrals = referrals.filter(r => 
      r.status === 'fully_paid' && r.total_commission_earned > 0
    );
    const availableForPayout = eligibleReferrals.reduce((sum, r) => 
      sum + (r.total_commission_earned || 0), 0
    );

    // Payout statistics
    const totalPaidOut = payouts
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const pendingPayouts = payouts
      .filter(p => p.status === 'pending' || p.status === 'processing')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // Monthly commission trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: monthlyCommissions } = await supabase
      .from('referrals')
      .select('total_commission_earned, created_at')
      .eq('partner_id', partnerId)
      .gte('created_at', sixMonthsAgo.toISOString());

    // ✅ FIXED: Remove "this." - call the standalone function directly
    const monthlyTrend = calculateMonthlyTrend(monthlyCommissions || []);

    // Calculate referral breakdown
    const referralsBreakdown = {
      code_sent: referrals.filter(r => r.status === 'code_sent').length,
      contacted: referrals.filter(r => r.status === 'contacted').length,
      meeting_scheduled: referrals.filter(r => r.status === 'meeting_scheduled').length,
      proposal_sent: referrals.filter(r => r.status === 'proposal_sent').length,
      negotiation: referrals.filter(r => r.status === 'negotiation').length,
      won: referrals.filter(r => r.status === 'won').length,
      fully_paid: referrals.filter(r => r.status === 'fully_paid').length,
      lost: referrals.filter(r => r.status === 'lost').length
    };

    // Check quick actions
    const quickActions = {
      can_create_referral: true,
      can_request_payout: eligiblePayouts.length > 0,
      has_pending_verification: false,
      eligible_payouts_count: eligiblePayouts.length,
      eligible_payouts_amount: eligiblePayouts.reduce((sum, r) => sum + (r.total_commission_earned || 0), 0)
    };

    res.json({
      success: true,
      data: {
        overview: {
          total_referrals: totalReferrals,
          active_referrals: activeReferrals,
          total_commission_earned: totalCommissionEarned,
          total_deal_value: totalDealValue,
          available_for_payout: availableForPayout,
          total_paid_out: totalPaidOut,
          pending_payouts: pendingPayouts
        },
        referrals_breakdown: referralsBreakdown,
        recent_referrals: recentReferrals,
        monthly_trend: monthlyTrend,
        quick_actions: quickActions,
        payout_eligibility: {
          eligible_count: eligiblePayouts.length,
          eligible_amount: eligiblePayouts.reduce((sum, r) => sum + (r.total_commission_earned || 0), 0),
          referrals: eligiblePayouts
        }
      }
    });

  } catch (error) {
    console.error('💥 Partner dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while loading dashboard'
    });
  }
});

// @route   GET /api/partner/profile
// @desc    Get partner profile with bank details
// @access  Private (Partner)
router.get('/profile', authenticateUser, async (req, res) => {
  try {
    const partnerId = req.partner.id;

    console.log(`👤 Fetching partner profile: ${partnerId}`);

    const { data: partner, error } = await supabase
      .from('partners')
      .select('*')
      .eq('id', partnerId)
      .single();

    if (error || !partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner profile not found'
      });
    }

    // Remove sensitive data
    const { password_hash, ...safePartnerData } = partner;

    res.json({
      success: true,
      data: {
        partner: safePartnerData
      }
    });

  } catch (error) {
    console.error('💥 Fetch profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching profile'
    });
  }
});

// @route   PUT /api/partner/profile
// @desc    Update partner contact information
// @access  Private (Partner)
router.put('/profile', authenticateUser, async (req, res) => {
  try {
    const partnerId = req.partner.id;
    const {
      contact_name,
      phone,
      address
    } = req.body;

    console.log(`✏️ Updating partner profile: ${partnerId}`);

    // Validation
    if (!contact_name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Contact name and phone are required'
      });
    }

    const { data: partner, error } = await supabase
      .from('partners')
      .update({
        contact_name,
        phone,
        address,
        updated_at: new Date().toISOString()
      })
      .eq('id', partnerId)
      .select()
      .single();

    if (error || !partner) {
      console.error('❌ Profile update error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update profile: ' + error?.message
      });
    }

    // Remove sensitive data
    const { password_hash, ...safePartnerData } = partner;

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: partnerId,
        user_type: 'partner',
        action: 'update',
        resource_type: 'partners',
        resource_id: partnerId,
        new_values: safePartnerData
      });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        partner: safePartnerData
      }
    });

  } catch (error) {
    console.error('💥 Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating profile'
    });
  }
});

// @route   GET /api/partner/commissions
// @desc    Commission overview and pending earnings
// @access  Private (Partner)
router.get('/commissions', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.partner.id;

    console.log(`💰 Fetching commission data for partner: ${partnerId}`);

    const [
      referralsResponse,
      payoutsResponse
    ] = await Promise.all([
      // Referrals with commissions - USE ADMIN CLIENT
      supabaseAdmin
        .from('referrals')
        .select(`
          id,
          prospect_company_name,
          referral_code,
          status,
          estimated_deal_value,
          total_commission_earned,
          total_deal_value,
          commission_eligible,
          created_at
        `)
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false }),

      // Payout history - USE ADMIN CLIENT
      supabaseAdmin
        .from('partner_payouts')
        .select('*')
        .eq('partner_id', partnerId)
        .order('requested_at', { ascending: false })
    ]);

    if (referralsResponse.error) {
      console.error('❌ Commission data error:', referralsResponse.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch commission data'
      });
    }

    const referrals = referralsResponse.data || [];
    const payouts = payoutsResponse.data || [];

    // Calculate commission summary
    const totalCommissionEarned = referrals.reduce((sum, r) => 
      sum + (r.total_commission_earned || 0), 0
    );

    const availableForPayout = referrals
      .filter(r => r.commission_eligible && r.total_commission_earned > 0)
      .reduce((sum, r) => sum + (r.total_commission_earned || 0), 0);

    const totalPaidOut = payouts
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const pendingCommission = referrals
      .filter(r => !r.commission_eligible && r.total_commission_earned > 0)
      .reduce((sum, r) => sum + (r.total_commission_earned || 0), 0);

    console.log(`💰 Commission Summary for partner ${partnerId}:`, {
      totalCommissionEarned,
      availableForPayout,
      totalPaidOut,
      pendingCommission,
      referralCount: referrals.length
    });

    res.json({
      success: true,
      data: {
        summary: {
          total_commission_earned: totalCommissionEarned,
          available_for_payout: availableForPayout,
          total_paid_out: totalPaidOut,
          pending_commission: pendingCommission
        },
        referrals: referrals.map(r => ({
          id: r.id,
          prospect_company_name: r.prospect_company_name,
          referral_code: r.referral_code,
          status: r.status,
          estimated_deal_value: r.estimated_deal_value, // Agreed value
          total_deal_value: r.total_deal_value, // Actual payments received
          commission_earned: r.total_commission_earned,
          commission_eligible: r.commission_eligible
        })),
        payouts: payouts
      }
    });

  } catch (error) {
    console.error('💥 Commission data error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching commission data'
    });
  }
});

// ✅ FIXED: This is a standalone function, not a method
function calculateMonthlyTrend(commissions) {
  const monthlyData = {};
  
  commissions.forEach(commission => {
    const date = new Date(commission.created_at);
    const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthYear]) {
      monthlyData[monthYear] = 0;
    }
    
    monthlyData[monthYear] += commission.total_commission_earned || 0;
  });

  // Convert to array and sort by date
  return Object.entries(monthlyData)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6); // Last 6 months
}

export default router;