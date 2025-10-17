import express from 'express';
import { authenticatePartner, authenticateInternal } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import multer from 'multer';
import path from 'path';
import PaystackService from '../services/paystack-service.js';

const router = express.Router();


// Configure multer for memory storage (we'll upload directly to Supabase)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs only
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image and PDF files are allowed'), false);
    }
  }
});

// Helper function to upload file to Supabase Storage
async function uploadToSupabaseStorage(file, folder = 'payout-proofs') {
  try {
    const fileName = `payout-proof-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    const filePath = `${folder}/${fileName}`;

    console.log(`📤 Uploading file to Supabase Storage: ${filePath}`);

    const { data, error } = await supabaseAdmin.storage
      .from('documents') // Make sure this bucket exists in Supabase
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) {
      console.error('❌ Supabase storage upload error:', error);
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('documents')
      .getPublicUrl(filePath);

    console.log(`✅ File uploaded successfully: ${publicUrl}`);
    
    return {
      fileName: fileName,
      filePath: filePath,
      publicUrl: publicUrl
    };

  } catch (error) {
    console.error('💥 File upload error:', error);
    throw error;
  }
}
// @route   POST /api/payouts/request
// @desc    Partner requests payout for a fully paid referral
// @access  Private (Partner)
router.post('/request', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.partner.id;
    const { referral_id } = req.body;

    console.log(`💰 Payout request from partner: ${partnerId} for referral: ${referral_id}`);

    if (!referral_id) {
      return res.status(400).json({
        success: false,
        message: 'Referral ID is required'
      });
    }

    // Check if referral exists and belongs to partner
    const { data: referral, error: referralError } = await supabaseAdmin
      .from('referrals')
      .select('*')
      .eq('id', referral_id)
      .eq('partner_id', partnerId)
      .single();

    if (referralError || !referral) {
      return res.status(404).json({
        success: false,
        message: 'Referral not found or access denied'
      });
    }

    // Check if referral is fully paid and commission eligible
    if (referral.status !== 'fully_paid' || !referral.commission_eligible) {
      return res.status(400).json({
        success: false,
        message: 'This referral is not eligible for payout yet. Ensure all payments are completed.'
      });
    }

    // Check if payout already requested
    if (referral.payout_requested) {
      return res.status(400).json({
        success: false,
        message: 'Payout already requested for this referral'
      });
    }

    // Check if payout already exists
    const { data: existingPayout } = await supabaseAdmin
      .from('partner_payouts')
      .select('id')
      .eq('referral_id', referral_id)
      .single();

    if (existingPayout) {
      return res.status(400).json({
        success: false,
        message: 'Payout already exists for this referral'
      });
    }

    // Create payout request
    const { data: payout, error: payoutError } = await supabaseAdmin
      .from('partner_payouts')
      .insert({
        partner_id: partnerId,
        referral_id: referral_id,
        amount: referral.total_commission_earned,
        status: 'pending',
        requested_at: new Date().toISOString()
      })
      .select()
      .single();

    if (payoutError) {
      console.error('❌ Payout request error:', payoutError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create payout request'
      });
    }

    // Update referral to mark payout as requested
    await supabaseAdmin
      .from('referrals')
      .update({
        payout_requested: true,
        payout_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', referral_id);

    // Create notification for internal team
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_type: 'internal',
        type: 'payout_requested',
        title: 'New Payout Request',
        message: `Partner ${req.partner.company_name} requested payout of ₦${referral.total_commission_earned?.toLocaleString()} for ${referral.prospect_company_name}`,
        metadata: {
          partner_id: partnerId,
          referral_id: referral_id,
          payout_id: payout.id,
          amount: referral.total_commission_earned
        }
      });

    // Create audit log
    await supabaseAdmin
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
      data: { payout }
    });

  } catch (error) {
    console.error('💥 Payout request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating payout request'
    });
  }
});



// @route   PATCH /api/payouts/:id/process
// @desc    Internal team processes payout (records external payment)
// @access  Private (Internal)
router.patch('/:id/process', authenticateInternal, upload.single('proof_of_payment'), async (req, res) => {
  try {
    const payoutId = req.params.id;
    const internalUserId = req.internalUser.id;
    const { amount_paid, payment_reference, notes } = req.body;

    console.log(`🔄 Processing payout: ${payoutId}`);

    if (!amount_paid) {
      return res.status(400).json({
        success: false,
        message: 'Amount paid is required'
      });
    }

    // Get payout details
    const { data: payout, error: payoutError } = await supabaseAdmin
      .from('partner_payouts')
      .select(`
        *,
        partners (id, company_name, contact_name, email, bank_account_number, verified_account_name, bank_code),
        referrals (prospect_company_name, total_commission_earned)
      `)
      .eq('id', payoutId)
      .single();

    if (payoutError || !payout) {
      console.error('❌ Payout not found:', payoutError);
      return res.status(404).json({
        success: false,
        message: 'Payout not found'
      });
    }

    let proof_of_payment_url = null;

    // Upload file to Supabase Storage if provided
    if (req.file) {
      try {
        const uploadResult = await uploadToSupabaseStorage(req.file, 'payout-proofs');
        proof_of_payment_url = uploadResult.publicUrl;
        console.log(`✅ Proof of payment uploaded: ${proof_of_payment_url}`);
      } catch (uploadError) {
        console.error('❌ File upload failed:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload proof of payment'
        });
      }
    }

    // Build update data object dynamically to avoid schema issues
    const updateData = {
      status: 'paid',
      amount: parseFloat(amount_paid)
    };

    // Only add fields that exist in the schema
    if (payment_reference) updateData.payment_reference = payment_reference;
    if (proof_of_payment_url) updateData.proof_of_payment_url = proof_of_payment_url;
    if (internalUserId) updateData.processed_by = internalUserId;
    if (notes) updateData.notes = notes;

    // Add timestamp fields
    updateData.processed_at = new Date().toISOString();
    updateData.updated_at = new Date().toISOString();

    console.log('📝 Update data:', updateData);

    // Update payout as processed - use minimal select to avoid schema issues
    const { data: updatedPayout, error: updateError } = await supabaseAdmin
      .from('partner_payouts')
      .update(updateData)
      .eq('id', payoutId)
      .select('*') // Just select all columns to avoid complex joins
      .single();

    if (updateError) {
      console.error('❌ Payout processing error:', updateError);
      
      // More detailed error logging
      if (updateError.code === 'PGRST204') {
        console.error('Schema cache issue - column might be missing from database');
      }
      
      return res.status(500).json({
        success: false,
        message: `Failed to process payout: ${updateError.message}`
      });
    }

    // Now get the full payout details with joins
    const { data: fullPayout, error: fullPayoutError } = await supabaseAdmin
      .from('partner_payouts')
      .select(`
        *,
        partners (company_name, contact_name, email, bank_account_number, verified_account_name, bank_code),
        referrals (prospect_company_name),
        internal_users:processed_by (name, email)
      `)
      .eq('id', payoutId)
      .single();

    if (fullPayoutError) {
      console.error('❌ Failed to fetch full payout details:', fullPayoutError);
      // Continue with basic payout data
    }

    const finalPayout = fullPayout || updatedPayout;

    // Resolve bank name for the response
    let bank_name = 'Unknown Bank';
    if (finalPayout.partners?.bank_code) {
      try {
        const bankListResult = await PaystackService.getBankList();
        if (bankListResult.success) {
          const bank = bankListResult.data.find(
            b => b.code.toString() === finalPayout.partners.bank_code.toString()
          );
          bank_name = bank?.name || `Bank (${finalPayout.partners.bank_code})`;
        }
      } catch (error) {
        console.error(`Failed to resolve bank code ${finalPayout.partners.bank_code}:`, error);
        bank_name = `Bank (${finalPayout.partners.bank_code})`;
      }
    }

    // Add bank name to response
    const payoutWithBankName = {
      ...finalPayout,
      partners: finalPayout.partners ? {
        ...finalPayout.partners,
        bank_name: bank_name
      } : null
    };

    // Create notification for partner
    await supabaseAdmin
      .from('partner_notifications')
      .insert({
        partner_id: payout.partner_id,
        title: 'Payout Processed ✅',
        message: `Your payout of ₦${parseFloat(amount_paid).toLocaleString()} for ${payout.referrals.prospect_company_name} has been processed. ${proof_of_payment_url ? 'Proof of payment is available in your dashboard.' : ''}`,
        type: 'payout_processed',
        metadata: {
          payout_id: payoutId,
          amount: amount_paid,
          proof_of_payment_url: proof_of_payment_url
        }
      });

    // Create audit log
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: internalUserId,
        user_type: 'internal',
        action: 'update',
        resource_type: 'partner_payouts',
        resource_id: payoutId,
        old_values: payout,
        new_values: finalPayout
      });

    res.json({
      success: true,
      message: 'Payout processed successfully',
      data: { payout: payoutWithBankName }
    });

  } catch (error) {
    console.error('💥 Payout processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while processing payout'
    });
  }
});

// @route   GET /api/payouts/partner
// @desc    Get partner's payout history
// @access  Private (Partner)
router.get('/partner', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.partner.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    console.log(`📋 Fetching payouts for partner: ${partnerId}`);

    const { data: payouts, error, count } = await supabaseAdmin
      .from('partner_payouts')
      .select(`
        *,
        referrals (prospect_company_name, referral_code),
        internal_users:processed_by (name)
      `, { count: 'exact' })
      .eq('partner_id', partnerId)
      .order('requested_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('❌ Fetch payouts error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payouts'
      });
    }

    // Calculate payout statistics
    const { data: allPayouts } = await supabaseAdmin
      .from('partner_payouts')
      .select('amount, status')
      .eq('partner_id', partnerId);

    const stats = {
      total_payouts: allPayouts?.length || 0,
      total_paid: allPayouts?.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0) || 0,
      pending_payouts: allPayouts?.filter(p => p.status === 'pending').length || 0,
      paid_payouts: allPayouts?.filter(p => p.status === 'paid').length || 0
    };

    res.json({
      success: true,
      data: {
        payouts: payouts || [],
        statistics: stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('💥 Fetch payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching payouts'
    });
  }
});

// @route   GET /api/payouts/internal
// @desc    Get all payout requests for internal team
// @access  Private (Internal)
// Update the GET /api/payouts/internal endpoint
router.get('/internal', authenticateInternal, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    console.log(`📋 Fetching all payouts for internal team`);

    let query = supabaseAdmin
      .from('partner_payouts')
      .select(`
        *,
        partners (company_name, contact_name, email, bank_account_number, verified_account_name, bank_code),
        referrals (prospect_company_name, referral_code, total_commission_earned),
        internal_users:processed_by (name, email)
      `, { count: 'exact' })
      .order('requested_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: payouts, error, count } = await query;

    if (error) {
      console.error('❌ Fetch payouts error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payouts'
      });
    }

    // Resolve bank names for all payouts
    const payoutsWithBankNames = await Promise.all(
      (payouts || []).map(async (payout) => {
        let bank_name = 'Unknown Bank';
        
        if (payout.partners?.bank_code) {
          try {
            // Resolve bank name using Paystack
            const bankListResult = await PaystackService.getBankList();
            if (bankListResult.success) {
              const bank = bankListResult.data.find(
                b => b.code.toString() === payout.partners.bank_code.toString()
              );
              bank_name = bank?.name || `Bank (${payout.partners.bank_code})`;
            }
          } catch (error) {
            console.error(`Failed to resolve bank code ${payout.partners.bank_code}:`, error);
            bank_name = `Bank (${payout.partners.bank_code})`;
          }
        }

        return {
          ...payout,
          partners: {
            ...payout.partners,
            bank_name: bank_name
          }
        };
      })
    );

    // Calculate statistics
    const { data: allPayouts } = await supabaseAdmin
      .from('partner_payouts')
      .select('status, amount');

    const stats = {
      total: allPayouts?.length || 0,
      pending: allPayouts?.filter(p => p.status === 'pending').length || 0,
      paid: allPayouts?.filter(p => p.status === 'paid').length || 0,
      total_amount_pending: allPayouts?.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0) || 0,
      total_amount_paid: allPayouts?.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0) || 0
    };

    res.json({
      success: true,
      data: {
        payouts: payoutsWithBankNames,
        statistics: stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('💥 Fetch payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching payouts'
    });
  }
});

// @route   GET /api/payouts/eligible
// @desc    Get partner's referrals eligible for payout
// @access  Private (Partner)
router.get('/eligible', authenticatePartner, async (req, res) => {
  try {
    const partnerId = req.partner.id;

    console.log(`📋 Fetching eligible payouts for partner: ${partnerId}`);

    const { data: referrals, error } = await supabaseAdmin
      .from('referrals')
      .select(`
        id,
        referral_code,
        prospect_company_name,
        total_commission_earned,
        status,
        commission_eligible,
        payout_requested,
        created_at
      `)
      .eq('partner_id', partnerId)
      .eq('status', 'fully_paid')
      .eq('commission_eligible', true)
      .eq('payout_requested', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Fetch eligible payouts error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch eligible payouts'
      });
    }

    res.json({
      success: true,
      data: {
        referrals: referrals || [],
        total_eligible: referrals?.length || 0,
        total_commission: referrals?.reduce((sum, r) => sum + (r.total_commission_earned || 0), 0) || 0
      }
    });

  } catch (error) {
    console.error('💥 Fetch eligible payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching eligible payouts'
    });
  }
});

// @route   GET /api/payouts/:id
// @desc    Get specific payout details
// @access  Private (Internal/Partner)
router.get('/:id', authenticateInternal, async (req, res) => {
  try {
    const payoutId = req.params.id;

    console.log(`📋 Fetching payout details: ${payoutId}`);

    // Get payout with all details
    const { data: payout, error } = await supabaseAdmin
      .from('partner_payouts')
      .select(`
        *,
        partners (company_name, contact_name, email, bank_account_number, verified_account_name, bank_code),
        referrals (prospect_company_name, referral_code, total_commission_earned),
        internal_users:processed_by (name, email)
      `)
      .eq('id', payoutId)
      .single();

    if (error || !payout) {
      console.error('❌ Payout details error:', error);
      return res.status(404).json({
        success: false,
        message: 'Payout details not found: ' + error?.message
      });
    }

    // Resolve bank name
    let bank_name = 'Unknown Bank';
    if (payout.partners?.bank_code) {
      try {
        const bankListResult = await PaystackService.getBankList();
        if (bankListResult.success) {
          const bank = bankListResult.data.find(
            b => b.code.toString() === payout.partners.bank_code.toString()
          );
          bank_name = bank?.name || `Bank (${payout.partners.bank_code})`;
        }
      } catch (error) {
        console.error(`Failed to resolve bank code ${payout.partners.bank_code}:`, error);
        bank_name = `Bank (${payout.partners.bank_code})`;
      }
    }

    // Add bank name to payout data
    const payoutWithBankName = {
      ...payout,
      partners: {
        ...payout.partners,
        bank_name: bank_name
      }
    };

    console.log('✅ Payout found with bank name:', payoutWithBankName.id);
    res.json({
      success: true,
      data: { payout: payoutWithBankName }
    });

  } catch (error) {
    console.error('💥 Fetch payout details error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching payout details'
    });
  }
});

// @route   GET /api/payouts/:id
// @desc    Get specific payout details
// @access  Private (Internal/Partner)
router.get('/:id', authenticatePartner, async (req, res) => {
  try {
    const payoutId = req.params.id;

    console.log(`📋 Fetching payout details: ${payoutId}`);

    // Get payout with all details
    const { data: payout, error } = await supabaseAdmin
      .from('partner_payouts')
      .select(`
        *,
        partners (company_name, contact_name, email, bank_account_number, verified_account_name, bank_code),
        referrals (prospect_company_name, referral_code, total_commission_earned),
        internal_users:processed_by (name, email)
      `)
      .eq('id', payoutId)
      .single();

    if (error || !payout) {
      console.error('❌ Payout details error:', error);
      return res.status(404).json({
        success: false,
        message: 'Payout details not found: ' + error?.message
      });
    }

    // Resolve bank name
    let bank_name = 'Unknown Bank';
    if (payout.partners?.bank_code) {
      try {
        const bankListResult = await PaystackService.getBankList();
        if (bankListResult.success) {
          const bank = bankListResult.data.find(
            b => b.code.toString() === payout.partners.bank_code.toString()
          );
          bank_name = bank?.name || `Bank (${payout.partners.bank_code})`;
        }
      } catch (error) {
        console.error(`Failed to resolve bank code ${payout.partners.bank_code}:`, error);
        bank_name = `Bank (${payout.partners.bank_code})`;
      }
    }

    // Add bank name to payout data
    const payoutWithBankName = {
      ...payout,
      partners: {
        ...payout.partners,
        bank_name: bank_name
      }
    };

    console.log('✅ Payout found with bank name:', payoutWithBankName.id);
    res.json({
      success: true,
      data: { payout: payoutWithBankName }
    });

  } catch (error) {
    console.error('💥 Fetch payout details error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching payout details'
    });
  }
});

// @route   GET /api/banks/resolve/:bankCode
// @desc    Resolve bank code to bank name using Paystack
// @access  Private (Internal)
router.get('/resolve/:bankCode', authenticateInternal, async (req, res) => {
  try {
    const { bankCode } = req.params;

    console.log(`🏦 Resolving bank code: ${bankCode}`);

    if (!bankCode) {
      return res.status(400).json({
        success: false,
        message: 'Bank code is required'
      });
    }

    // Get the full bank list from Paystack
    const bankListResult = await PaystackService.getBankList();
    
    if (!bankListResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch bank list from Paystack'
      });
    }

    // Find the bank by code
    const bank = bankListResult.data.find(b => b.code.toString() === bankCode.toString());
    
    if (!bank) {
      console.log(`❌ Bank code ${bankCode} not found in Paystack list`);
      return res.status(404).json({
        success: false,
        message: `Bank code ${bankCode} not found`
      });
    }

    console.log(`✅ Resolved bank code ${bankCode} to: ${bank.name}`);

    res.json({
      success: true,
      data: {
        bank_code: bankCode,
        bank_name: bank.name,
        bank_slug: bank.slug
      }
    });

  } catch (error) {
    console.error('💥 Bank resolution error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while resolving bank code'
    });
  }
});

// @route   GET /api/banks/list
// @desc    Get all banks from Paystack
// @access  Private (Internal)
router.get('/list', authenticateInternal, async (req, res) => {
  try {
    console.log('🏦 Fetching bank list from Paystack...');

    const bankListResult = await PaystackService.getBankList();
    
    if (!bankListResult.success) {
      return res.status(500).json({
        success: false,
        message: bankListResult.message || 'Failed to fetch bank list'
      });
    }

    res.json({
      success: true,
      data: bankListResult.data
    });

  } catch (error) {
    console.error('💥 Bank list error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching bank list'
    });
  }
});



export default router;