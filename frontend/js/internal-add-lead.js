// internal-add-lead.js - Fixed Internal Lead Creation System
let currentStep = 1;
let selectedSource = null;
let referralData = null;
let currentUser = null;

// Fixed Authentication Helper
function getAuthToken() {
    try {
        const internalUser = localStorage.getItem('internalUser');
        if (internalUser) {
            const userData = JSON.parse(internalUser);
            
            // Use the same pattern as your other internal files
            if (userData.id) {
                return `internal_user_${userData.id}`;
            }
        }
        
        console.error('❌ No valid internal user found');
        return null;
    } catch (error) {
        console.error('Error parsing internal user:', error);
        return null;
    }
}

// Fixed checkAuth function
function checkAuth() {
    const token = getAuthToken();
    const internalUser = localStorage.getItem('internalUser');
    
    if (!token || !internalUser) {
        showToast('Please login to access this page', 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        return false;
    }
    
    return true;
}

// Error Handling
function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.classList.remove('hidden');
        
        const inputId = elementId.replace('Error', '');
        const input = document.getElementById(inputId);
        if (input) {
            input.classList.add('input-error');
        }
    }
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(error => {
        error.classList.add('hidden');
    });
    document.querySelectorAll('.input-error').forEach(input => {
        input.classList.remove('input-error');
    });
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidPhone(phone) {
    const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
    return phoneRegex.test(phone);
}

// Toast Notification System
function showToast(message, type = 'info') {
    if (typeof Toast !== 'undefined') {
        const toastMethod = type === 'success' ? 'success' : 
                           type === 'error' ? 'error' : 'info';
        Toast[toastMethod](message);
        return;
    }
    
    // Fallback toast
    console.log(`${type.toUpperCase()}: ${message}`);
    alert(message);
}

// Fixed Referral Code Functions
async function fetchReferralDetails(button) {
    const codeInput = document.getElementById('referralCodeInput');
    const code = codeInput.value.trim().toUpperCase();
    const errorDiv = document.getElementById('referralCodeError');

    // Clear previous state
    clearErrors();
    referralData = null;
    document.getElementById('autoFillSection').classList.remove('show');

    if (!code) {
        showError('referralCodeError', 'Please enter a referral code');
        return;
    }

    // Validate format
    if (!/^CRYPT-[A-Z0-9]{6}$/.test(code)) {
        showError('referralCodeError', 'Invalid format. Use CRYPT-XXXXXX (6 characters/numbers)');
        return;
    }

    // Show loading
    const btnText = button.querySelector('.btn-text');
    const originalText = btnText.textContent;
    btnText.textContent = 'Verifying...';
    button.disabled = true;

    try {
        const authToken = getAuthToken();
        
        if (!authToken) {
            throw new Error('Authentication required. Please login again.');
        }

        console.log('🔍 Looking up referral code:', code);
        
        const response = await fetch(`http://localhost:8000/api/referrals/code/${encodeURIComponent(code)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `Server error: ${response.status}`);
        }

        if (data.success) {
            referralData = data.data;
            showAutoFillSection();
            showToast(data.message || 'Referral code verified successfully!', 'success');
        } else {
            throw new Error(data.message || 'Referral code not found');
        }
    } catch (error) {
        console.error('Referral lookup error:', error);
        showError('referralCodeError', error.message || 'Failed to verify referral code. Please try again.');
    } finally {
        // Reset button
        btnText.textContent = originalText;
        button.disabled = false;
    }
}

function showAutoFillSection() {
    if (!referralData) return;

    const autoFillSection = document.getElementById('autoFillSection');
    const { referral, partner } = referralData;

    // Populate auto-fill data
    document.getElementById('autoFillCompany').textContent = referral.prospect_company_name;
    document.getElementById('autoFillContact').textContent = referral.contact_name;
    document.getElementById('autoFillIndustry').textContent = referral.industry || 'Not specified';
    document.getElementById('autoFillPartner').textContent = partner.company_name;

    // Auto-fill form fields
    document.getElementById('contactName').value = referral.contact_name;
    document.getElementById('contactEmail').value = referral.email;
    document.getElementById('contactPhone').value = referral.phone;

    // Show section with animation
    setTimeout(() => {
        autoFillSection.classList.add('show');
    }, 100);
    
    updateSummary();
}

function clearReferralCode() {
    document.getElementById('referralCodeInput').value = '';
    document.getElementById('referralCodeError').classList.add('hidden');
    document.getElementById('autoFillSection').classList.remove('show');
    referralData = null;
    
    // Clear auto-filled fields
    if (selectedSource === 'partner') {
        document.getElementById('contactName').value = '';
        document.getElementById('contactEmail').value = '';
        document.getElementById('contactPhone').value = '';
    }
    
    updateSummary();
}

// Source Selection
function selectSource(source) {
    selectedSource = source;
    
    // Update UI
    document.querySelectorAll('.source-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Find and highlight selected option
    const options = document.querySelectorAll('.source-option');
    const selectedOption = Array.from(options).find(option => {
        const heading = option.querySelector('h3');
        return heading && heading.textContent.includes(source === 'partner' ? 'Partner' : 'Internal');
    });
    
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }
    
    // Show/hide referral code section
    const referralSection = document.getElementById('referralCodeSection');
    if (source === 'partner') {
        referralSection.classList.remove('hidden');
    } else {
        referralSection.classList.add('hidden');
        clearReferralCode();
    }
    
    updateSummary();
}

// Step Navigation
function validateStep1() {
    clearErrors();

    if (!selectedSource) {
        showToast('Please select a lead source', 'error');
        return;
    }

    if (selectedSource === 'partner' && !referralData) {
        showToast('Please verify the referral code first', 'error');
        return;
    }

    nextStep(2);
}

function validateStep2() {
    const requiredFields = [
        { id: 'contactName', name: 'Contact Name', type: 'text' },
        { id: 'contactEmail', name: 'Email Address', type: 'email' },
        { id: 'contactPhone', name: 'Phone Number', type: 'phone' }
    ];

    clearErrors();

    let hasErrors = false;

    for (const field of requiredFields) {
        const input = document.getElementById(field.id);
        const value = input.value.trim();
        
        if (!value) {
            showError(`${field.id}Error`, `${field.name} is required`);
            hasErrors = true;
        } else if (field.type === 'email' && !isValidEmail(value)) {
            showError(`${field.id}Error`, 'Please enter a valid email address');
            hasErrors = true;
        } else if (field.type === 'phone' && !isValidPhone(value)) {
            showError(`${field.id}Error`, 'Please enter a valid phone number');
            hasErrors = true;
        }
    }

    if (hasErrors) {
        showToast('Please fill in all required fields correctly', 'error');
        return;
    }

    nextStep(3);
}

function nextStep(step) {
    document.querySelectorAll('.form-step').forEach(stepEl => {
        stepEl.classList.remove('active');
    });
    
    document.getElementById(`step${step}`).classList.add('active');
    currentStep = step;
    updateProgress();
    updateSummary();
    
    // Scroll to top of form
    document.getElementById(`step${step}`).scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
    });
}

function prevStep(step) {
    nextStep(step);
}

function updateProgress() {
    // Update step number
    document.getElementById('currentStepNumber').textContent = currentStep;
    
    // Update progress line
    const progressPercentage = (currentStep - 1) * 33.33;
    document.getElementById('progressLine').style.width = `${progressPercentage}%`;
    
    // Update dots
    document.querySelectorAll('.progress-dot').forEach((dot, index) => {
        const number = dot.querySelector('div');
        const text = dot.querySelector('span');
        
        if (index < currentStep) {
            number.className = 'w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold shadow-lg';
            number.innerHTML = '<i class="fas fa-check"></i>';
            text.className = 'text-xs font-medium text-gray-700 mt-2';
        } else if (index === currentStep - 1) {
            number.className = 'w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold shadow-lg pulse';
            number.textContent = index + 1;
            text.className = 'text-xs font-medium text-gray-700 mt-2';
        } else {
            number.className = 'w-10 h-10 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-sm font-semibold';
            number.textContent = index + 1;
            text.className = 'text-xs font-medium text-gray-500 mt-2';
        }
    });
}

// Commission Calculation
function calculateCommission() {
    const dealValue = parseFloat(document.getElementById('estimatedValue').value) || 0;
    const commission = dealValue * 0.05; // 5%
    const companyEarnings = dealValue - commission;

    if (dealValue > 0) {
        document.getElementById('previewDealValue').textContent = `₦${dealValue.toLocaleString()}`;
        document.getElementById('previewCommission').textContent = `₦${commission.toLocaleString()}`;
        document.getElementById('previewCompanyEarnings').textContent = `₦${companyEarnings.toLocaleString()}`;
        document.getElementById('commissionPreview').classList.remove('hidden');
        
        // Update summary
        document.getElementById('summaryDealValue').textContent = `₦${dealValue.toLocaleString()}`;
        document.getElementById('summaryCommission').textContent = `₦${commission.toLocaleString()}`;
    } else {
        document.getElementById('commissionPreview').classList.add('hidden');
        document.getElementById('summaryDealValue').textContent = '₦0';
        document.getElementById('summaryCommission').textContent = '₦0';
    }
}

// Summary Update
function updateSummary() {
    // Source
    document.getElementById('summarySource').textContent = 
        selectedSource === 'partner' ? 'Partner Referral' : 'Internal Direct';
    
    // Company & Contact
    if (referralData) {
        document.getElementById('summaryCompany').textContent = referralData.referral.prospect_company_name;
        document.getElementById('summaryContact').textContent = referralData.referral.contact_name;
    } else {
        const contactName = document.getElementById('contactName').value;
        document.getElementById('summaryCompany').textContent = contactName ? `${contactName}'s Company` : '-';
        document.getElementById('summaryContact').textContent = contactName || '-';
    }
    
    // ERP & Timeline
    const erpSystem = document.getElementById('erpSystem');
    document.getElementById('summaryERP').textContent = 
        erpSystem.value ? 
        erpSystem.options[erpSystem.selectedIndex].text : '-';
    
    const timeline = document.getElementById('implementationTimeline');
    document.getElementById('summaryTimeline').textContent = 
        timeline.value ? 
        timeline.options[timeline.selectedIndex].text : '-';
    
    // Assigned To
    if (currentUser) {
        document.getElementById('summaryAssignedTo').textContent = currentUser.name || 'You';
    }
}

// Fixed Form Submission
async function handleSubmit(event) {
    event.preventDefault();
    
    if (!checkAuth()) return;

    const submitBtn = document.getElementById('submitLeadBtn');
    
    // Final validation
    clearErrors();
    let hasErrors = false;

    // Validate required fields
    const requiredFields = ['contactName', 'contactEmail', 'contactPhone'];
    requiredFields.forEach(fieldId => {
        const input = document.getElementById(fieldId);
        if (!input.value.trim()) {
            showError(`${fieldId}Error`, `${fieldId.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} is required`);
            hasErrors = true;
        }
    });

    if (hasErrors) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    // Show loading
    const btnText = submitBtn.querySelector('.btn-text');
    const originalText = btnText.textContent;
    btnText.textContent = 'Creating Lead...';
    submitBtn.disabled = true;

    try {
        const formData = prepareFormData();
        const authToken = getAuthToken();
        
        console.log('📤 Creating lead with data:', formData);
        
        const response = await fetch('http://localhost:8000/api/leads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `Server error: ${response.status}`);
        }

        if (data.success) {
            showToast('🎉 Lead created successfully! Redirecting...', 'success');
            
            setTimeout(() => {
                if (data.data.lead && data.data.lead.id) {
                    window.location.href = `internal-lead-details.html?id=${data.data.lead.id}`;
                } else {
                    window.location.href = 'internal-dashboard.html';
                }
            }, 2000);
        } else {
            throw new Error(data.message || 'Failed to create lead');
        }
    } catch (error) {
        console.error('Lead creation error:', error);
        showToast(error.message || 'Failed to create lead. Please try again.', 'error');
    } finally {
        // Reset button
        btnText.textContent = originalText;
        submitBtn.disabled = false;
    }
}

function prepareFormData() {
    const formData = {
        company_name: referralData ? 
            referralData.referral.prospect_company_name : 
            `${document.getElementById('contactName').value}'s Company`,
        contact_name: document.getElementById('contactName').value,
        email: document.getElementById('contactEmail').value,
        phone: document.getElementById('contactPhone').value,
        erp_system: document.getElementById('erpSystem').value || null,
        implementation_timeline: document.getElementById('implementationTimeline').value || null,
        estimated_value: parseFloat(document.getElementById('estimatedValue').value) || null,
        referral_code: referralData ? referralData.referral.referral_code : null
    };

    // Add industry from referral if available
    if (referralData?.referral.industry) {
        formData.industry = referralData.referral.industry;
    }

    // Add notes if provided
    const notes = document.getElementById('notes').value;
    if (notes) {
        formData.notes = notes;
    }

    console.log('📝 Prepared form data:', formData);
    return formData;
}

// UI Helpers
function toggleHelp() {
    const helpContent = document.getElementById('helpContent');
    const helpIcon = document.getElementById('helpIcon');
    
    if (helpContent.classList.contains('hidden')) {
        helpContent.classList.remove('hidden');
        helpIcon.className = 'fas fa-chevron-up';
    } else {
        helpContent.classList.add('hidden');
        helpIcon.className = 'fas fa-chevron-down';
    }
}

// User Management
function loadCurrentUser() {
    try {
        const userData = localStorage.getItem('internalUser');
        if (userData) {
            currentUser = JSON.parse(userData);
            const userNameElement = document.getElementById('currentUserName');
            const assignedToElement = document.getElementById('summaryAssignedTo');
            
            if (userNameElement) {
                userNameElement.textContent = currentUser.name || currentUser.email;
            }
            if (assignedToElement) {
                assignedToElement.textContent = currentUser.name || 'You';
            }
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}

// Event Listeners
function setupEventListeners() {
    // Form submission
    const form = document.getElementById('addLeadForm');
    if (form) {
        form.addEventListener('submit', handleSubmit);
    }
    
    // Commission calculation
    const estimatedValue = document.getElementById('estimatedValue');
    if (estimatedValue) {
        estimatedValue.addEventListener('input', calculateCommission);
    }
    
    // Real-time summary updates
    const summaryFields = ['contactName', 'erpSystem', 'implementationTimeline'];
    summaryFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', updateSummary);
            field.addEventListener('change', updateSummary);
        }
    });
    
    // Enter key support for referral code
    const referralInput = document.getElementById('referralCodeInput');
    if (referralInput) {
        referralInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                fetchReferralDetails(this);
            }
        });
    }
}

// Initialize Application
function init() {
    if (!checkAuth()) return;
    
    loadCurrentUser();
    updateProgress();
    setupEventListeners();
    
    // Set default source selection
    selectSource('internal');
    
    console.log('✅ Internal Add Lead initialized successfully');
}

// Make functions globally available
window.selectSource = selectSource;
window.fetchReferralDetails = fetchReferralDetails;
window.clearReferralCode = clearReferralCode;
window.validateStep1 = validateStep1;
window.validateStep2 = validateStep2;
window.prevStep = prevStep;
window.calculateCommission = calculateCommission;
window.toggleHelp = toggleHelp;
window.handleSubmit = handleSubmit;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Internal Add Lead page loaded');
    init();
});