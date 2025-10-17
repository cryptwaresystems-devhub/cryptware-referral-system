import express from 'express';
import { authenticateInternal } from '../middleware/auth.js';
import { supabase, supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

// @route   POST /api/leads
// @desc    Internal: create lead (with optional referral code linking)
// @access  Private (Internal)
router.post('/', authenticateInternal, async (req, res) => {
  try {
    const {
      company_name,
      contact_name,
      email,
      phone,
      industry,
      erp_system,
      implementation_timeline,
      estimated_value,
      referral_code,
      assigned_to
    } = req.body;

    const internalUserId = req.internalUser.id;

    console.log(`📝 Creating lead for company: ${company_name}`);

    // Validation
    if (!company_name || !contact_name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: company_name, contact_name, email, phone'
      });
    }

    let referralId = null;
    let partnerId = null;

    // Link to referral if code provided - USE ADMIN CLIENT
    if (referral_code) {
      const { data: referral, error: referralError } = await supabaseAdmin // Use supabaseAdmin
        .from('referrals')
        .select('id, partner_id, prospect_company_name, contact_name, email')
        .eq('referral_code', referral_code.toUpperCase())
        .single();

      if (referralError) {
        console.error('❌ Referral lookup error in leads creation:', referralError);
        return res.status(400).json({
          success: false,
          message: 'Invalid referral code: ' + referralError.message
        });
      }

      referralId = referral.id;
      partnerId = referral.partner_id;

      // Update referral status to contacted - USE ADMIN CLIENT
      await supabaseAdmin // Use supabaseAdmin
        .from('referrals')
        .update({ 
          status: 'contacted',
          updated_at: new Date().toISOString()
        })
        .eq('id', referralId);
    }

    // Create lead - USE ADMIN CLIENT for consistency
    const { data: lead, error: leadError } = await supabaseAdmin // Use supabaseAdmin
      .from('leads')
      .insert({
        company_name,
        contact_name,
        email,
        phone,
        industry,
        erp_system,
        implementation_timeline,
        estimated_value,
        referral_id: referralId,
        referral_code: referral_code?.toUpperCase(),
        assigned_to: assigned_to || internalUserId,
        status: 'new',
        source: referral_code ? 'partner' : 'internal'
      })
      .select(`
        *,
        internal_users:assigned_to (name, email),
        referrals:referral_id (referral_code, partners:partner_id(company_name))
      `)
      .single();

    if (leadError) {
      console.error('❌ Lead creation error:', leadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create lead: ' + leadError.message
      });
    }

    console.log(`✅ Lead created: ${lead.id}`);

    // Create initial activity - USE ADMIN CLIENT
    await supabaseAdmin // Use supabaseAdmin
      .from('lead_activities')
      .insert({
        lead_id: lead.id,
        type: 'lead_created',
        notes: `Lead created from ${referral_code ? 'partner referral' : 'internal source'}`,
        recorded_by: internalUserId
      });

    // Audit log - USE ADMIN CLIENT
    await supabaseAdmin // Use supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'create',
        resource_type: 'leads',
        resource_id: lead.id,
        new_values: lead
      });

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      data: {
        lead,
        linked_to_referral: !!referral_code
      }
    });

  } catch (error) {
    console.error('💥 Create lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating lead'
    });
  }
});

// @route   GET /api/leads
// @desc    Internal: list all leads with status filtering
// @access  Private (Internal)
router.get('/', authenticateInternal, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      source, 
      assigned_to,
      search 
    } = req.query;

    const offset = (page - 1) * limit;

    console.log(`📋 Fetching leads, page: ${page}, filters:`, { status, source, search });

    // Build query - USE ADMIN CLIENT
    let query = supabaseAdmin // Use supabaseAdmin
      .from('leads')
      .select(`
        *,
        internal_users:assigned_to (name, email),
        referrals:referral_id (referral_code, partners:partner_id(company_name))
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (source && source !== 'all') {
      query = query.eq('source', source);
    }

    if (assigned_to && assigned_to !== 'all') {
      query = query.eq('assigned_to', assigned_to);
    }

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: leads, error, count } = await query;

    if (error) {
      console.error('❌ Fetch leads error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch leads'
      });
    }

    // Get lead statistics - USE ADMIN CLIENT
    const { data: allLeads } = await supabaseAdmin // Use supabaseAdmin
      .from('leads')
      .select('status, source');

    const stats = {
      total: allLeads?.length || 0,
      by_status: {
        new: allLeads?.filter(l => l.status === 'new').length || 0,
        contacted: allLeads?.filter(l => l.status === 'contacted').length || 0,
        qualified: allLeads?.filter(l => l.status === 'qualified').length || 0,
        proposal: allLeads?.filter(l => l.status === 'proposal').length || 0,
        negotiation: allLeads?.filter(l => l.status === 'negotiation').length || 0,
        converted: allLeads?.filter(l => l.status === 'converted').length || 0,
        lost: allLeads?.filter(l => l.status === 'lost').length || 0
      },
      by_source: {
        partner: allLeads?.filter(l => l.source === 'partner').length || 0,
        internal: allLeads?.filter(l => l.source === 'internal').length || 0
      }
    };

    res.json({
      success: true,
      data: {
        leads,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        },
        statistics: stats
      }
    });

  } catch (error) {
    console.error('💥 Fetch leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching leads'
    });
  }
});

// @route   GET /api/leads/:id
// @desc    Get lead details with activities timeline
// @access  Private (Internal)
router.get('/:id', authenticateInternal, async (req, res) => {
  try {
    const leadId = req.params.id;

    console.log(`🔍 Fetching lead details: ${leadId}`);

    // Get lead with detailed information
    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .select(`
        *,
        internal_users:assigned_to (id, name, email, role),
        referrals:referral_id (
          id,
          referral_code,
          partners:partner_id (
            id,
            company_name,
            contact_name,
            email,
            phone
          )
        ),
        activities:lead_activities (
          id,
          type,
          notes,
          created_at,
          recorded_by,
          internal_users:recorded_by (name)
        ),
        client_payments:client_payments!client_payments_lead_id_fkey (
          id,
          amount,
          commission_calculated,
          payment_date,
          payment_method,
          status,
          created_at
        )
      `)
      .eq('id', leadId)
      .single();

    if (error || !lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    res.json({
      success: true,
      data: {
        lead
      }
    });

  } catch (error) {
    console.error('💥 Fetch lead details error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching lead details'
    });
  }
});

// @route   PUT /api/leads/:id
// @desc    Update lead information
// @access  Private (Internal)
router.put('/:id', authenticateInternal, async (req, res) => {
  try {
    const leadId = req.params.id;
    const internalUserId = req.internalUser.id;
    const updateData = req.body;

    console.log(`✏️ Updating lead: ${leadId}`);

    // Remove fields that shouldn't be updated directly
    const { id, created_at, referral_id, ...safeUpdateData } = updateData;

    const { data: lead, error } = await supabase
      .from('leads')
      .update({
        ...safeUpdateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (error || !lead) {
      console.error('❌ Lead update error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update lead: ' + error?.message
      });
    }

    // Log activity
    await supabaseAdmin
      .from('lead_activities')
      .insert({
        lead_id: leadId,
        type: 'information_updated',
        notes: 'Lead information updated',
        recorded_by: internalUserId
      });

    // Audit log
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'update',
        resource_type: 'leads',
        resource_id: leadId,
        new_values: lead
      });

    res.json({
      success: true,
      message: 'Lead updated successfully',
      data: { lead }
    });

  } catch (error) {
    console.error('💥 Update lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating lead'
    });
  }
});

// @route   PUT /api/leads/:id/status
// @desc    Update lead status and log activity
// @access  Private (Internal)
router.put('/:id/status', authenticateInternal, async (req, res) => {
  try {
    const leadId = req.params.id;
    const internalUserId = req.internalUser.id;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    console.log(`🔄 Updating lead status: ${leadId} -> ${status}`);

    const validStatuses = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'converted', 'lost'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .update({
        status,
        last_contact: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (error || !lead) {
      console.error('❌ Lead status update error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update lead status'
      });
    }

    // Log status change activity
    await supabaseAdmin
      .from('lead_activities')
      .insert({
        lead_id: leadId,
        type: 'status_changed',
        notes: notes || `Status changed to ${status}`,
        recorded_by: internalUserId
      });

    // If lead has a referral, update referral status accordingly
    if (lead.referral_id) {
      let referralStatus = 'contacted';
      
      if (status === 'converted') referralStatus = 'won';
      else if (status === 'lost') referralStatus = 'lost';
      else if (status === 'qualified') referralStatus = 'meeting_scheduled';
      else if (status === 'proposal') referralStatus = 'proposal_sent';
      else if (status === 'negotiation') referralStatus = 'negotiation';

      await supabaseAdmin
        .from('referrals')
        .update({
          status: referralStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.referral_id);
    }

    res.json({
      success: true,
      message: 'Lead status updated successfully',
      data: { lead }
    });

  } catch (error) {
    console.error('💥 Update lead status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating lead status'
    });
  }
});

// @route   POST /api/leads/:id/activities
// @desc    Log lead activities (calls, emails, meetings)
// @access  Private (Internal)
router.post('/:id/activities', authenticateInternal, async (req, res) => {
  try {
    const leadId = req.params.id;
    const internalUserId = req.internalUser.id;
    const { type, notes } = req.body;

    if (!type || !notes) {
      return res.status(400).json({
        success: false,
        message: 'Activity type and notes are required'
      });
    }

    console.log(`📝 Logging activity for lead: ${leadId}, type: ${type}`);

    const validTypes = ['call', 'email', 'meeting', 'note', 'demo', 'proposal_sent', 'follow_up'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid activity type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const { data: activity, error } = await supabaseAdmin
      .from('lead_activities')
      .insert({
        lead_id: leadId,
        type,
        notes,
        recorded_by: internalUserId
      })
      .select(`
        *,
        internal_users:recorded_by (name)
      `)
      .single();

    if (error) {
      console.error('❌ Activity logging error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to log activity'
      });
    }

    // Update lead's last_contact timestamp
    await supabaseAdmin
      .from('leads')
      .update({
        last_contact: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);

    res.status(201).json({
      success: true,
      message: 'Activity logged successfully',
      data: { activity }
    });

  } catch (error) {
    console.error('💥 Log activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while logging activity'
    });
  }
});

// @route   PATCH /api/leads/:id/payment-complete
// @desc    Mark lead as fully paid by prospect
// @access  Private (Internal)
router.patch('/:id/payment-complete', authenticateInternal, async (req, res) => {
  try {
    const leadId = req.params.id;
    const internalUserId = req.internalUser.id;

    console.log(`💰 Marking lead as payment complete: ${leadId}`);

    // Get lead with referral details
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select(`
        *,
        referrals!referral_id (id, partner_id, prospect_company_name, total_commission_earned)
      `)
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Update lead as payment completed
    const { data: updatedLead, error: updateError } = await supabaseAdmin
      .from('leads')
      .update({
        payment_completed: true,
        payment_completed_at: new Date().toISOString(),
        payment_completed_by: internalUserId,
        status: 'converted',
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Payment completion error:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark payment as complete'
      });
    }

    // Update referral status to fully_paid (this triggers commission eligibility)
    if (lead.referrals && lead.referrals.id) {
      await supabaseAdmin
        .from('referrals')
        .update({
          status: 'fully_paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.referrals.id);

      // Create notification for partner
      await supabaseAdmin
        .from('partner_notifications')
        .insert({
          partner_id: lead.referrals.partner_id,
          title: 'Payments Completed 🎉',
          message: `All payments for ${lead.referrals.prospect_company_name} have been completed. Your commission of ₦${(lead.referrals.total_commission_earned || 0).toLocaleString()} is now available for payout.`,
          type: 'payment_completed',
          metadata: {
            referral_id: lead.referrals.id,
            commission_amount: lead.referrals.total_commission_earned
          }
        });
    }

    // Log activity
    await supabaseAdmin
      .from('lead_activities')
      .insert({
        lead_id: leadId,
        type: 'status_changed',
        notes: 'All payments completed by prospect. Lead converted to customer.',
        recorded_by: internalUserId
      });

    // Create audit log
    await supabaseAdmin
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
      message: 'Lead marked as payment completed successfully',
      data: { lead: updatedLead }
    });

  } catch (error) {
    console.error('💥 Payment completion error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while marking payment as complete'
    });
  }
});

export default router;