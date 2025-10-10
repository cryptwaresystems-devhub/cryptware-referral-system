import axios from 'axios';

class PaystackService {
  constructor() {
    this.apiKey = process.env.PAYSTACK_SECRET_KEY;
    this.baseURL = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  // Verify bank account
  async verifyBankAccount(accountNumber, bankCode) {
    try {
      console.log(`🔍 Verifying bank account: ${accountNumber}, Bank: ${bankCode}`);
      
      const response = await this.axiosInstance.get(
        `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
      );

      if (response.data.status) {
        console.log(`✅ Bank account verified: ${response.data.data.account_name}`);
        return {
          success: true,
          data: {
            account_name: response.data.data.account_name,
            account_number: response.data.data.account_number,
            bank_name: response.data.data.bank_name || 'Unknown Bank'
          }
        };
      } else {
        console.log('❌ Bank verification failed:', response.data.message);
        return {
          success: false,
          message: response.data.message || 'Bank account verification failed'
        };
      }
    } catch (error) {
      console.error('Paystack verification error:', error.response?.data || error.message);
      
      return {
        success: false,
        message: error.response?.data?.message || 'Bank account verification failed'
      };
    }
  }

  // Get list of supported banks
  // Get list of supported banks
  async getBankList() {
    try {
      console.log('🔍 Fetching bank list from Paystack...');
      
      const response = await this.axiosInstance.get('/bank', {
        params: {
          country: 'nigeria',
          perPage: 100 // Get all banks
        }
      });

      console.log('📊 Paystack bank list response:', response.data);

      if (response.data.status) {
        const banks = response.data.data.map(bank => ({
          id: bank.id,
          name: bank.name,
          code: bank.code,
          slug: bank.slug
        }));
        
        console.log(`✅ Retrieved ${banks.length} banks from Paystack`);
        
        return {
          success: true,
          data: banks
        };
      } else {
        console.error('❌ Paystack bank list failed:', response.data.message);
        return {
          success: false,
          message: response.data.message || 'Failed to fetch bank list'
        };
      }
    } catch (error) {
      console.error('💥 Paystack bank list error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to connect to bank service'
      };
    }
  }
}

export default new PaystackService();