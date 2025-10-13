// generate-referral.js - Complete Referral Generation System
import { apiClient, CONFIG } from './config.js';
import Toast from './utils/toast.js';
import { AuthManager } from './auth-manager.js';

class ReferralGenerator {
    constructor() {
        this.currentStep = 1;
        this.formData = {};
        this.init();
    }

    async init() {
        try {
            // Check authentication
            const isAuthenticated = await AuthManager.requireAuth('partner');
            if (!isAuthenticated) return;

            // Load partner data
            await this.loadPartnerData();
            
            // Show main content
            this.showMainContent();

            // Initialize form handlers
            this.initializeFormHandlers();

            console.log('✅ Referral generator initialized');
        } catch (error) {
            console.error('❌ Initialization error:', error);
            Toast.error('Failed to initialize referral generator');
        }
    }

    async loadPartnerData() {
        try {
            const currentUser = AuthManager.getCurrentUser();
            if (currentUser && currentUser.type === 'partner') {
                document.getElementById('partnerCompanyName').textContent = currentUser.data.company_name;
            }
        } catch (error) {
            console.error('Error loading partner data:', error);
        }
    }

    showMainContent() {
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
        
        // Add slide-in animations
        const elements = document.querySelectorAll('.slide-in');
        elements.forEach((el, index) => {
            el.style.animationDelay = `${index * 0.1}s`;
        });
    }

    initializeFormHandlers() {
        // Real-time validation
        document.getElementById('prospectCompany').addEventListener('blur', () => this.validateCompany());
        document.getElementById('companyIndustry').addEventListener('change', () => this.validateIndustry());
        document.getElementById('contactName').addEventListener('blur', () => this.validateContactName());
        document.getElementById('contactEmail').addEventListener('blur', () => this.validateEmail());
        document.getElementById('contactPhone').addEventListener('blur', () => this.validatePhone());

        // Commission preview
        document.getElementById('estimatedDealValue').addEventListener('input', () => this.updateCommissionPreview());

        // Form submission
        document.getElementById('referralForm').addEventListener('submit', (e) => this.handleFormSubmit(e));

        // Enter key navigation
        this.setupEnterKeyNavigation();
    }

    setupEnterKeyNavigation() {
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const activeStep = document.querySelector('.form-step.active');
                const inputs = activeStep.querySelectorAll('input, select, textarea');
                const focusedElement = document.activeElement;
                
                // Check if focused element is in current step
                if (Array.from(inputs).includes(focusedElement)) {
                    e.preventDefault();
                    
                    // Find next input or proceed to next step
                    const currentIndex = Array.from(inputs).indexOf(focusedElement);
                    if (currentIndex < inputs.length - 1) {
                        inputs[currentIndex + 1].focus();
                    } else if (this.currentStep < 3) {
                        this.nextStep(this.currentStep + 1);
                    }
                }
            }
        });
    }

    // Step Navigation
    nextStep(step) {
        if (!this.validateStep(this.currentStep)) {
            this.shakeStep(this.currentStep);
            return;
        }

        // Save step data
        this.saveStepData(this.currentStep);

        // Animate step transition
        this.animateStepTransition(this.currentStep, step);
        
        this.currentStep = step;

        // Update summary if going to step 3
        if (step === 3) {
            this.updateSummary();
        }
    }

    prevStep(step) {
        this.animateStepTransition(this.currentStep, step, true);
        this.currentStep = step;
    }

    animateStepTransition(fromStep, toStep, isBackward = false) {
        const fromElement = document.getElementById(`step${fromStep}`);
        const toElement = document.getElementById(`step${toStep}`);

        // Add exit animation
        fromElement.style.transform = isBackward ? 'translateX(20px)' : 'translateX(-20px)';
        fromElement.style.opacity = '0';

        setTimeout(() => {
            fromElement.classList.remove('active');
            toElement.classList.add('active');
            
            // Add entry animation
            toElement.style.transform = 'translateX(0)';
            toElement.style.opacity = '1';

            // Update progress indicators
            this.updateProgressIndicators(fromStep, toStep, isBackward);

            // Focus first input in new step
            const firstInput = toElement.querySelector('input, select, textarea');
            if (firstInput) firstInput.focus();
        }, 300);
    }

    updateProgressIndicators(fromStep, toStep, isBackward = false) {
        const progressBar = document.getElementById('progressBar');
        const indicators = document.querySelectorAll('.step-indicator');

        if (isBackward) {
            // Reset steps after current step
            indicators.forEach((indicator, index) => {
                if (index + 1 > toStep) {
                    indicator.classList.remove('active', 'completed');
                }
            });
        } else {
            // Mark current step as completed and next as active
            indicators[fromStep - 1].classList.remove('active');
            indicators[fromStep - 1].classList.add('completed');
            indicators[toStep - 1].classList.add('active');
        }

        // Update progress bar with smooth animation
        const progress = ((toStep - 1) / 2) * 100;
        progressBar.style.transition = 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
        progressBar.style.width = `${progress}%`;
    }

    saveStepData(step) {
        switch (step) {
            case 1:
                this.formData.company = {
                    name: document.getElementById('prospectCompany').value.trim(),
                    industry: document.getElementById('companyIndustry').value,
                    estimatedDealValue: parseFloat(document.getElementById('estimatedDealValue').value) || 0
                };
                break;
            case 2:
                this.formData.contact = {
                    name: document.getElementById('contactName').value.trim(),
                    title: document.getElementById('contactTitle').value.trim(),
                    email: document.getElementById('contactEmail').value.trim(),
                    phone: document.getElementById('contactPhone').value.trim(),
                    notes: document.getElementById('additionalNotes').value.trim()
                };
                break;
        }
    }

    // Validation Methods
    validateStep(step) {
        switch (step) {
            case 1:
                return this.validateCompany() && this.validateIndustry();
            case 2:
                return this.validateContactName() && this.validateEmail() && this.validatePhone();
            default:
                return true;
        }
    }

    validateCompany() {
        const company = document.getElementById('prospectCompany');
        const error = document.getElementById('companyError');
        
        if (!company.value.trim()) {
            this.showError(company, error, 'Company name is required');
            return false;
        }
        
        if (company.value.trim().length < 2) {
            this.showError(company, error, 'Company name must be at least 2 characters');
            return false;
        }
        
        this.clearError(company, error);
        return true;
    }

    validateIndustry() {
        const industry = document.getElementById('companyIndustry');
        const error = document.getElementById('industryError');
        
        if (!industry.value) {
            this.showError(industry, error, 'Please select an industry');
            return false;
        }
        
        this.clearError(industry, error);
        return true;
    }

    validateContactName() {
        const name = document.getElementById('contactName');
        const error = document.getElementById('contactNameError');
        
        if (!name.value.trim()) {
            this.showError(name, error, 'Contact name is required');
            return false;
        }
        
        if (name.value.trim().length < 2) {
            this.showError(name, error, 'Contact name must be at least 2 characters');
            return false;
        }
        
        this.clearError(name, error);
        return true;
    }

    validateEmail() {
        const email = document.getElementById('contactEmail');
        const error = document.getElementById('contactEmailError');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!email.value.trim()) {
            this.showError(email, error, 'Email address is required');
            return false;
        }
        
        if (!emailRegex.test(email.value.trim())) {
            this.showError(email, error, 'Please enter a valid email address');
            return false;
        }
        
        this.clearError(email, error);
        return true;
    }

    validatePhone() {
        const phone = document.getElementById('contactPhone');
        const error = document.getElementById('contactPhoneError');
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        
        if (!phone.value.trim()) {
            this.showError(phone, error, 'Phone number is required');
            return false;
        }
        
        // Remove spaces and special characters for validation
        const cleanPhone = phone.value.replace(/[\s\-\(\)]/g, '');
        
        if (!phoneRegex.test(cleanPhone)) {
            this.showError(phone, error, 'Please enter a valid phone number');
            return false;
        }
        
        this.clearError(phone, error);
        return true;
    }

    showError(input, errorElement, message) {
        input.classList.add('error');
        errorElement.textContent = message;
        errorElement.classList.add('show');
        
        // Add shake animation
        input.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            input.style.animation = '';
        }, 500);
    }

    clearError(input, errorElement) {
        input.classList.remove('error');
        errorElement.classList.remove('show');
        errorElement.textContent = '';
    }

    shakeStep(step) {
        const stepElement = document.getElementById(`step${step}`);
        stepElement.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            stepElement.style.animation = '';
        }, 500);
    }

    // Commission Preview
    updateCommissionPreview() {
        const dealValue = parseFloat(document.getElementById('estimatedDealValue').value) || 0;
        const commission = dealValue * CONFIG.COMMISSION_RATE;
        const preview = document.getElementById('commissionPreview');

        if (dealValue > 0) {
            document.getElementById('previewCommission').textContent = `${CONFIG.CURRENCY}${commission.toLocaleString()}`;
            document.getElementById('previewDealValue').textContent = `on ${CONFIG.CURRENCY}${dealValue.toLocaleString()} deal`;
            preview.classList.remove('hidden');
            
            // Add pulse animation for new values
            preview.style.animation = 'pulseGlow 1s ease-in-out';
            setTimeout(() => {
                preview.style.animation = '';
            }, 1000);
        } else {
            preview.classList.add('hidden');
        }
    }

    // Summary Update
    updateSummary() {
        // Company details
        document.getElementById('summaryCompany').textContent = this.formData.company.name;
        
        const industrySelect = document.getElementById('companyIndustry');
        const industryText = industrySelect.options[industrySelect.selectedIndex].text;
        document.getElementById('summaryIndustry').textContent = industryText;
        
        const dealValue = this.formData.company.estimatedDealValue;
        document.getElementById('summaryDealValue').textContent = dealValue > 0 ? 
            `${CONFIG.CURRENCY}${dealValue.toLocaleString()}` : 'Not specified';

        // Contact details
        document.getElementById('summaryContactName').textContent = this.formData.contact.name;
        document.getElementById('summaryContactTitle').textContent = this.formData.contact.title || 'Not specified';
        document.getElementById('summaryContactEmail').textContent = this.formData.contact.email;
        document.getElementById('summaryContactPhone').textContent = this.formData.contact.phone;

        // Commission
        const commission = dealValue * CONFIG.COMMISSION_RATE;
        document.getElementById('summaryCommission').textContent = `${CONFIG.CURRENCY}${commission.toLocaleString()}`;
        document.getElementById('summaryCommissionNote').textContent = dealValue > 0 ? 
            `on ${CONFIG.CURRENCY}${dealValue.toLocaleString()} deal` : 'when deal value is confirmed';
    }

    // Form Submission
    async handleFormSubmit(e) {
        e.preventDefault();
        
        if (!this.validateStep(3)) {
            Toast.error('Please fix validation errors before submitting');
            return;
        }

        const submitButton = document.getElementById('generateButton');
        const buttonText = submitButton.querySelector('.button-text');
        const spinner = submitButton.querySelector('.loading-spinner');

        try {
            // Show loading state
            submitButton.disabled = true;
            buttonText.textContent = 'Generating...';
            spinner.classList.remove('hidden');

            // Prepare request data
            const requestData = {
                prospect_company_name: this.formData.company.name,
                contact_name: this.formData.contact.name,
                email: this.formData.contact.email,
                phone: this.formData.contact.phone,
                industry: this.formData.company.industry,
                estimated_deal_value: this.formData.company.estimatedDealValue || null
            };

            console.log('📤 Creating referral:', requestData);

            // API call
            const response = await apiClient.post(CONFIG.API.ENDPOINTS.REFERRALS.CREATE, requestData);

            if (response.data.success) {
                this.showSuccessModal(response.data.data);
                this.trackReferralCreation(response.data.data.referral.referral_code);
            } else {
                throw new Error(response.data.message || 'Failed to create referral');
            }

        } catch (error) {
            console.error('❌ Referral creation error:', error);
            
            let errorMessage = 'Failed to create referral. Please try again.';
            if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            } else if (error.message) {
                errorMessage = error.message;
            }

            Toast.error(errorMessage);
            
            // Re-enable button
            submitButton.disabled = false;
            buttonText.textContent = 'Generate Referral Code';
            spinner.classList.add('hidden');
        }
    }

    showSuccessModal(data) {
        const modal = document.getElementById('successModal');
        const modalContent = modal.querySelector('.bg-white');
        
        // Set generated code
        document.getElementById('generatedCode').textContent = data.referral.referral_code;
        
        // Store referral data for copy function
        this.generatedReferral = data.referral;

        // Show modal with animation
        modal.classList.remove('hidden');
        setTimeout(() => {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        }, 10);

        // Track successful creation
        this.trackSuccessfulCreation(data.referral);
    }

    trackReferralCreation(referralCode) {
        // Analytics tracking
        if (typeof gtag !== 'undefined') {
            gtag('event', 'generate_referral', {
                'event_category': 'referral',
                'event_label': referralCode
            });
        }
    }

    trackSuccessfulCreation(referral) {
        console.log('🎉 Referral created successfully:', {
            code: referral.referral_code,
            company: referral.prospect_company_name,
            timestamp: new Date().toISOString()
        });
    }

    // Success Modal Actions
    copyReferralCode() {
        const code = this.generatedReferral.referral_code;
        
        navigator.clipboard.writeText(code).then(() => {
            Toast.success('Referral code copied to clipboard!');
            
            // Visual feedback
            const codeElement = document.getElementById('generatedCode');
            codeElement.style.transform = 'scale(1.1)';
            codeElement.style.color = '#10b981';
            
            setTimeout(() => {
                codeElement.style.transform = 'scale(1)';
                codeElement.style.color = 'white';
            }, 300);
        }).catch(() => {
            Toast.error('Failed to copy referral code');
        });
    }

    createAnotherReferral() {
        this.closeSuccessModal();
        this.resetForm();
    }

    closeSuccessModal() {
        const modal = document.getElementById('successModal');
        const modalContent = modal.querySelector('.bg-white');
        
        modalContent.classList.remove('scale-100', 'opacity-100');
        modalContent.classList.add('scale-95', 'opacity-0');
        
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }

    resetForm() {
        // Reset form fields
        document.getElementById('referralForm').reset();
        
        // Reset form data
        this.formData = {};
        
        // Reset to step 1
        document.querySelectorAll('.form-step').forEach(step => {
            step.classList.remove('active');
            step.style.opacity = '0';
            step.style.transform = 'translateX(20px)';
        });
        
        document.getElementById('step1').classList.add('active');
        document.getElementById('step1').style.opacity = '1';
        document.getElementById('step1').style.transform = 'translateX(0)';
        
        // Reset progress
        this.currentStep = 1;
        this.updateProgressIndicators(3, 1, true);
        
        // Clear errors
        document.querySelectorAll('.error-message').forEach(error => {
            error.classList.remove('show');
            error.textContent = '';
        });
        
        document.querySelectorAll('.form-input').forEach(input => {
            input.classList.remove('error');
        });
        
        // Hide commission preview
        document.getElementById('commissionPreview').classList.add('hidden');
        
        // Focus first field
        document.getElementById('prospectCompany').focus();
        
        Toast.info('Form reset. Ready to create another referral!');
    }
}

// Add shake animation to CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }
    
    .skeleton {
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: loading 1.5s infinite;
    }
    
    @keyframes loading {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
    }
`;
document.head.appendChild(style);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.referralGenerator = new ReferralGenerator();
});

// Global functions for HTML onclick handlers
window.nextStep = (step) => window.referralGenerator.nextStep(step);
window.prevStep = (step) => window.referralGenerator.prevStep(step);
window.updateCommissionPreview = () => window.referralGenerator.updateCommissionPreview();
window.copyReferralCode = () => window.referralGenerator.copyReferralCode();
window.createAnotherReferral = () => window.referralGenerator.createAnotherReferral();

// Export for module usage
export default ReferralGenerator;