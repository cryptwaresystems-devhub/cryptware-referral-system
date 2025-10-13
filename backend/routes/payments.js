import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateInternal } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/payments
// @desc    INTERNAL: Record client payment (triggers 5% commission via database trigger)
// @access  Private (Internal)
router.post('/', authenticateInternal, async (req, res) => {
  try {
    let { 
      referral_id, 
      lead_id, 
      amount, 
      payment_date, 
      payment_method, 
      transaction_reference, 
      notes 
    } = req.body;

    const internalUserId = req.internalUser.id;

    console.log(`💰 Recording payment: ₦${amount} for referral: ${referral_id}`);

    // ==================== VALIDATION ====================
    if (!amount || amount <= 0 || typeof amount !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required and must be a positive number'
      });
    }

    if (!referral_id && !lead_id) {
      return res.status(400).json({
        success: false,
        message: 'Either referral_id or lead_id is required'
      });
    }

    // ==================== REFERRAL VERIFICATION ====================
    let finalReferralId = referral_id;
    let prospectCompanyName = 'Unknown Company';

    if (finalReferralId) {
      const { data: referralData, error: referralError } = await supabase
        .from('referrals')
        .select('id, partner_id, prospect_company_name')
        .eq('id', finalReferralId)
        .single();

      if (referralError || !referralData) {
        return res.status(404).json({
          success: false,
          message: 'Referral not found'
        });
      }
      prospectCompanyName = referralData.prospect_company_name;
    }

    // ==================== LEAD VERIFICATION ====================
    let leadCompanyName = 'Unknown Lead';

    if (lead_id) {
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .select('id, company_name, referral_id')
        .eq('id', lead_id)
        .single();

      if (leadError || !leadData) {
        return res.status(404).json({
          success: false,
          message: 'Lead not found'
        });
      }

      leadCompanyName = leadData.company_name;
      
      // Use lead's referral_id if available and no referral_id provided
      if (leadData.referral_id && !finalReferralId) {
        finalReferralId = leadData.referral_id;
        
        // Get referral details for company name
        const { data: referralFromLead } = await supabase
          .from('referrals')
          .select('prospect_company_name')
          .eq('id', finalReferralId)
          .single();
          
        if (referralFromLead) {
          prospectCompanyName = referralFromLead.prospect_company_name;
        }
      }
    }

    // ==================== PAYMENT CREATION ====================
    const paymentData = {
      referral_id: finalReferralId || null,
      lead_id: lead_id || null,
      amount: Math.round(amount * 100) / 100, // Ensure 2 decimal places
      commission_calculated: 0, // Will be calculated by database trigger
      payment_date: payment_date || new Date().toISOString().split('T')[0],
      payment_method: payment_method || 'bank_transfer',
      transaction_reference: transaction_reference || `PAY-${Date.now()}`,
      status: 'confirmed',
      recorded_by: internalUserId,
      notes: notes || `Payment recorded for ${prospectCompanyName}`
    };

    const { data: payment, error: paymentError } = await supabase
      .from('client_payments')
      .insert(paymentData)
      .select(`
        *,
        referrals:referral_id (
          prospect_company_name,
          referral_code,
          partners:partner_id (company_name, email)
        ),
        leads:lead_id (company_name, contact_name)
      `)
      .single();

    if (paymentError) {
      console.error('❌ Payment creation error:', paymentError);
      return res.status(500).json({
        success: false,
        message: 'Failed to record payment: ' + paymentError.message
      });
    }

    console.log(`✅ Payment recorded: ${payment.id}, Commission: ₦${payment.commission_calculated}`);

    // ==================== ACTIVITY LOGGING ====================
    const activityPromises = [];

    // Log lead activity if lead exists
    if (lead_id) {
      activityPromises.push(
        supabase
          .from('lead_activities')
          .insert({
            lead_id: lead_id,
            type: 'payment_received',
            notes: `Payment of ₦${amount.toLocaleString()} recorded${transaction_reference ? ` (Ref: ${transaction_reference})` : ''}`,
            recorded_by: internalUserId
          })
      );
    }

    // Audit log
    activityPromises.push(
      supabase
        .from('audit_logs')
        .insert({
          user_id: internalUserId,
          user_type: 'internal',
          action: 'create',
          resource_type: 'client_payments',
          resource_id: payment.id,
          new_values: payment
        })
    );

    await Promise.all(activityPromises);

    // ==================== SUCCESS RESPONSE ====================
    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        payment,
        commission_calculated: payment.commission_calculated,
        commission_rate: '5%'
      }
    });

  } catch (error) {
    console.error('💥 Record payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while recording payment'
    });
  }
});

// @route   GET /api/payments
// @desc    INTERNAL: List all payments with advanced filtering and pagination
// @access  Private (Internal)
router.get('/', authenticateInternal, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      referral_id,
      lead_id,
      status = 'confirmed',
      date_from,
      date_to,
      payment_method,
      min_amount,
      max_amount
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Cap at 100
    const offset = (pageNum - 1) * limitNum;

    console.log(`📋 Fetching payments, page: ${pageNum}, limit: ${limitNum}`);

    // ==================== QUERY BUILDING ====================
    let query = supabase
      .from('client_payments')
      .select(`
        *,
        referrals:referral_id (
          prospect_company_name,
          referral_code,
          partners:partner_id (company_name, contact_name)
        ),
        leads:lead_id (
          company_name,
          contact_name,
          status as lead_status
        ),
        internal_users:recorded_by (name, email)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    // ==================== FILTER APPLICATION ====================
    if (referral_id) query = query.eq('referral_id', referral_id);
    if (lead_id) query = query.eq('lead_id', lead_id);
    if (status) query = query.eq('status', status);
    if (payment_method) query = query.eq('payment_method', payment_method);
    if (date_from) query = query.gte('payment_date', date_from);
    if (date_to) query = query.lte('payment_date', date_to);
    if (min_amount) query = query.gte('amount', parseFloat(min_amount));
    if (max_amount) query = query.lte('amount', parseFloat(max_amount));

    const { data: payments, error, count } = await query;

    if (error) {
      console.error('❌ Fetch payments error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payments'
      });
    }

    // ==================== RESPONSE ENHANCEMENT ====================
    const enhancedPayments = (payments || []).map(payment => ({
      ...payment,
      _links: {
        self: `/api/payments/${payment.id}`,
        referral: payment.referral_id ? `/api/referrals/${payment.referral_id}` : null,
        lead: payment.lead_id ? `/api/leads/${payment.lead_id}` : null
      }
    }));

    // ==================== PAGINATION METADATA ====================
    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: {
        payments: enhancedPayments,
        pagination: {
          current_page: pageNum,
          per_page: limitNum,
          total_items: totalCount,
          total_pages: totalPages,
          has_next: pageNum < totalPages,
          has_prev: pageNum > 1
        },
        summary: {
          total_amount: enhancedPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
          total_commission: enhancedPayments.reduce((sum, p) => sum + (p.commission_calculated || 0), 0)
        }
      }
    });

  } catch (error) {
    console.error('💥 Fetch payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching payments'
    });
  }
});

// @route   GET /api/payments/lead/:leadId
// @desc    INTERNAL: Comprehensive payments for specific lead
// @access  Private (Internal)
router.get('/lead/:leadId', authenticateInternal, async (req, res) => {
  try {
    const { leadId } = req.params;

    console.log(`📋 Fetching payments for lead: ${leadId}`);

    // ==================== PARALLEL DATA FETCHING ====================
    const [paymentsResponse, leadResponse] = await Promise.all([
      // Payments data
      supabase
        .from('client_payments')
        .select(`
          *,
          referrals:referral_id (
            prospect_company_name,
            referral_code,
            partners:partner_id (company_name)
          ),
          internal_users:recorded_by (name, email)
        `)
        .eq('lead_id', leadId)
        .order('payment_date', { ascending: false }),

      // Lead details
      supabase
        .from('leads')
        .select('company_name, contact_name, status, estimated_value')
        .eq('id', leadId)
        .single()
    ]);

    if (paymentsResponse.error) {
      console.error('❌ Fetch lead payments error:', paymentsResponse.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch lead payments'
      });
    }

    const payments = paymentsResponse.data || [];
    const lead = leadResponse.data;

    // ==================== COMPREHENSIVE CALCULATIONS ====================
    const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalCommission = payments.reduce((sum, p) => sum + (p.commission_calculated || 0), 0);
    const paymentCount = payments.length;

    // Calculate progress towards estimated value
    const progressPercentage = lead?.estimated_value 
      ? Math.min(100, (totalAmount / lead.estimated_value) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        lead_info: lead,
        payments,
        summary: {
          total_payments: paymentCount,
          total_amount: totalAmount,
          total_commission: totalCommission,
          average_payment: paymentCount > 0 ? totalAmount / paymentCount : 0,
          progress_percentage: Math.round(progressPercentage * 100) / 100,
          remaining_amount: lead?.estimated_value ? Math.max(0, lead.estimated_value - totalAmount) : 0
        },
        timeline: payments.map(p => ({
          date: p.payment_date,
          amount: p.amount,
          type: 'payment',
          description: `Payment of ₦${p.amount.toLocaleString()} recorded`
        }))
      }
    });

  } catch (error) {
    console.error('💥 Fetch lead payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching lead payments'
    });
  }
});

// @route   GET /api/payments/referral/:referralId
// @desc    INTERNAL: Comprehensive payments for specific referral
// @access  Private (Internal)
router.get('/referral/:referralId', authenticateInternal, async (req, res) => {
  try {
    const { referralId } = req.params;

    console.log(`📋 Fetching payments for referral: ${referralId}`);

    // ==================== PARALLEL DATA FETCHING ====================
    const [paymentsResponse, referralResponse] = await Promise.all([
      // Payments data
      supabase
        .from('client_payments')
        .select(`
          *,
          leads:lead_id (company_name, status, contact_name),
          internal_users:recorded_by (name, email)
        `)
        .eq('referral_id', referralId)
        .order('payment_date', { ascending: false }),

      // Referral details
      supabase
        .from('referrals')
        .select(`
          prospect_company_name,
          referral_code,
          status,
          total_deal_value,
          total_commission_earned,
          partners:partner_id (company_name, contact_name, email)
        `)
        .eq('id', referralId)
        .single()
    ]);

    if (paymentsResponse.error) {
      console.error('❌ Fetch referral payments error:', paymentsResponse.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch referral payments'
      });
    }

    const payments = paymentsResponse.data || [];
    const referral = referralResponse.data;

    // ==================== COMMISSION ANALYSIS ====================
    const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalCommission = payments.reduce((sum, p) => sum + (p.commission_calculated || 0), 0);

    // Commission efficiency analysis
    const expectedCommission = totalAmount * 0.05; // 5% rate
    const commissionDeviation = totalCommission - expectedCommission;
    const commissionAccuracy = expectedCommission > 0 
      ? Math.abs(commissionDeviation / expectedCommission) * 100 
      : 0;

    res.json({
      success: true,
      data: {
        referral_info: referral,
        payments,
        financial_analysis: {
          total_amount_collected: totalAmount,
          total_commission_earned: totalCommission,
          expected_commission: Math.round(expectedCommission * 100) / 100,
          commission_deviation: Math.round(commissionDeviation * 100) / 100,
          commission_accuracy: Math.round((100 - commissionAccuracy) * 100) / 100,
          commission_rate: '5%'
        },
        payout_eligibility: {
          is_eligible: referral?.status === 'fully_paid',
          eligible_amount: referral?.total_commission_earned || 0,
          status: referral?.status || 'unknown'
        }
      }
    });

  } catch (error) {
    console.error('💥 Fetch referral payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching referral payments'
    });
  }
});

// @route   PATCH /api/payments/:id
// @desc    INTERNAL: Secure payment update with comprehensive audit trail
// @access  Private (Internal)
router.patch('/:id', authenticateInternal, async (req, res) => {
  try {
    const paymentId = req.params.id;
    const internalUserId = req.internalUser.id;
    const updateData = req.body;

    console.log(`✏️ Updating payment: ${paymentId}`);

    // ==================== SECURE FIELD VALIDATION ====================
    const allowedFields = ['amount', 'payment_date', 'payment_method', 'transaction_reference', 'notes', 'status'];
    const safeUpdateData = {};
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined && updateData[field] !== null) {
        safeUpdateData[field] = updateData[field];
      }
    });

    if (Object.keys(safeUpdateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    // Amount validation if being updated
    if (safeUpdateData.amount && (safeUpdateData.amount <= 0 || typeof safeUpdateData.amount !== 'number')) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }

    // ==================== PRE-UPDATE VERIFICATION ====================
    const { data: currentPayment, error: fetchError } = await supabase
      .from('client_payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (fetchError || !currentPayment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // ==================== SECURE UPDATE ====================
    const { data: updatedPayment, error: updateError } = await supabase
      .from('client_payments')
      .update({
        ...safeUpdateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentId)
      .select(`
        *,
        referrals:referral_id (prospect_company_name, partners:partner_id(company_name)),
        leads:lead_id (company_name, contact_name)
      `)
      .single();

    if (updateError) {
      console.error('❌ Payment update error:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update payment: ' + updateError.message
      });
    }

    // ==================== COMPREHENSIVE AUDIT LOGGING ====================
    await supabase
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'update',
        resource_type: 'client_payments',
        resource_id: paymentId,
        old_values: currentPayment,
        new_values: updatedPayment,
        changes: Object.keys(safeUpdateData).reduce((acc, key) => {
          acc[key] = {
            from: currentPayment[key],
            to: safeUpdateData[key]
          };
          return acc;
        }, {})
      });

    console.log(`✅ Payment updated: ${paymentId}`);

    res.json({
      success: true,
      message: 'Payment updated successfully',
      data: { 
        payment: updatedPayment,
        changes: Object.keys(safeUpdateData)
      }
    });

  } catch (error) {
    console.error('💥 Update payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating payment'
    });
  }
});

// @route   GET /api/payments/stats
// @desc    INTERNAL: Advanced payment analytics and business intelligence
// @access  Private (Internal)
router.get('/stats', authenticateInternal, async (req, res) => {
  try {
    const { period = 'month', partner_id, year } = req.query;

    console.log(`📊 Generating advanced payment stats for period: ${period}`);

    // ==================== COMPREHENSIVE DATA FETCHING ====================
    const [paymentsResponse, partnersResponse, timelineResponse] = await Promise.all([
      // All confirmed payments with related data
      supabase
        .from('client_payments')
        .select(`
          amount,
          commission_calculated,
          payment_date,
          payment_method,
          status,
          referrals:referral_id (
            partners:partner_id(company_name, id)
          )
        `)
        .eq('status', 'confirmed'),

      // Partner performance data
      supabase
        .from('partners')
        .select(`
          company_name,
          total_commissions_earned,
          referrals:referrals!partner_id (total_deal_value)
        `)
        .eq('is_active', true),

      // Monthly timeline data
      supabase
        .from('client_payments')
        .select('amount, payment_date, commission_calculated')
        .eq('status', 'confirmed')
        .order('payment_date', { ascending: true })
    ]);

    if (paymentsResponse.error) {
      console.error('❌ Payment stats error:', paymentsResponse.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate payment statistics'
      });
    }

    const payments = paymentsResponse.data || [];
    const partners = partnersResponse.data || [];
    const timelinePayments = timelineResponse.data || [];

    // ==================== COMPREHENSIVE CALCULATIONS ====================
    const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalCommission = payments.reduce((sum, p) => sum + (p.commission_calculated || 0), 0);
    const totalPayments = payments.length;

    // Payment method distribution
    const paymentMethodDistribution = payments.reduce((acc, payment) => {
      const method = payment.payment_method || 'unknown';
      acc[method] = (acc[method] || 0) + 1;
      return acc;
    }, {});

    // Partner performance ranking
    const partnerPerformance = partners.map(partner => {
      const partnerPayments = payments.filter(p => 
        p.referrals?.partners?.id === partner.id
      );
      
      const partnerRevenue = partnerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const partnerCommission = partnerPayments.reduce((sum, p) => sum + (p.commission_calculated || 0), 0);

      return {
        company_name: partner.company_name,
        total_revenue: partnerRevenue,
        total_commission: partnerCommission,
        payment_count: partnerPayments.length,
        efficiency: partnerRevenue > 0 ? (partnerCommission / partnerRevenue) * 100 : 0
      };
    }).sort((a, b) => b.total_revenue - a.total_revenue);

    // ==================== TIME-BASED ANALYTICS ====================
    const monthlyData = {};
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    timelinePayments.forEach(payment => {
      const date = new Date(payment.payment_date);
      if (date >= twelveMonthsAgo) {
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            revenue: 0,
            commission: 0,
            payments: 0,
            average_payment: 0
          };
        }
        
        monthlyData[monthKey].revenue += payment.amount || 0;
        monthlyData[monthKey].commission += payment.commission_calculated || 0;
        monthlyData[monthKey].payments += 1;
      }
    });

    // Calculate averages
    Object.keys(monthlyData).forEach(month => {
      const data = monthlyData[month];
      data.average_payment = data.payments > 0 ? data.revenue / data.payments : 0;
    });

    const monthlyBreakdown = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        ...data,
        commission_rate: data.revenue > 0 ? (data.commission / data.revenue) * 100 : 0
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // ==================== RECENT ACTIVITY METRICS ====================
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentPayments = payments.filter(p => {
      const paymentDate = new Date(p.payment_date);
      return paymentDate >= thirtyDaysAgo;
    });

    const recentRevenue = recentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const recentCommission = recentPayments.reduce((sum, p) => sum + (p.commission_calculated || 0), 0);

    // ==================== COMPREHENSIVE RESPONSE ====================
    res.json({
      success: true,
      data: {
        overview: {
          total_revenue: Math.round(totalRevenue * 100) / 100,
          total_commission: Math.round(totalCommission * 100) / 100,
          total_payments,
          average_payment: totalPayments > 0 ? Math.round((totalRevenue / totalPayments) * 100) / 100 : 0,
          overall_commission_rate: totalRevenue > 0 ? Math.round((totalCommission / totalRevenue) * 100 * 100) / 100 : 0
        },
        recent_performance: {
          last_30_days: {
            payments: recentPayments.length,
            revenue: Math.round(recentRevenue * 100) / 100,
            commission: Math.round(recentCommission * 100) / 100,
            daily_average: Math.round((recentRevenue / 30) * 100) / 100
          }
        },
        monthly_breakdown: monthlyBreakdown,
        payment_methods: {
          distribution: paymentMethodDistribution,
          total_methods: Object.keys(paymentMethodDistribution).length
        },
        partner_performance: {
          top_performers: partnerPerformance.slice(0, 5),
          total_partners: partnerPerformance.length,
          average_revenue_per_partner: partnerPerformance.length > 0 
            ? Math.round(partnerPerformance.reduce((sum, p) => sum + p.total_revenue, 0) / partnerPerformance.length * 100) / 100 
            : 0
        },
        business_intelligence: {
          revenue_trend: monthlyBreakdown.length >= 2 
            ? ((monthlyBreakdown[monthlyBreakdown.length - 1].revenue - monthlyBreakdown[monthlyBreakdown.length - 2].revenue) / monthlyBreakdown[monthlyBreakdown.length - 2].revenue) * 100 
            : 0,
          forecast_next_month: monthlyBreakdown.length >= 3 
            ? Math.round(monthlyBreakdown.slice(-3).reduce((sum, m) => sum + m.revenue, 0) / 3 * 100) / 100 
            : 0
        }
      }
    });

  } catch (error) {
    console.error('💥 Payment stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating payment statistics'
    });
  }
});

export default router;