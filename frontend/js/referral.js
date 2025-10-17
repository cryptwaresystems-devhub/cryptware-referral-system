let currentReferral = null;
let currentReferralId = null;

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const currentPartner = JSON.parse(localStorage.getItem('currentPartner'));
    if (!currentPartner) {
        Toast.error('Please log in to view referral details');
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }

    document.getElementById('partnerCompanyName').textContent = currentPartner.company_name;

    // Get referral ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    currentReferralId = urlParams.get('id');

    if (!currentReferralId) {
        showError('No referral specified');
        return;
    }

    loadReferralDetails();
});

// Load referral details from backend
async function loadReferralDetails() {
    try {
        showLoading();
        
        const response = await apiClient.get(`/referrals/${currentReferralId}`);
        
        if (response.data.success) {
            currentReferral = response.data.data.referral;
            displayReferralDetails();
            showMainContent();
        } else {
            throw new Error(response.data.message || 'Failed to load referral');
        }
    } catch (error) {
        console.error('Error loading referral:', error);
        showError(error.response?.data?.message || error.message || 'Failed to load referral details');
    }
}

// Display referral data in UI
function displayReferralDetails() {
    if (!currentReferral) return;

    // Header Information
    document.getElementById('referralCompanyName').textContent = currentReferral.prospect_company_name;
    document.getElementById('referralContactInfo').textContent = 
        `${currentReferral.contact_name} • ${currentReferral.email}`;
    
    // Status and Code
    document.getElementById('statusBadge').textContent = formatStatus(currentReferral.status);
    document.getElementById('statusBadge').className = `status-badge status-${currentReferral.status}`;
    document.getElementById('referralCodeDisplay').textContent = `Code: ${currentReferral.referral_code}`;
    document.getElementById('referralCode').textContent = currentReferral.referral_code;

    // Dates
    document.getElementById('createdDate').textContent = new Date(currentReferral.created_at).toLocaleDateString();
    document.getElementById('updatedDate').textContent = new Date(currentReferral.updated_at).toLocaleDateString();

    // Financial Information - USE EXISTING FIELDS
    const financial = currentReferral.financial_summary || {};
    
    // Use existing database fields
    const estimatedValue = currentReferral.estimated_deal_value || 0;
    const totalPayments = financial.total_payments || 0;
    const totalCommission = financial.total_commission || 0;
    
    // Calculate progress
    const paymentProgress = estimatedValue > 0 ? (totalPayments / estimatedValue) * 100 : 0;

    // Update UI with existing data
    document.getElementById('estimatedDealValue').textContent = formatCurrency(estimatedValue);
    document.getElementById('totalPayments').textContent = formatCurrency(totalPayments);
    document.getElementById('totalCommission').textContent = formatCurrency(totalCommission);
    document.getElementById('commissionEligibility').textContent = 
        currentReferral.commission_eligible ? 'Yes' : 'No';
    document.getElementById('commissionEligibility').style.color = 
        currentReferral.commission_eligible ? '#10b981' : '#ef4444';

    // Update progress display
    updateProgressDisplay(estimatedValue, totalPayments, totalCommission);

    // Prospect Details
    document.getElementById('detailCompanyName').textContent = currentReferral.prospect_company_name;
    document.getElementById('detailContactName').textContent = currentReferral.contact_name;
    document.getElementById('detailContactEmail').textContent = currentReferral.email;
    document.getElementById('detailContactEmail').href = `mailto:${currentReferral.email}`;
    document.getElementById('detailContactPhone').textContent = currentReferral.phone;
    document.getElementById('detailContactPhone').href = `tel:${currentReferral.phone}`;
    document.getElementById('detailIndustry').textContent = currentReferral.industry || 'Not specified';
    document.getElementById('detailDealSize').textContent = formatCurrency(estimatedValue);

    // Commission Breakdown
    document.getElementById('breakdownTotalPaid').textContent = formatCurrency(totalPayments);
    document.getElementById('breakdownCommission').textContent = formatCurrency(totalCommission);
    document.getElementById('breakdownAvailable').textContent = 
        currentReferral.commission_eligible ? formatCurrency(totalCommission) : '₦0';

    // Update payout button
    const payoutBtn = document.getElementById('payoutBtn');
    if (currentReferral.commission_eligible && totalCommission > 0) {
        payoutBtn.disabled = false;
        payoutBtn.innerHTML = '<i class="fas fa-money-bill-wave mr-2"></i>Request Payout';
    } else {
        payoutBtn.disabled = true;
        payoutBtn.innerHTML = '<i class="fas fa-clock mr-2"></i>Not Eligible';
    }

    // Load payment history
    displayPaymentHistory(currentReferral.client_payments || []);
    
    // Load lead progress
    displayLeadProgress(currentReferral.leads || []);
    
    // Load activity timeline
    displayActivityTimeline(currentReferral.leads?.[0]?.activities || []);
}

// Helper function to calculate and display progress
function updateProgressDisplay(estimatedValue, totalPayments, totalCommission) {
    const progressPercentage = estimatedValue > 0 ? (totalPayments / estimatedValue) * 100 : 0;
    
    // Update progress bar
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const paymentProgress = document.getElementById('paymentProgress');
    
    if (progressBar) progressBar.style.width = `${progressPercentage}%`;
    if (paymentProgress) paymentProgress.textContent = `${Math.round(progressPercentage)}%`;
    
    if (progressText) {
        if (progressPercentage === 0) {
            progressText.textContent = 'No payments received yet';
            progressBar.className = 'bg-gray-400 h-2 rounded-full';
        } else if (progressPercentage === 100) {
            progressText.textContent = 'Fully paid!';
            progressBar.className = 'bg-green-600 h-2 rounded-full';
        } else {
            progressText.textContent = `${Math.round(progressPercentage)}% paid`;
            progressBar.className = 'bg-yellow-600 h-2 rounded-full';
        }
    }
}

// Format status for display
function formatStatus(status) {
    const statusMap = {
        'code_sent': 'Code Sent',
        'contacted': 'Contacted',
        'meeting_scheduled': 'Meeting Scheduled',
        'proposal_sent': 'Proposal Sent',
        'negotiation': 'In Negotiation',
        'won': 'Won',
        'fully_paid': 'Fully Paid',
        'lost': 'Lost'
    };
    return statusMap[status] || status;
}

// Format currency
function formatCurrency(amount) {
    return '₦' + (amount || 0).toLocaleString();
}

// Display payment history
function displayPaymentHistory(payments) {
    const container = document.getElementById('paymentHistory');
    const countElement = document.getElementById('paymentCount');

    if (payments.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-receipt text-4xl mb-3 opacity-50"></i>
                <p>No payments recorded yet</p>
            </div>
        `;
        countElement.textContent = '0 payments';
        return;
    }

    countElement.textContent = `${payments.length} payment${payments.length !== 1 ? 's' : ''}`;

    container.innerHTML = payments.map(payment => `
        <div class="bg-white border border-gray-200 rounded-lg p-4">
            <div class="flex justify-between items-start">
                <div>
                    <div class="font-semibold text-gray-900">${formatCurrency(payment.amount)}</div>
                    <div class="text-sm text-gray-600">${payment.payment_date || 'Date not specified'}</div>
                    <div class="text-xs text-gray-500 mt-1">
                        <i class="fas fa-calendar mr-1"></i>${new Date(payment.created_at).toLocaleDateString()}
                    </div>
                </div>
                <div class="text-right">
                    <span class="status-badge status-${payment.status}">${payment.status}</span>
                    ${payment.commission_calculated ? `
                        <div class="text-sm text-green-600 mt-1">
                            <i class="fas fa-hand-holding-usd mr-1"></i>${formatCurrency(payment.commission_calculated)} commission
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

// Display lead progress
function displayLeadProgress(leads) {
    const container = document.getElementById('leadProgress');

    if (leads.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-tasks text-4xl mb-3 opacity-50"></i>
                <p>No lead information available</p>
            </div>
        `;
        return;
    }

    const lead = leads[0];
    container.innerHTML = `
        <div class="space-y-3">
            <div class="flex justify-between items-center">
                <span class="text-gray-600">Lead Status:</span>
                <span class="font-semibold">${formatStatus(lead.status)}</span>
            </div>
            ${lead.erp_system ? `
            <div class="flex justify-between items-center">
                <span class="text-gray-600">ERP System:</span>
                <span class="font-semibold">${lead.erp_system}</span>
            </div>
            ` : ''}
            ${lead.implementation_timeline ? `
            <div class="flex justify-between items-center">
                <span class="text-gray-600">Timeline:</span>
                <span class="font-semibold">${lead.implementation_timeline}</span>
            </div>
            ` : ''}
            ${lead.assigned_to ? `
            <div class="flex justify-between items-center">
                <span class="text-gray-600">Assigned To:</span>
                <span class="font-semibold">${lead.internal_users?.name || 'Team Member'}</span>
            </div>
            ` : ''}
            ${lead.last_contact ? `
            <div class="flex justify-between items-center">
                <span class="text-gray-600">Last Contact:</span>
                <span class="font-semibold">${new Date(lead.last_contact).toLocaleDateString()}</span>
            </div>
            ` : ''}
        </div>
    `;
}

// Display activity timeline
function displayActivityTimeline(activities) {
    const container = document.getElementById('activityTimeline');

    if (activities.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-4">
                <i class="fas fa-clock text-2xl mb-2 opacity-50"></i>
                <p class="text-sm">No activities recorded</p>
            </div>
        `;
        return;
    }

    container.innerHTML = activities.map(activity => `
        <div class="flex items-start space-x-3">
            <div class="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
            <div class="flex-1">
                <div class="flex justify-between items-start">
                    <span class="font-medium text-gray-900">${activity.type || 'Activity'}</span>
                    <span class="text-xs text-gray-500">${new Date(activity.created_at).toLocaleDateString()}</span>
                </div>
                <p class="text-sm text-gray-600 mt-1">${activity.notes || 'No details provided'}</p>
            </div>
        </div>
    `).join('');
}

// Copy referral code
function copyReferralCode() {
    const code = currentReferral?.referral_code;
    if (!code) return;

    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('copyCodeBtn');
        const originalText = btn.innerHTML;
        
        btn.classList.add('copied');
        btn.innerHTML = '<i class="fas fa-check mr-2"></i>Copied!';
        
        Toast.success('Referral code copied to clipboard!');
        
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = originalText;
        }, 2000);
    });
}

// Share referral
function shareReferral() {
    if (!currentReferral) return;

    const shareCode = document.getElementById('shareReferralCode');
    const shareMessage = document.getElementById('shareMessage');

    shareCode.value = currentReferral.referral_code;
    shareMessage.value = `Hi! I'd like to refer ${currentReferral.prospect_company_name} to Cryptware. Please use referral code: ${currentReferral.referral_code} when you contact them.`;

    document.getElementById('shareModal').classList.remove('hidden');
}

function closeShareModal() {
    document.getElementById('shareModal').classList.add('hidden');
}

function copyShareCode() {
    const code = document.getElementById('shareReferralCode').value;
    navigator.clipboard.writeText(code);
    Toast.success('Referral code copied!');
}

function copyShareMessage() {
    const message = document.getElementById('shareMessage').value;
    navigator.clipboard.writeText(message);
    Toast.success('Share message copied!');
}

// Edit referral
function editReferral() {
    if (!currentReferral) return;

    document.getElementById('editCompanyName').value = currentReferral.prospect_company_name;
    document.getElementById('editContactName').value = currentReferral.contact_name;
    document.getElementById('editContactEmail').value = currentReferral.email;
    document.getElementById('editContactPhone').value = currentReferral.phone;
    document.getElementById('editIndustry').value = currentReferral.industry || '';
    document.getElementById('editDealValue').value = currentReferral.estimated_deal_value || '';

    document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
}

// Handle edit form submission
document.getElementById('editReferralForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    try {
        const formData = {
            prospect_company_name: document.getElementById('editCompanyName').value,
            contact_name: document.getElementById('editContactName').value,
            email: document.getElementById('editContactEmail').value,
            phone: document.getElementById('editContactPhone').value,
            industry: document.getElementById('editIndustry').value || null,
            estimated_deal_value: document.getElementById('editDealValue').value ? 
                parseInt(document.getElementById('editDealValue').value) : null
        };

        // Here you would make an API call to update the referral
        // For now, we'll just update the local state
        Object.assign(currentReferral, formData);
        displayReferralDetails();
        
        closeEditModal();
        Toast.success('Referral updated successfully!');
        
    } catch (error) {
        console.error('Error updating referral:', error);
        Toast.error('Failed to update referral');
    }
});

// Delete referral
async function deleteReferral() {
    if (!currentReferral || !confirm('Are you sure you want to delete this referral? This action cannot be undone.')) {
        return;
    }

    try {
        // Here you would make an API call to delete the referral
        // For now, we'll just show a success message
        
        Toast.success('Referral deleted successfully!');
        setTimeout(() => {
            window.location.href = 'partner-dashboard.html';
        }, 1500);
        
    } catch (error) {
        console.error('Error deleting referral:', error);
        Toast.error('Failed to delete referral');
    }
}

// Request payout
async function requestPayout() {
    if (!currentReferral || !currentReferral.commission_eligible) {
        Toast.error('This referral is not eligible for payout yet');
        return;
    }

    try {
        const response = await apiClient.post('/payouts/request', {
            referral_id: currentReferral.id
        });

        if (response.data.success) {
            Toast.success('Payout request submitted successfully!');
            // Reload to update status
            loadReferralDetails();
        } else {
            throw new Error(response.data.message);
        }
    } catch (error) {
        console.error('Error requesting payout:', error);
        Toast.error(error.response?.data?.message || 'Failed to request payout');
    }
}

// View commission report
function viewCommissionReport() {
    window.location.href = 'commission-report.html';
}

// UI State Management
function showLoading() {
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');
}

function showMainContent() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
}

function showError(message) {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('errorState').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('errorMessage').textContent = message;
}

// Make functions globally available
window.AuthManager = {
    logout: function() {
        localStorage.removeItem('currentPartner');
        localStorage.removeItem('authToken');
        window.location.href = 'login.html';
    }
};