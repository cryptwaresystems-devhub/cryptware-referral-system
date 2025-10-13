import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateInternal } from '../middleware/auth.js';

const router = express.Router();

// @route   PATCH /api/deals/:id/convert
// @desc    INTERNAL: Convert lead to customer
// @access  Private (Internal)
router.patch('/:id/convert', authenticateInternal, async (req, res) => {
  try {
    const leadId = req.params.id;
    const internalUserId = req.internalUser.id;
    const { final_deal_value, notes } = req.body;

    console.log(`🔄 Converting lead to customer: ${leadId}`);

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Update lead status to converted
    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({
        status: 'converted',
        estimated_value: final_deal_value || lead.estimated_value,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Lead conversion error:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to convert lead: ' + updateError.message
      });
    }

    // Log conversion activity
    await supabase
      .from('lead_activities')
      .insert({
        lead_id: leadId,
        type: 'deal_converted',
        notes: notes || `Lead converted to customer${final_deal_value ? ` with deal value: ₦${final_deal_value.toLocaleString()}` : ''}`,
        recorded_by: internalUserId
      });

    // If lead has a referral, update referral status to "won"
    if (lead.referral_id) {
      await supabase
        .from('referrals')
        .update({
          status: 'won',
          estimated_deal_value: final_deal_value || lead.estimated_value,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.referral_id);

      console.log(`✅ Referral ${lead.referral_id} status updated to 'won'`);
    }

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'update',
        resource_type: 'leads',
        resource_id: leadId,
        old_values: lead,
        new_values: updatedLead
      });

    res.json({
      success: true,
      message: 'Lead successfully converted to customer',
      data: {
        lead: updatedLead,
        referral_updated: !!lead.referral_id
      }
    });

  } catch (error) {
    console.error('💥 Convert lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while converting lead'
    });
  }
});

// @route   PATCH /api/deals/:id/finalize
// @desc    INTERNAL: Mark deal as fully paid (triggers commission eligibility)
// @access  Private (Internal)
router.patch('/:id/finalize', authenticateInternal, async (req, res) => {
  try {
    const leadId = req.params.id;
    const internalUserId = req.internalUser.id;
    const { notes } = req.body;

    console.log(`🎯 Finalizing deal: ${leadId}`);

    // Get lead and check if it's converted
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('status', 'converted')
      .single();

    if (leadError || !lead) {
      return res.status(404).json({
        success: false,
        message: 'Converted lead not found'
      });
    }

    // Update lead status (optional - you might want to keep it as 'converted')
    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({
        status: 'converted', // Or 'completed' if you prefer
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Deal finalization error:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to finalize deal: ' + updateError.message
      });
    }

    // If lead has a referral, mark it as "fully_paid" (triggers commission eligibility)
    if (lead.referral_id) {
      const { data: referral, error: refError } = await supabase
        .from('referrals')
        .update({
          status: 'fully_paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.referral_id)
        .select()
        .single();

      if (refError) {
        console.error('❌ Referral update error:', refError);
        return res.status(500).json({
          success: false,
          message: 'Lead updated but failed to update referral: ' + refError.message
        });
      }

      console.log(`✅ Referral ${lead.referral_id} marked as fully paid - commission eligible`);
    }

    // Log finalization activity
    await supabase
      .from('lead_activities')
      .insert({
        lead_id: leadId,
        type: 'deal_finalized',
        notes: notes || 'Deal finalized and marked as fully paid',
        recorded_by: internalUserId
      });

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'update',
        resource_type: 'leads',
        resource_id: leadId,
        old_values: lead,
        new_values: updatedLead
      });

    res.json({
      success: true,
      message: 'Deal finalized successfully',
      data: {
        lead: updatedLead,
        commission_eligible: !!lead.referral_id
      }
    });

  } catch (error) {
    console.error('💥 Finalize deal error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while finalizing deal'
    });
  }
});

// @route   PATCH /api/referrals/:id/status
// @desc    INTERNAL: Update referral status through pipeline
// @access  Private (Internal)
router.patch('/referrals/:id/status', authenticateInternal, async (req, res) => {
  try {
    const referralId = req.params.id;
    const internalUserId = req.internalUser.id;
    const { status, notes } = req.body;

    console.log(`🔄 Updating referral status: ${referralId} -> ${status}`);

    // Validation
    const validStatuses = ['code_sent', 'contacted', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'won', 'fully_paid', 'lost'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Valid status required: ${validStatuses.join(', ')}`
      });
    }

    // Get current referral
    const { data: currentReferral, error: refError } = await supabase
      .from('referrals')
      .select('*')
      .eq('id', referralId)
      .single();

    if (refError || !currentReferral) {
      return res.status(404).json({
        success: false,
        message: 'Referral not found'
      });
    }

    // Update referral status
    const { data: referral, error: updateError } = await supabase
      .from('referrals')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', referralId)
      .select(`
        *,
        partners:partner_id (company_name, contact_name, email)
      `)
      .single();

    if (updateError) {
      console.error('❌ Referral status update error:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update referral status: ' + updateError.message
      });
    }

    // If referral has a linked lead, update lead status accordingly
    if (status === 'won' || status === 'fully_paid' || status === 'lost') {
      let leadStatus = 'converted';
      if (status === 'lost') leadStatus = 'lost';
      
      await supabase
        .from('leads')
        .update({
          status: leadStatus,
          updated_at: new Date().toISOString()
        })
        .eq('referral_id', referralId);
    }

    // Log status change activity if there's a linked lead
    const { data: linkedLead } = await supabase
      .from('leads')
      .select('id')
      .eq('referral_id', referralId)
      .single();

    if (linkedLead) {
      await supabase
        .from('lead_activities')
        .insert({
          lead_id: linkedLead.id,
          type: 'referral_status_updated',
          notes: `Referral status updated to: ${status}${notes ? ` - ${notes}` : ''}`,
          recorded_by: internalUserId
        });
    }

    // Audit log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'update',
        resource_type: 'referrals',
        resource_id: referralId,
        old_values: currentReferral,
        new_values: referral
      });

    res.json({
      success: true,
      message: 'Referral status updated successfully',
      data: { referral }
    });

  } catch (error) {
    console.error('💥 Update referral status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating referral status'
    });
  }
});

export default router;