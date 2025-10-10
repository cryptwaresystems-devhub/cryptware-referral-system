import express from 'express';
import { supabaseAdmin } from '../config/supabase-admin.js';
import paystackService from '../services/paystack-service.js';

const router = express.Router();

router.get('/list', async (req, res) => {
  try {
    console.log('🏦 Fetching bank list from Paystack...');
    
    const banks = await paystackService.getBankList();
    
    if (!banks.success) {
      console.error('❌ Failed to fetch bank list:', banks.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch bank list from payment provider'
      });
    }

    console.log(`✅ Retrieved ${banks.data.length} banks from Paystack`);
    
    res.json({
      success: true,
      data: banks.data
    });

  } catch (error) {
    console.error('💥 Bank list error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching banks'
    });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { accountNumber, bankCode, email } = req.body;

    if (!accountNumber || !bankCode || !email) {
      return res.status(400).json({
        success: false,
        message: 'Account number, bank code, and email are required'
      });
    }

    console.log(`🏦 Verifying bank: ${accountNumber} (${bankCode}) for email: ${email}`);

    const banksResult = await paystackService.getBankList();
    let bankName = 'Unknown Bank';
    
    if (banksResult.success) {
      const bank = banksResult.data.find(b => b.code === bankCode);
      if (bank) {
        bankName = bank.name;
      }
    }

    const verificationResult = await paystackService.verifyBankAccount(
      accountNumber,
      bankCode
    );

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message || 'Bank account verification failed'
      });
    }

    console.log('✅ Bank verification successful:', verificationResult.data.account_name);

    res.json({
      success: true,
      message: 'Bank account verified successfully',
      data: {
        accountName: verificationResult.data.account_name,
        accountNumber: verificationResult.data.account_number,
        bankName: bankName,
        bankCode: bankCode
      }
    });

  } catch (error) {
    console.error('Bank verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during bank verification'
    });
  }
});

router.post('/update-partner', async (req, res) => {
  try {
    const { partnerId, accountNumber, bankCode, verifiedAccountName } = req.body;

    if (!partnerId || !accountNumber || !bankCode || !verifiedAccountName) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required to update partner bank details'
      });
    }

    console.log(`🏦 Updating bank details for partner: ${partnerId}`);

    // Update partner with ADMIN client
    const { data: updatedPartner, error: updateError } = await supabaseAdmin
      .from('partners')
      .update({
        bank_account_number: accountNumber,
        bank_code: bankCode,
        verified_account_name: verifiedAccountName,
        bank_verified: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', partnerId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Partner update error:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update partner bank details: ' + updateError.message
      });
    }

    console.log('✅ Partner bank details updated successfully');

    res.json({
      success: true,
      message: 'Bank details updated successfully',
      data: updatedPartner
    });

  } catch (error) {
    console.error('Update partner error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating partner'
    });
  }
});

export default router;