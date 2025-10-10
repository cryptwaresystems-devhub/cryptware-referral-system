import { CONFIG } from './config.js';
import Toast from './utils/toast.js';

class PartnerSignup {
    constructor() {
        this.currentStep = 1;
        this.bankVerified = false;
        this.formData = {};
        this.bankVerificationData = null;
        
        this.init();
    }

    init() {
        this.loadBanks();
        this.setupEventListeners();
        this.showTestModeNotice();
        this.updateProgressTracker(1);
    }

    setupEventListeners() {
        const form = document.getElementById('partnerSignupForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        // Real-time password validation
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        
        if (passwordInput) {
            passwordInput.addEventListener('input', () => this.validatePasswords());
        }
        if (confirmPasswordInput) {
            confirmPasswordInput.addEventListener('input', () => this.validatePasswords());
        }

        // Auto-format phone number
        const phoneInput = document.getElementById('phone');
        if (phoneInput) {
            phoneInput.addEventListener('input', (e) => this.formatPhoneNumber(e));
        }
    }

    nextStep(next) {
        if (this.validateStep(this.currentStep)) {
            this.saveStepData(this.currentStep);
            document.getElementById(`step${this.currentStep}`).classList.add('hidden');
            document.getElementById(`step${next}`).classList.remove('hidden');
            
            this.updateProgressTracker(next);
            this.currentStep = next;
            
            this.loadStepData(next);
        }
    }

    prevStep(prev) {
        this.saveStepData(this.currentStep);
        document.getElementById(`step${this.currentStep}`).classList.add('hidden');
        document.getElementById(`step${prev}`).classList.remove('hidden');
        this.currentStep = prev;
        this.updateProgressTracker(prev);
    }

    updateProgressTracker(currentStep) {
        const steps = document.querySelectorAll('.progress-step');
        steps.forEach((step, index) => {
            const stepNumber = index + 1;
            step.classList.remove('active', 'completed', 'pending');
            
            if (stepNumber === currentStep) {
                step.classList.add('active');
            } else if (stepNumber < currentStep) {
                step.classList.add('completed');
            } else {
                step.classList.add('pending');
            }
        });
    }

    saveStepData(step) {
        switch(step) {
            case 1:
                this.formData.companyName = document.getElementById('companyName').value;
                this.formData.cacNumber = document.getElementById('cacNumber').value;
                this.formData.tinNumber = document.getElementById('tinNumber').value;
                break;
            case 2:
                this.formData.contactName = document.getElementById('contactName').value;
                this.formData.email = document.getElementById('email').value;
                this.formData.phone = document.getElementById('phone').value;
                this.formData.address = document.getElementById('address').value;
                break;
        }
    }

    loadStepData(step) {
        switch(step) {
            case 1:
                if (this.formData.companyName) document.getElementById('companyName').value = this.formData.companyName;
                if (this.formData.cacNumber) document.getElementById('cacNumber').value = this.formData.cacNumber;
                if (this.formData.tinNumber) document.getElementById('tinNumber').value = this.formData.tinNumber;
                break;
            case 2:
                if (this.formData.contactName) document.getElementById('contactName').value = this.formData.contactName;
                if (this.formData.email) document.getElementById('email').value = this.formData.email;
                if (this.formData.phone) document.getElementById('phone').value = this.formData.phone;
                if (this.formData.address) document.getElementById('address').value = this.formData.address;
                break;
        }
    }

    validateStep(step) {
        switch(step) {
            case 1:
                return this.validateCompanyInfo();
            case 2:
                return this.validateContactDetails();
            case 3:
                return this.validateBankVerification();
            case 4:
                return this.validateSecuritySetup();
        }
        return true;
    }

    validateCompanyInfo() {
        const companyName = document.getElementById('companyName').value.trim();
        const cacNumber = document.getElementById('cacNumber').value.trim();

        if (!companyName) {
            Toast.error('Please enter your company name');
            document.getElementById('companyName').focus();
            return false;
        }

        if (!cacNumber) {
            Toast.error('Please enter your CAC registration number');
            document.getElementById('cacNumber').focus();
            return false;
        }

        return true;
    }

    validateContactDetails() {
        const contactName = document.getElementById('contactName').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();

        if (!contactName) {
            Toast.error('Please enter contact person name');
            document.getElementById('contactName').focus();
            return false;
        }

        if (!email) {
            Toast.error('Please enter email address');
            document.getElementById('email').focus();
            return false;
        }

        if (!this.isValidEmail(email)) {
            Toast.error('Please enter a valid email address');
            document.getElementById('email').focus();
            return false;
        }

        if (!phone) {
            Toast.error('Please enter phone number');
            document.getElementById('phone').focus();
            return false;
        }

        return true;
    }

    validateBankVerification() {
        if (!this.bankVerified) {
            Toast.error('Please verify your bank account before proceeding');
            return false;
        }
        return true;
    }

    validateSecuritySetup() {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (!password) {
            Toast.error('Please create a password');
            document.getElementById('password').focus();
            return false;
        }

        if (password.length < 8) {
            Toast.error('Password must be at least 8 characters long');
            document.getElementById('password').focus();
            return false;
        }

        if (!confirmPassword) {
            Toast.error('Please confirm your password');
            document.getElementById('confirmPassword').focus();
            return false;
        }

        if (password !== confirmPassword) {
            Toast.error('Passwords do not match');
            document.getElementById('confirmPassword').focus();
            return false;
        }

        return true;
    }

    validatePasswords() {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const passwordMatch = document.getElementById('passwordMatch');
        const submitBtn = document.getElementById('submitBtn');

        if (password && confirmPassword) {
            if (password === confirmPassword && password.length >= 8) {
                passwordMatch.textContent = '✓ Passwords match';
                passwordMatch.className = 'text-xs text-green-600 mt-1';
                passwordMatch.classList.remove('hidden');
                submitBtn.disabled = false;
            } else {
                passwordMatch.textContent = '✗ Passwords do not match';
                passwordMatch.className = 'text-xs text-red-600 mt-1';
                passwordMatch.classList.remove('hidden');
                submitBtn.disabled = true;
            }
        } else {
            passwordMatch.classList.add('hidden');
            submitBtn.disabled = true;
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    formatPhoneNumber(e) {
        let value = e.target.value.replace(/\D/g, '');
        
        if (value.startsWith('234')) {
            value = '+' + value;
        } else if (value.startsWith('0')) {
            value = '+234' + value.substring(1);
        } else if (value.length > 0 && !value.startsWith('+')) {
            value = '+234' + value;
        }

        if (value.startsWith('+234') && value.length > 4) {
            const parts = [
                value.substring(0, 4),
                value.substring(4, 7),
                value.substring(7, 10),
                value.substring(10, 14)
            ].filter(part => part.length > 0);
            
            e.target.value = parts.join(' ');
        } else {
            e.target.value = value;
        }
    }

    async makeRequest(method, url, data = null) {
        try {
            const config = {
                method,
                url: `${CONFIG.API.BASE_URL}${url}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            };

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error(`API ${method} ${url} error:`, error);
            throw error;
        }
    }

    async verifyBankAccount() {
        const bankCode = document.getElementById('bankCode').value;
        const accountNumber = document.getElementById('accountNumber').value;
        
        if (!bankCode || !accountNumber) {
            Toast.error('Please select your bank and enter account number');
            return;
        }
    
        if (accountNumber.length !== 10) {
            Toast.error('Please enter a valid 10-digit account number');
            return;
        }
    
        const verifyBtn = document.getElementById('verifyBankBtn');
        verifyBtn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> Verifying...';
        verifyBtn.disabled = true;
    
        try {
            const result = await this.makeRequest('post', '/bank/verify', {
                accountNumber: accountNumber.replace(/\D/g, ''),
                bankCode: bankCode,
                email: this.formData.email
            });
    
            if (result.success) {
                this.bankVerified = true;
                this.bankVerificationData = result.data;
                this.showBankVerificationSuccess(result.data);
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            let errorMessage = 'Bank verification failed';
            
            if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            if (errorMessage.includes('test mode') || errorMessage.includes('daily limit')) {
                errorMessage = 'Test mode: Use Zenith Bank (057) with account 0000000000 for testing.';
            }
            
            Toast.error(errorMessage);
            verifyBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verify Bank Account';
            verifyBtn.disabled = false;
        }
    }

    showBankVerificationSuccess(data) {
        const resultDiv = document.getElementById('bankVerificationResult');
        resultDiv.innerHTML = `
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <i class="fas fa-check-circle text-green-500 text-2xl mr-3"></i>
                        <div>
                            <div class="font-semibold text-green-700">Account Verified Successfully</div>
                            <div class="text-sm text-green-600">${data.accountName} • ${data.bankName}</div>
                        </div>
                    </div>
                    <span class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                        <i class="fas fa-shield-check"></i>
                        Verified
                    </span>
                </div>
                
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div class="flex items-start">
                        <i class="fas fa-info-circle text-blue-500 mt-1 mr-3"></i>
                        <div>
                            <p class="text-blue-800 text-sm font-medium">
                                ✅ Your bank account has been verified successfully! 
                                Click "Continue to Security" to proceed.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        resultDiv.classList.remove('hidden', 'border-gray-300');
        resultDiv.classList.add('border-green-200', 'bg-green-50');
    
        const verifyBtn = document.getElementById('verifyBankBtn');
        verifyBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verified';
        verifyBtn.disabled = true;
    }

    async loadBanks() {
        try {
            console.log('Loading bank list...');
            
            const result = await this.makeRequest('get', '/bank/list');
            
            if (result.success && result.data) {
                const bankSelect = document.getElementById('bankCode');
                bankSelect.innerHTML = '<option value="">Choose your bank...</option>';
                
                const sortedBanks = result.data.sort((a, b) => a.name.localeCompare(b.name));
                
                sortedBanks.forEach(bank => {
                    const option = document.createElement('option');
                    option.value = bank.code;
                    option.textContent = bank.name;
                    bankSelect.appendChild(option);
                });
                
                console.log(`Loaded ${sortedBanks.length} banks into dropdown`);
            } else {
                throw new Error(result.message || 'Failed to load bank list');
            }
        } catch (error) {
            console.error('Failed to load banks:', error);
            this.showManualBankInput();
            Toast.error('Unable to load bank list. Please select your bank manually.');
        }
    }

    showManualBankInput() {
        const bankSelect = document.getElementById('bankCode');
        bankSelect.innerHTML = `
            <option value="">Choose your bank...</option>
            <option value="044">Access Bank</option>
            <option value="063">Access Bank (Diamond)</option>
            <option value="035">ALAT by WEMA</option>
            <option value="050">Ecobank Nigeria</option>
            <option value="070">Fidelity Bank</option>
            <option value="011">First Bank of Nigeria</option>
            <option value="214">First City Monument Bank</option>
            <option value="058">GTBank</option>
            <option value="030">Heritage Bank</option>
            <option value="301">Jaiz Bank</option>
            <option value="082">Keystone Bank</option>
            <option value="076">Polaris Bank</option>
            <option value="101">Providus Bank</option>
            <option value="221">Stanbic IBTC Bank</option>
            <option value="068">Standard Chartered Bank</option>
            <option value="232">Sterling Bank</option>
            <option value="100">Suntrust Bank</option>
            <option value="032">Union Bank of Nigeria</option>
            <option value="033">United Bank For Africa</option>
            <option value="215">Unity Bank</option>
            <option value="035">Wema Bank</option>
            <option value="057">Zenith Bank</option>
        `;
    }

    showTestModeNotice() {
        if (CONFIG.API.BASE_URL.includes('localhost') || CONFIG.API.BASE_URL.includes('127.0.0.1')) {
            const noticeDiv = document.createElement('div');
            noticeDiv.className = 'bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6';
            noticeDiv.innerHTML = `
                <div class="flex items-start">
                    <i class="fas fa-flask text-yellow-600 mt-1 mr-3"></i>
                    <div>
                        <h4 class="font-semibold text-yellow-800 mb-1">🧪 Development Mode</h4>
                        <p class="text-yellow-700 text-sm">
                            <strong>Test Bank:</strong> Zenith Bank (057)<br>
                            <strong>Test Accounts:</strong> 0000000000, 1111111111, 2222222222
                        </p>
                    </div>
                </div>
            `;
            
            const bankSection = document.querySelector('#step3 .grid');
            if (bankSection) {
                bankSection.parentNode.insertBefore(noticeDiv, bankSection);
            }
        }
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        if (!this.validateStep(4)) return;
    
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> Creating Account...';
        submitBtn.disabled = true;
    
        try {
            const formData = {
                companyName: this.formData.companyName,
                cacNumber: this.formData.cacNumber,
                tinNumber: this.formData.tinNumber,
                contactName: this.formData.contactName,
                email: this.formData.email,
                phone: this.formData.phone.replace(/\D/g, ''),
                address: this.formData.address,
                password: document.getElementById('password').value
            };
    
            if (this.bankVerified && this.bankVerificationData) {
                formData.bankAccountNumber = this.bankVerificationData.accountNumber;
                formData.bankCode = this.bankVerificationData.bankCode;
                formData.verifiedAccountName = this.bankVerificationData.accountName;
            }
    
            console.log('Submitting registration data');
    
            const result = await this.makeRequest('post', '/auth/register', formData);
    
            if (result.success) {
                Toast.success('🎉 Registration Successful! Check your email for verification code.', 6000);
    
                setTimeout(() => {
                    const redirectUrl = `email-verification.html?partnerId=${result.data.partnerId}&email=${encodeURIComponent(result.data.email)}`;
                    if (result.data.otpCode) {
                        window.location.href = redirectUrl + `&otpCode=${result.data.otpCode}`;
                    } else {
                        window.location.href = redirectUrl;
                    }
                }, 3000);
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            let errorMessage = 'Registration failed';
            
            if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            Toast.error(errorMessage);
            submitBtn.innerHTML = '<i class="fas fa-rocket"></i> Complete Registration';
            submitBtn.disabled = false;
        }
    }
}

window.nextStep = function(next) {
    if (window.PartnerSignup) {
        window.PartnerSignup.nextStep(next);
    }
};

window.prevStep = function(prev) {
    if (window.PartnerSignup) {
        window.PartnerSignup.prevStep(prev);
    }
};

window.verifyBankAccount = function() {
    if (window.PartnerSignup) {
        window.PartnerSignup.verifyBankAccount();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.PartnerSignup = new PartnerSignup();
});

export default PartnerSignup;