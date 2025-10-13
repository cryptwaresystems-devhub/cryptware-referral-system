import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticatePartner, authenticateInternal } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/commissions/partner
// @desc    PARTNER: Commission summary & earnings
// @access  Private (Partner)
router.get('/partner', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.partner.id;

    console.log(`💰 Fetching commission summary for partner: ${partnerId}`);

    // Get all referrals with payments and commission data
    const { data: referrals, error } = await supabase
      .from('referrals')
      .select(`
        id,
        prospect_company_name,
        referral_code,
        status,
        total_deal_value,
        total_commission_earned,
        commission_eligible,
        created_at,
        client_payments (
          amount,
          commission_calculated,
          payment_date,
          status
        )
      `)
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Commission summary error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch commission summary'
      });
    }

    const validReferrals = referrals || [];

    // Calculate comprehensive commission breakdown
    let totalCommissionEarned = 0;
    let availableForPayout = 0;
    let pendingCommission = 0;

    const commissionBreakdown = validReferrals.map(referral => {
      const commission = referral.total_commission_earned || 0;
      totalCommissionEarned += commission;

      if (referral.commission_eligible && commission > 0) {
        availableForPayout += commission;
      } else if (commission > 0) {
        pendingCommission += commission;
      }

      return {
        id: referral.id,
        prospect_company_name: referral.prospect_company_name,
        referral_code: referral.referral_code,
        status: referral.status,
        total_deal_value: referral.total_deal_value,
        commission_earned: commission,
        commission_eligible: referral.commission_eligible,
        payments: referral.client_payments?.filter(p => p.status === 'confirmed') || []
      };
    });

    // Get payout history
    const { data: payouts } = await supabase
      .from('partner_payouts')
      .select('*')
      .eq('partner_id', partnerId)
      .order('requested_at', { ascending: false });

    const totalPaidOut = payouts
      ?.filter(p => p.status === 'paid')
      ?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

    res.json({
      success: true,
      data: {
        summary: {
          total_commission_earned: totalCommissionEarned,
          available_for_payout: availableForPayout,
          pending_commission: pendingCommission,
          total_paid_out: totalPaidOut,
          commission_rate: 0.05 // 5%
        },
        breakdown: commissionBreakdown,
        payout_history: payouts || [],
        can_request_payout: availableForPayout > 0
      }
    });

  } catch (error) {
    console.error('💥 Commission summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching commission summary'
    });
  }
});

// @route   GET /api/commissions/eligible
// @desc    PARTNER: Eligible commissions for payout
// @access  Private (Partner)
router.get('/eligible', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.partner.id;

    console.log(`💰 Fetching eligible commissions for partner: ${partnerId}`);

    // Get referrals that are eligible for payout (fully_paid with commission)
    const { data: eligibleReferrals, error } = await supabase
      .from('referrals')
      .select(`
        id,
        prospect_company_name,
        referral_code,
        total_commission_earned,
        created_at
      `)
      .eq('partner_id', partnerId)
      .eq('status', 'fully_paid')
      .eq('commission_eligible', true)
      .gt('total_commission_earned', 0)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Eligible commissions error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch eligible commissions'
      });
    }

    const totalEligible = eligibleReferrals?.reduce((sum, r) => 
      sum + (r.total_commission_earned || 0), 0
    ) || 0;

    res.json({
      success: true,
      data: {
        eligible_referrals: eligibleReferrals || [],
        total_eligible_amount: totalEligible,
        can_request_payout: totalEligible > 0
      }
    });

  } catch (error) {
    console.error('💥 Eligible commissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching eligible commissions'
    });
  }
});

// @route   POST /api/payouts/request
// @desc    PARTNER: Request payout for eligible commission
// @access  Private (Partner)
router.post('/payouts/request', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.partner.id;
    const { referral_id, amount, notes } = req.body;

    console.log(`💰 Payout request from partner: ${partnerId} for referral: ${referral_id}`);

    // Validation
    if (!referral_id || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid referral ID and amount are required'
      });
    }

    // Verify referral exists and is eligible
    const { data: referral, error: refError } = await supabase
      .from('referrals')
      .select('*')
      .eq('id', referral_id)
      .eq('partner_id', partnerId)
      .eq('status', 'fully_paid')
      .eq('commission_eligible', true)
      .single();

    if (refError || !referral) {
      return res.status(400).json({
        success: false,
        message: 'Referral not found or not eligible for payout'
      });
    }

    // Verify amount doesn't exceed available commission
    if (amount > referral.total_commission_earned) {
      return res.status(400).json({
        success: false,
        message: `Requested amount exceeds available commission. Available: ₦${referral.total_commission_earned}`
      });
    }

    // Check for existing pending payout for this referral
    const { data: existingPayout } = await supabase
      .from('partner_payouts')
      .select('id')
      .eq('referral_id', referral_id)
      .eq('status', 'pending')
      .single();

    if (existingPayout) {
      return res.status(400).json({
        success: false,
        message: 'Pending payout already exists for this referral'
      });
    }

    // Create payout request
    const { data: payout, error: payoutError } = await supabase
      .from('partner_payouts')
      .insert({
        partner_id: partnerId,
        referral_id: referral_id,
        amount: amount,
        status: 'pending',
        notes: notes || `Payout request for ${referral.prospect_company_name}`
      })
      .select(`
        *,
        referrals:referral_id (prospect_company_name, referral_code)
      `)
      .single();

    if (payoutError) {
      console.error('❌ Payout request error:', payoutError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create payout request: ' + payoutError.message
      });
    }

    console.log(`✅ Payout request created: ${payout.id}`);

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: partnerId,
        user_type: 'partner',
        action: 'create',
        resource_type: 'partner_payouts',
        resource_id: payout.id,
        new_values: payout
      });

    res.status(201).json({
      success: true,
      message: 'Payout request submitted successfully',
      data: {
        payout,
        estimated_processing: '24-48 hours'
      }
    });

  } catch (error) {
    console.error('💥 Payout request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating payout request'
    });
  }
});

// @route   GET /api/payouts/partner
// @desc    PARTNER: Payout request history
// @access  Private (Partner)
router.get('/payouts/partner', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.partner.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    console.log(`📋 Fetching payout history for partner: ${partnerId}`);

    const { data: payouts, error, count } = await supabase
      .from('partner_payouts')
      .select(`
        *,
        referrals:referral_id (
          prospect_company_name,
          referral_code
        )
      `, { count: 'exact' })
      .eq('partner_id', partnerId)
      .order('requested_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('❌ Payout history error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payout history'
      });
    }

    res.json({
      success: true,
      data: {
        payouts: payouts || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('💥 Payout history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching payout history'
    });
  }
});

// @route   PATCH /api/payouts/:id
// @desc    PARTNER: Update payout request (cancel if pending)
// @access  Private (Partner)
router.patch('/payouts/:id', authenticatePartner, async (req, res) => {
  try {
    const payoutId = req.params.id;
    const partnerId = req.partner.id;
    const { action, notes } = req.body;

    console.log(`✏️ Updating payout: ${payoutId}, action: ${action}`);

    if (action !== 'cancel') {
      return res.status(400).json({
        success: false,
        message: 'Only cancel action is allowed for partners'
      });
    }

    // Verify payout belongs to partner and is pending
    const { data: payout, error: payoutError } = await supabase
      .from('partner_payouts')
      .select('*')
      .eq('id', payoutId)
      .eq('partner_id', partnerId)
      .eq('status', 'pending')
      .single();

    if (payoutError || !payout) {
      return res.status(404).json({
        success: false,
        message: 'Pending payout not found or cannot be cancelled'
      });
    }

    // Cancel the payout
    const { data: updatedPayout, error: updateError } = await supabase
      .from('partner_payouts')
      .update({
        status: 'cancelled',
        notes: notes || `Cancelled by partner on ${new Date().toISOString().split('T')[0]}`
      })
      .eq('id', payoutId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Payout cancellation error:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to cancel payout request'
      });
    }

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: partnerId,
        user_type: 'partner',
        action: 'update',
        resource_type: 'partner_payouts',
        resource_id: payoutId,
        old_values: payout,
        new_values: updatedPayout
      });

    res.json({
      success: true,
      message: 'Payout request cancelled successfully',
      data: { payout: updatedPayout }
    });

  } catch (error) {
    console.error('💥 Update payout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating payout'
    });
  }
});

// @route   GET /api/payouts/pending
// @desc    INTERNAL: All pending payout requests
// @access  Private (Internal)
router.get('/payouts/pending', authenticateInternal, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    console.log(`📋 Fetching pending payouts, page: ${page}`);

    const { data: payouts, error, count } = await supabase
      .from('partner_payouts')
      .select(`
        *,
        partners:partner_id (
          company_name,
          contact_name,
          email,
          phone,
          bank_account_number,
          verified_account_name,
          bank_verified
        ),
        referrals:referral_id (
          prospect_company_name,
          referral_code
        )
      `, { count: 'exact' })
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('❌ Pending payouts error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch pending payouts'
      });
    }

    res.json({
      success: true,
      data: {
        payouts: payouts || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('💥 Pending payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching pending payouts'
    });
  }
});

// @route   PATCH /api/payouts/:id/process
// @desc    INTERNAL: Process payout (update status + reference)
// @access  Private (Internal)
router.patch('/payouts/:id/process', authenticateInternal, async (req, res) => {
  try {
    const payoutId = req.params.id;
    const internalUserId = req.internalUser.id;
    const { status, payment_reference, notes } = req.body;

    console.log(`⚡ Processing payout: ${payoutId}, status: ${status}`);

    // Validation
    const validStatuses = ['processing', 'paid', 'failed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Valid status required: ${validStatuses.join(', ')}`
      });
    }

    if (status === 'paid' && !payment_reference) {
      return res.status(400).json({
        success: false,
        message: 'Payment reference is required when marking as paid'
      });
    }

    // Get current payout for audit
    const { data: currentPayout } = await supabase
      .from('partner_payouts')
      .select('*')
      .eq('id', payoutId)
      .single();

    if (!currentPayout) {
      return res.status(404).json({
        success: false,
        message: 'Payout not found'
      });
    }

    // Prepare update data
    const updateData = {
      status,
      payment_reference: payment_reference || null,
      notes: notes || currentPayout.notes
    };

    if (status === 'paid') {
      updateData.processed_at = new Date().toISOString();
    }

    // Update payout
    const { data: payout, error } = await supabase
      .from('partner_payouts')
      .update(updateData)
      .eq('id', payoutId)
      .select(`
        *,
        partners:partner_id (company_name, contact_name),
        referrals:referral_id (prospect_company_name)
      `)
      .single();

    if (error) {
      console.error('❌ Payout processing error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to process payout: ' + error.message
      });
    }

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'update',
        resource_type: 'partner_payouts',
        resource_id: payoutId,
        old_values: currentPayout,
        new_values: payout
      });

    res.json({
      success: true,
      message: `Payout ${status} successfully`,
      data: { payout }
    });

  } catch (error) {
    console.error('💥 Process payout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while processing payout'
    });
  }
});

// @route   GET /api/payouts/stats
// @desc    INTERNAL: Payout analytics and reporting
// @access  Private (Internal)
router.get('/payouts/stats', authenticateInternal, async (req, res) => {
  try {
    console.log(`📊 Generating payout statistics`);

    const { data: payouts, error } = await supabase
      .from('partner_payouts')
      .select(`
        amount,
        status,
        requested_at,
        processed_at,
        partners:partner_id (company_name)
      `);

    if (error) {
      console.error('❌ Payout stats error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate payout statistics'
      });
    }

    const validPayouts = payouts || [];

    // Calculate statistics
    const totalRequested = validPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPaid = validPayouts
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const statusBreakdown = {
      pending: validPayouts.filter(p => p.status === 'pending').length,
      processing: validPayouts.filter(p => p.status === 'processing').length,
      paid: validPayouts.filter(p => p.status === 'paid').length,
      failed: validPayouts.filter(p => p.status === 'failed').length,
      cancelled: validPayouts.filter(p => p.status === 'cancelled').length
    };

    // Monthly breakdown
    const monthlyData = {};
    validPayouts.forEach(payout => {
      if (payout.status === 'paid' && payout.processed_at) {
        const date = new Date(payout.processed_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            amount: 0,
            count: 0
          };
        }
        
        monthlyData[monthKey].amount += payout.amount || 0;
        monthlyData[monthKey].count += 1;
      }
    });

    const monthlyBreakdown = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        ...data
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6); // Last 6 months

    res.json({
      success: true,
      data: {
        overview: {
          total_requested: totalRequested,
          total_paid: totalPaid,
          pending_amount: validPayouts
            .filter(p => p.status === 'pending')
            .reduce((sum, p) => sum + (p.amount || 0), 0),
          total_payouts: validPayouts.length
        },
        status_breakdown: statusBreakdown,
        monthly_breakdown: monthlyBreakdown
      }
    });

  } catch (error) {
    console.error('💥 Payout stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating payout statistics'
    });
  }
});

export default router;