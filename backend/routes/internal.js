import express from 'express';
import { authenticateInternal } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { validateQueryParams } from '../middleware/validation.js';

const router = express.Router();

// @route   GET /api/internal/dashboard
// @desc    Executive dashboard with key metrics
// @access  Private (Internal)
router.get('/dashboard', authenticateInternal, async (req, res) => {
  try {
    const { period = 'month' } = req.query; // month, quarter, year

    console.log(`📊 Generating executive dashboard for period: ${period}`);

    // Get comprehensive dashboard data in parallel
    const [
      referralsResponse,
      paymentsResponse,
      partnersResponse,
      leadsResponse
    ] = await Promise.all([
      // Referral metrics
      supabase
        .from('referrals')
        .select('status, created_at, total_deal_value, total_commission_earned'),
      
      // Payment metrics
      supabase
        .from('client_payments')
        .select('amount, commission_calculated, payment_date, status'),
      
      // Partner metrics
      supabase
        .from('partners')
        .select('id, company_name, is_active, bank_verified, total_commissions_earned, created_at'),
      
      // Lead metrics
      supabase
        .from('leads')
        .select('status, source, created_at, estimated_value')
    ]);

    if (referralsResponse.error || paymentsResponse.error) {
      console.error('❌ Dashboard data error:', referralsResponse.error || paymentsResponse.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate dashboard data'
      });
    }

    const referrals = referralsResponse.data || [];
    const payments = paymentsResponse.data || [];
    const partners = partnersResponse.data || [];
    const leads = leadsResponse.data || [];

    // Calculate key metrics
    const confirmedPayments = payments.filter(p => p.status === 'confirmed');
    
    const metrics = {
      financial: {
        total_revenue: confirmedPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
        total_commission: confirmedPayments.reduce((sum, p) => sum + (p.commission_calculated || 0), 0),
        net_revenue: confirmedPayments.reduce((sum, p) => sum + (p.amount || 0) - (p.commission_calculated || 0), 0),
        average_deal_size: referrals.length > 0 ? referrals.reduce((sum, r) => sum + (r.total_deal_value || 0), 0) / referrals.length : 0
      },
      performance: {
        total_referrals: referrals.length,
        active_referrals: referrals.filter(r => !['won', 'fully_paid', 'lost'].includes(r.status)).length,
        conversion_rate: referrals.length > 0 ? (referrals.filter(r => ['won', 'fully_paid'].includes(r.status)).length / referrals.length) * 100 : 0,
        total_leads: leads.length,
        lead_conversion_rate: leads.length > 0 ? (leads.filter(l => l.status === 'converted').length / leads.length) * 100 : 0
      },
      partners: {
        total_partners: partners.length,
        active_partners: partners.filter(p => p.is_active).length,
        verified_partners: partners.filter(p => p.bank_verified).length,
        top_performers: partners
          .filter(p => p.total_commissions_earned > 0)
          .sort((a, b) => (b.total_commissions_earned || 0) - (a.total_commissions_earned || 0))
          .slice(0, 5)
          .map(p => ({
            company_name: p.company_name,
            total_commissions: p.total_commissions_earned,
            is_verified: p.bank_verified
          }))
      }
    };

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentReferrals = referrals.filter(r => new Date(r.created_at) >= thirtyDaysAgo).length;
    const recentPayments = confirmedPayments.filter(p => new Date(p.payment_date) >= thirtyDaysAgo).length;

    metrics.recent_activity = {
      referrals_last_30_days: recentReferrals,
      payments_last_30_days: recentPayments,
      new_partners_last_30_days: partners.filter(p => new Date(p.created_at) >= thirtyDaysAgo).length
    };

    res.json({
      success: true,
      data: {
        metrics,
        period,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating dashboard'
    });
  }
});

// @route   GET /api/internal/analytics
// @desc    Flexible analytics with query parameters
// @access  Private (Internal)
router.get('/analytics', authenticateInternal, async (req, res) => {
  try {
    const { 
      type = 'overview', 
      date_from, 
      date_to, 
      partner_id,
      group_by = 'month' 
    } = req.query;

    console.log(`📈 Generating analytics: ${type}`, { date_from, date_to, partner_id });

    let analyticsData = {};

    switch (type) {
      case 'referral_conversion':
        analyticsData = await getReferralConversionAnalytics(date_from, date_to);
        break;
      
      case 'revenue_trends':
        analyticsData = await getRevenueTrendsAnalytics(date_from, date_to, group_by);
        break;
      
      case 'partner_performance':
        analyticsData = await getPartnerPerformanceAnalytics(date_from, date_to, partner_id);
        break;
      
      case 'lead_sources':
        analyticsData = await getLeadSourcesAnalytics(date_from, date_to);
        break;
      
      default:
        analyticsData = await getOverviewAnalytics(date_from, date_to);
    }

    res.json({
      success: true,
      data: {
        type,
        date_range: { date_from, date_to },
        ...analyticsData
      }
    });

  } catch (error) {
    console.error('💥 Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating analytics'
    });
  }
});

// @route   GET /api/internal/performance
// @desc    Team & partner performance metrics
// @access  Private (Internal)
router.get('/performance', authenticateInternal, async (req, res) => {
  try {
    const { period = 'month', team_member_id } = req.query;

    console.log(`🎯 Generating performance metrics for period: ${period}`);

    // Get team performance
    const { data: teamPerformance, error: teamError } = await supabase
      .from('leads')
      .select(`
        assigned_to,
        status,
        created_at,
        estimated_value,
        internal_users:assigned_to (name, email)
      `)
      .not('assigned_to', 'is', null);

    if (teamError) {
      console.error('❌ Team performance error:', teamError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch team performance data'
      });
    }

    // Calculate team metrics
    const teamMetrics = calculateTeamPerformance(teamPerformance || [], period, team_member_id);

    // Get partner performance
    const { data: partnerPerformance, error: partnerError } = await supabase
      .from('referrals')
      .select(`
        partner_id,
        status,
        total_deal_value,
        total_commission_earned,
        created_at,
        partners:partner_id (company_name, contact_name, email)
      `)
      .not('partner_id', 'is', null);

    if (partnerError) {
      console.error('❌ Partner performance error:', partnerError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch partner performance data'
      });
    }

    // Calculate partner metrics
    const partnerMetrics = calculatePartnerPerformance(partnerPerformance || [], period);

    res.json({
      success: true,
      data: {
        team_performance: teamMetrics,
        partner_performance: partnerMetrics,
        period
      }
    });

  } catch (error) {
    console.error('💥 Performance metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating performance metrics'
    });
  }
});

// @route   GET /api/internal/partners
// @desc    Partner directory with performance data and filtering
// @access  Private (Internal)
router.get('/partners', authenticateInternal, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      performance,
      search 
    } = req.query;

    const offset = (page - 1) * limit;

    console.log(`📋 Fetching partners directory`, { status, performance, search });

    // Build base query
    let query = supabase
      .from('partners')
      .select(`
        *,
        referrals:referrals!partner_id (
          status,
          total_deal_value,
          total_commission_earned,
          created_at
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status && status !== 'all') {
      if (status === 'active') query = query.eq('is_active', true);
      else if (status === 'inactive') query = query.eq('is_active', false);
      else if (status === 'verified') query = query.eq('bank_verified', true);
      else if (status === 'unverified') query = query.eq('bank_verified', false);
    }

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: partners, error, count } = await query;

    if (error) {
      console.error('❌ Partners directory error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch partners directory'
      });
    }

    // Calculate performance metrics for each partner
    const partnersWithPerformance = (partners || []).map(partner => {
      const partnerReferrals = partner.referrals || [];
      
      const performance = {
        total_referrals: partnerReferrals.length,
        successful_referrals: partnerReferrals.filter(r => ['won', 'fully_paid'].includes(r.status)).length,
        total_deal_value: partnerReferrals.reduce((sum, r) => sum + (r.total_deal_value || 0), 0),
        total_commission: partnerReferrals.reduce((sum, r) => sum + (r.total_commission_earned || 0), 0),
        conversion_rate: partnerReferrals.length > 0 ? 
          (partnerReferrals.filter(r => ['won', 'fully_paid'].includes(r.status)).length / partnerReferrals.length) * 100 : 0
      };

      // Determine performance tier
      let performance_tier = 'beginner';
      if (performance.total_commission > 500000) performance_tier = 'elite';
      else if (performance.total_commission > 100000) performance_tier = 'premium';
      else if (performance.total_commission > 0) performance_tier = 'active';

      return {
        ...partner,
        performance,
        performance_tier
      };
    });

    // Apply performance filter if specified
    let filteredPartners = partnersWithPerformance;
    if (performance && performance !== 'all') {
      filteredPartners = partnersWithPerformance.filter(partner => 
        partner.performance_tier === performance
      );
    }

    res.json({
      success: true,
      data: {
        partners: filteredPartners,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        },
        filters: {
          status,
          performance,
          search
        }
      }
    });

  } catch (error) {
    console.error('💥 Partners directory error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching partners directory'
    });
  }
});

// @route   PATCH /api/internal/partners/:id/status
// @desc    Partner status management
// @access  Private (Internal)
router.patch('/partners/:id/status', authenticateInternal, async (req, res) => {
  try {
    const partnerId = req.params.id;
    const internalUserId = req.internalUser.id;
    const { is_active, notes } = req.body;

    console.log(`⚡ Updating partner status: ${partnerId} -> active: ${is_active}`);

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'is_active (boolean) is required'
      });
    }

    // Get current partner for audit
    const { data: currentPartner, error: fetchError } = await supabase
      .from('partners')
      .select('*')
      .eq('id', partnerId)
      .single();

    if (fetchError || !currentPartner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Update partner status
    const { data: partner, error } = await supabase
      .from('partners')
      .update({
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', partnerId)
      .select()
      .single();

    if (error) {
      console.error('❌ Partner status update error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update partner status: ' + error.message
      });
    }

    // Create notification for partner if status changed
    if (currentPartner.is_active !== is_active) {
      await supabase
        .from('notifications')
        .insert({
          user_id: partnerId,
          user_type: 'partner',
          type: is_active ? 'account_activated' : 'account_deactivated',
          title: is_active ? 'Account Activated' : 'Account Deactivated',
          message: is_active ? 
            'Your partner account has been activated. You can now create referrals and earn commissions.' :
            'Your partner account has been deactivated. Please contact support for more information.',
          metadata: {
            updated_by: internalUserId,
            notes: notes || ''
          }
        });
    }

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'update',
        resource_type: 'partners',
        resource_id: partnerId,
        old_values: currentPartner,
        new_values: partner,
        notes: notes || `Partner ${is_active ? 'activated' : 'deactivated'}`
      });

    res.json({
      success: true,
      message: `Partner ${is_active ? 'activated' : 'deactivated'} successfully`,
      data: { partner }
    });

  } catch (error) {
    console.error('💥 Partner status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating partner status'
    });
  }
});

// Analytics helper functions
async function getOverviewAnalytics(date_from, date_to) {
  // Implementation for overview analytics
  return {
    summary: {},
    trends: {}
  };
}

async function getReferralConversionAnalytics(date_from, date_to) {
  // Implementation for referral conversion analytics
  return {
    funnel: {},
    conversion_rates: {}
  };
}

async function getRevenueTrendsAnalytics(date_from, date_to, group_by) {
  // Implementation for revenue trends
  return {
    revenue_data: {},
    commission_data: {}
  };
}

async function getPartnerPerformanceAnalytics(date_from, date_to, partner_id) {
  // Implementation for partner performance
  return {
    partner_metrics: {},
    rankings: {}
  };
}

async function getLeadSourcesAnalytics(date_from, date_to) {
  // Implementation for lead sources
  return {
    source_breakdown: {},
    source_efficiency: {}
  };
}

function calculateTeamPerformance(teamData, period, team_member_id) {
  // Implementation for team performance calculation
  return {
    members: [],
    overall: {}
  };
}

function calculatePartnerPerformance(partnerData, period) {
  // Implementation for partner performance calculation
  return {
    partners: [],
    rankings: {}
  };
}

export default router;