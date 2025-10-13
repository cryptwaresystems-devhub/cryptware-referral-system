import express from 'express';
import { authenticateInternal } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/reports/financial
// @desc    Revenue & financial reports
// @access  Private (Internal)
router.get('/financial', authenticateInternal, async (req, res) => {
  try {
    const { 
      date_from, 
      date_to, 
      group_by = 'month',
      include_commission = 'true'
    } = req.query;

    console.log(`💰 Generating financial report`, { date_from, date_to, group_by });

    // Build date filter
    let dateFilter = {};
    if (date_from) dateFilter.gte = date_from;
    if (date_to) dateFilter.lte = date_to;

    // Get payment data
    const { data: payments, error: paymentsError } = await supabase
      .from('client_payments')
      .select(`
        amount,
        commission_calculated,
        payment_date,
        status,
        referrals:referral_id (
          partners:partner_id (company_name)
        )
      `)
      .eq('status', 'confirmed')
      .gte('payment_date', date_from || '2020-01-01')
      .lte('payment_date', date_to || new Date().toISOString().split('T')[0]);

    if (paymentsError) {
      console.error('❌ Financial report error:', paymentsError);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate financial report'
      });
    }

    const validPayments = payments || [];

    // Generate financial summary
    const summary = {
      total_revenue: validPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
      total_commission: validPayments.reduce((sum, p) => sum + (p.commission_calculated || 0), 0),
      net_revenue: validPayments.reduce((sum, p) => sum + (p.amount || 0) - (p.commission_calculated || 0), 0),
      total_payments: validPayments.length,
      average_payment: validPayments.length > 0 ? 
        validPayments.reduce((sum, p) => sum + (p.amount || 0), 0) / validPayments.length : 0
    };

    // Generate time-based breakdown
    const breakdown = generateFinancialBreakdown(validPayments, group_by);

    res.json({
      success: true,
      data: {
        summary,
        breakdown,
        date_range: {
          from: date_from || 'beginning',
          to: date_to || 'today'
        },
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 Financial report error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating financial report'
    });
  }
});

// @route   GET /api/reports/commission
// @desc    Commission payout reports
// @access  Private (Internal)
router.get('/commission', authenticateInternal, async (req, res) => {
  try {
    const { 
      date_from, 
      date_to, 
      partner_id,
      status 
    } = req.query;

    console.log(`💸 Generating commission report`, { date_from, date_to, partner_id, status });

    // Build query for partner payouts
    let payoutsQuery = supabase
      .from('partner_payouts')
      .select(`
        *,
        partners:partner_id (company_name, contact_name, email),
        referrals:referral_id (prospect_company_name, referral_code)
      `)
      .order('requested_at', { ascending: false });

    if (date_from) payoutsQuery = payoutsQuery.gte('requested_at', date_from);
    if (date_to) payoutsQuery = payoutsQuery.lte('requested_at', date_to);
    if (partner_id) payoutsQuery = payoutsQuery.eq('partner_id', partner_id);
    if (status) payoutsQuery = payoutsQuery.eq('status', status);

    const { data: payouts, error: payoutsError } = await payoutsQuery;

    if (payoutsError) {
      console.error('❌ Commission report error:', payoutsError);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate commission report'
      });
    }

    const validPayouts = payouts || [];

    // Calculate commission summary
    const summary = {
      total_requested: validPayouts.reduce((sum, p) => sum + (p.amount || 0), 0),
      total_paid: validPayouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0),
      total_pending: validPayouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0),
      payout_count: validPayouts.length,
      average_payout: validPayouts.length > 0 ? 
        validPayouts.reduce((sum, p) => sum + (p.amount || 0), 0) / validPayouts.length : 0
    };

    // Status breakdown
    const statusBreakdown = {
      pending: validPayouts.filter(p => p.status === 'pending').length,
      processing: validPayouts.filter(p => p.status === 'processing').length,
      paid: validPayouts.filter(p => p.status === 'paid').length,
      failed: validPayouts.filter(p => p.status === 'failed').length,
      cancelled: validPayouts.filter(p => p.status === 'cancelled').length
    };

    // Top partners by commission
    const partnerEarnings = {};
    validPayouts.forEach(payout => {
      const partnerName = payout.partners?.company_name || 'Unknown';
      if (!partnerEarnings[partnerName]) {
        partnerEarnings[partnerName] = 0;
      }
      if (payout.status === 'paid') {
        partnerEarnings[partnerName] += payout.amount || 0;
      }
    });

    const topPartners = Object.entries(partnerEarnings)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        summary,
        status_breakdown: statusBreakdown,
        payouts: validPayouts,
        top_partners: topPartners,
        date_range: {
          from: date_from || 'beginning',
          to: date_to || 'today'
        },
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 Commission report error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating commission report'
    });
  }
});

// @route   GET /api/reports/export
// @desc    Data export (CSV format)
// @access  Private (Internal)
router.get('/export', authenticateInternal, async (req, res) => {
  try {
    const { 
      type = 'referrals',
      date_from,
      date_to 
    } = req.query;

    console.log(`📤 Generating export for: ${type}`, { date_from, date_to });

    let exportData;
    let filename;

    switch (type) {
      case 'referrals':
        exportData = await exportReferralsData(date_from, date_to);
        filename = `referrals_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      
      case 'payments':
        exportData = await exportPaymentsData(date_from, date_to);
        filename = `payments_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      
      case 'commissions':
        exportData = await exportCommissionsData(date_from, date_to);
        filename = `commissions_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      
      case 'partners':
        exportData = await exportPartnersData();
        filename = `partners_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid export type. Use: referrals, payments, commissions, partners'
        });
    }

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send CSV data
    res.send(exportData);

  } catch (error) {
    console.error('💥 Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating export'
    });
  }
});

// Helper functions for financial breakdown
function generateFinancialBreakdown(payments, group_by) {
  const breakdown = {};

  payments.forEach(payment => {
    const date = new Date(payment.payment_date);
    let periodKey;

    switch (group_by) {
      case 'day':
        periodKey = date.toISOString().split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'quarter':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        periodKey = `${date.getFullYear()}-Q${quarter}`;
        break;
      default:
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    if (!breakdown[periodKey]) {
      breakdown[periodKey] = {
        revenue: 0,
        commission: 0,
        payments: 0
      };
    }

    breakdown[periodKey].revenue += payment.amount || 0;
    breakdown[periodKey].commission += payment.commission_calculated || 0;
    breakdown[periodKey].payments += 1;
  });

  return Object.entries(breakdown)
    .map(([period, data]) => ({
      period,
      ...data,
      net_revenue: data.revenue - data.commission
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// Export helper functions
async function exportReferralsData(date_from, date_to) {
  const { data: referrals } = await supabase
    .from('referrals')
    .select(`
      *,
      partners:partner_id (company_name),
      leads (status as lead_status)
    `)
    .gte('created_at', date_from || '2020-01-01')
    .lte('created_at', date_to || new Date().toISOString());

  const csvHeaders = 'Referral Code,Company Name,Partner,Status,Deal Value,Commission,Created Date\n';
  const csvRows = (referrals || []).map(ref => 
    `"${ref.referral_code}","${ref.prospect_company_name}","${ref.partners?.company_name || ''}","${ref.status}",${ref.total_deal_value || 0},${ref.total_commission_earned || 0},"${ref.created_at}"`
  ).join('\n');

  return csvHeaders + csvRows;
}

async function exportPaymentsData(date_from, date_to) {
  const { data: payments } = await supabase
    .from('client_payments')
    .select(`
      *,
      referrals:referral_id (
        prospect_company_name,
        partners:partner_id (company_name)
      )
    `)
    .gte('payment_date', date_from || '2020-01-01')
    .lte('payment_date', date_to || new Date().toISOString().split('T')[0]);

  const csvHeaders = 'Payment Date,Company Name,Partner,Amount,Commission,Method,Status,Reference\n';
  const csvRows = (payments || []).map(payment => 
    `"${payment.payment_date}","${payment.referrals?.prospect_company_name || ''}","${payment.referrals?.partners?.company_name || ''}",${payment.amount},${payment.commission_calculated},"${payment.payment_method}","${payment.status}","${payment.transaction_reference || ''}"`
  ).join('\n');

  return csvHeaders + csvRows;
}

async function exportCommissionsData(date_from, date_to) {
  const { data: payouts } = await supabase
    .from('partner_payouts')
    .select(`
      *,
      partners:partner_id (company_name),
      referrals:referral_id (prospect_company_name)
    `)
    .gte('requested_at', date_from || '2020-01-01')
    .lte('requested_at', date_to || new Date().toISOString());

  const csvHeaders = 'Request Date,Partner,Company Name,Amount,Status,Processed Date,Reference\n';
  const csvRows = (payouts || []).map(payout => 
    `"${payout.requested_at}","${payout.partners?.company_name || ''}","${payout.referrals?.prospect_company_name || ''}",${payout.amount},"${payout.status}","${payout.processed_at || ''}","${payout.payment_reference || ''}"`
  ).join('\n');

  return csvHeaders + csvRows;
}

async function exportPartnersData() {
  const { data: partners } = await supabase
    .from('partners')
    .select(`
      *,
      referrals:referrals!partner_id (
        status,
        total_deal_value,
        total_commission_earned
      )
    `);

  const csvHeaders = 'Company Name,Contact,Email,Phone,Status,Bank Verified,Total Referrals,Total Commission,Created Date\n';
  const csvRows = (partners || []).map(partner => {
    const referrals = partner.referrals || [];
    const totalCommission = referrals.reduce((sum, r) => sum + (r.total_commission_earned || 0), 0);
    
    return `"${partner.company_name}","${partner.contact_name}","${partner.email}","${partner.phone}","${partner.is_active ? 'Active' : 'Inactive'}","${partner.bank_verified ? 'Yes' : 'No'}",${referrals.length},${totalCommission},"${partner.created_at}"`;
  }).join('\n');

  return csvHeaders + csvRows;
}

export default router;