// partner-payouts.js - Partner Payout Management System
class PartnerPayouts {
    constructor() {
        this.currentUser = null;
        this.currentPartner = null;
        this.eligiblePayouts = [];
        this.payoutHistory = [];
        this.selectedReferral = null;
        this.selectedPayout = null;
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Partner Payouts...');
        await this.checkAuth();
        await this.loadPayoutData();
        this.setupEventListeners();
    }

    async checkAuth() {
        try {
            const authResult = await AuthManager.requireAuth('partner');
            if (!authResult) {
                console.error('❌ Authentication failed');
                return;
            }

            this.currentUser = AuthManager.getCurrentUser();
            if (this.currentUser && this.currentUser.data) {
                this.currentPartner = this.currentUser.data;
                document.getElementById('userName').textContent = this.currentPartner.company_name;
                console.log('✅ Partner authenticated:', this.currentPartner.company_name);
            }
        } catch (error) {
            console.error('Auth check error:', error);
            Toast.error('Authentication failed');
        }
    }

    async loadPayoutData() {
        try {
            console.log('💰 Loading payout data...');
            this.showLoadingState();

            // Load data in parallel
            const [eligibleResponse, historyResponse, dashboardResponse] = await Promise.all([
                this.apiCall('GET', '/payouts/eligible'),
                this.apiCall('GET', '/payouts/partner?limit=50'),
                this.apiCall('GET', '/partner/dashboard')
            ]);

            if (eligibleResponse && eligibleResponse.success) {
                this.eligiblePayouts = eligibleResponse.data.referrals || [];
                this.renderEligiblePayouts();
            }

            if (historyResponse && historyResponse.success) {
                this.payoutHistory = historyResponse.data.payouts || [];
                this.renderPayoutHistory();
            }

            if (dashboardResponse && dashboardResponse.success) {
                this.updatePayoutStats(dashboardResponse.data);
            }

            this.hideLoadingState();

        } catch (error) {
            console.error('💥 Payout data load error:', error);
            this.hideLoadingState();
            Toast.error('Failed to load payout data');
        }
    }

    updatePayoutStats(dashboardData) {
        const { overview, payout_eligibility } = dashboardData;

        // Update statistics cards
        document.getElementById('totalEarned').textContent = `₦${(overview.total_commission_earned || 0).toLocaleString()}`;
        document.getElementById('availablePayout').textContent = `₦${(overview.available_for_payout || 0).toLocaleString()}`;
        document.getElementById('totalPaid').textContent = `₦${(overview.total_paid_out || 0).toLocaleString()}`;
        document.getElementById('pendingPayouts').textContent = overview.pending_payouts || 0;

        // Update eligible count
        document.getElementById('eligibleCount').textContent = payout_eligibility?.eligible_count || 0;
    }

    renderEligiblePayouts() {
        const eligibleSection = document.getElementById('eligiblePayoutsSection');
        const noEligibleSection = document.getElementById('noEligiblePayouts');
        const eligibleList = document.getElementById('eligiblePayoutsList');

        if (this.eligiblePayouts.length === 0) {
            eligibleSection.classList.add('hidden');
            noEligibleSection.classList.remove('hidden');
            return;
        }

        eligibleSection.classList.remove('hidden');
        noEligibleSection.classList.add('hidden');

        eligibleList.innerHTML = this.eligiblePayouts.map(referral => `
            <div class="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div class="flex-1">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="font-semibold text-gray-900">${this.escapeHtml(referral.prospect_company_name)}</h4>
                        <span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                            ₦${(referral.total_commission_earned || 0).toLocaleString()}
                        </span>
                    </div>
                    <div class="flex items-center text-sm text-gray-600">
                        <span class="font-mono bg-gray-100 px-2 py-1 rounded mr-3">${referral.referral_code}</span>
                        <span>Ready for payout</span>
                    </div>
                </div>
                <button onclick="partnerPayouts.showRequestPayoutModal('${referral.id}')" 
                        class="ml-4 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition flex items-center text-sm">
                    <i class="fas fa-hand-holding-usd mr-2"></i>
                    Request Payout
                </button>
            </div>
        `).join('');
    }

    renderPayoutHistory() {
        const tableBody = document.getElementById('payoutsTableBody');
        const noPayouts = document.getElementById('noPayouts');
        const loading = document.getElementById('payoutsLoading');

        loading.classList.add('hidden');

        if (this.payoutHistory.length === 0) {
            tableBody.innerHTML = '';
            noPayouts.classList.remove('hidden');
            return;
        }

        noPayouts.classList.add('hidden');

        tableBody.innerHTML = this.payoutHistory.map(payout => `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-3 py-3">
                    <div class="text-sm font-medium text-gray-900">${payout.referrals?.prospect_company_name || 'Unknown'}</div>
                    <div class="text-xs text-gray-500 font-mono">${payout.referrals?.referral_code || '-'}</div>
                </td>
                <td class="px-3 py-3">
                    <div class="text-sm font-semibold text-gray-900">₦${(payout.amount || 0).toLocaleString()}</div>
                </td>
                <td class="px-3 py-3 text-sm text-gray-600">
                    ${this.formatDate(payout.requested_at)}
                </td>
                <td class="px-3 py-3">
                    <span class="status-badge status-${payout.status}">
                        ${this.getStatusText(payout.status)}
                    </span>
                </td>
                <td class="px-3 py-3 text-sm text-gray-600">
                    ${payout.processed_at ? this.formatDate(payout.processed_at) : '-'}
                </td>
                <td class="px-3 py-3">
                    <div class="flex space-x-2">
                        
                        ${payout.proof_of_payment_url ? `
                        <a href="${payout.proof_of_payment_url}" target="_blank" 
                           class="text-green-600 hover:text-green-800 text-sm font-medium flex items-center">
                            <i class="fas fa-receipt mr-1"></i> Receipt
                        </a>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    }

    getStatusText(status) {
        const statusMap = {
            'pending': 'Pending',
            'processing': 'Processing',
            'paid': 'Paid',
            'failed': 'Failed'
        };
        return statusMap[status] || status;
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // Modal Methods
    async showRequestPayoutModal(referralId) {
        const referral = this.eligiblePayouts.find(r => r.id === referralId);
        if (!referral) return;

        this.selectedReferral = referral;

        // Populate modal
        document.getElementById('payoutReferralName').textContent = referral.prospect_company_name;
        document.getElementById('payoutAmount').textContent = `₦${(referral.total_commission_earned || 0).toLocaleString()}`;
        
        // Show bank info
        const bankInfo = this.currentPartner.bank_account_number ? 
            `${this.currentPartner.verified_account_name} - ${this.currentPartner.bank_account_number}` : 
            'Bank details not verified';
        document.getElementById('payoutBankInfo').textContent = bankInfo;

        document.getElementById('requestPayoutModal').classList.remove('hidden');
    }

    hideRequestPayoutModal() {
        document.getElementById('requestPayoutModal').classList.add('hidden');
        this.selectedReferral = null;
    }

    async confirmPayoutRequest() {
        if (!this.selectedReferral) return;

        try {
            const response = await this.apiCall('POST', '/payouts/request', {
                referral_id: this.selectedReferral.id
            });

            if (response && response.success) {
                Toast.success('Payout request submitted successfully!');
                this.hideRequestPayoutModal();
                await this.loadPayoutData(); // Refresh data
            } else {
                throw new Error(response?.message || 'Failed to submit payout request');
            }
        } catch (error) {
            console.error('Payout request error:', error);
            Toast.error(error.message || 'Failed to submit payout request');
        }
    }

    async showPayoutDetails(payoutId) {
        try {
            const response = await this.apiCall('GET', `/payouts/${payoutId}`);
            
            if (response && response.success) {
                this.selectedPayout = response.data.payout;
                this.renderPayoutDetails();
                document.getElementById('payoutDetailsModal').classList.remove('hidden');
            }
        } catch (error) {
            console.error('Payout details error:', error);
            Toast.error('Failed to load payout details');
        }
    }

    renderPayoutDetails() {
        const payout = this.selectedPayout;
        const content = document.getElementById('payoutDetailsContent');

        content.innerHTML = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-600">Referral:</span>
                        <p class="font-semibold">${payout.referrals?.prospect_company_name || 'Unknown'}</p>
                    </div>
                    <div>
                        <span class="text-gray-600">Amount:</span>
                        <p class="font-semibold text-green-600">₦${(payout.amount || 0).toLocaleString()}</p>
                    </div>
                    <div>
                        <span class="text-gray-600">Status:</span>
                        <span class="status-badge status-${payout.status}">
                            ${this.getStatusText(payout.status)}
                        </span>
                    </div>
                    <div>
                        <span class="text-gray-600">Requested:</span>
                        <p class="font-medium">${this.formatDate(payout.requested_at)}</p>
                    </div>
                    ${payout.processed_at ? `
                    <div>
                        <span class="text-gray-600">Processed:</span>
                        <p class="font-medium">${this.formatDate(payout.processed_at)}</p>
                    </div>
                    <div>
                        <span class="text-gray-600">Processed By:</span>
                        <p class="font-medium">${payout.internal_users?.name || 'System'}</p>
                    </div>
                    ` : ''}
                    ${payout.payment_reference ? `
                    <div class="col-span-2">
                        <span class="text-gray-600">Payment Reference:</span>
                        <p class="font-mono font-medium">${payout.payment_reference}</p>
                    </div>
                    ` : ''}
                    ${payout.notes ? `
                    <div class="col-span-2">
                        <span class="text-gray-600">Notes:</span>
                        <p class="font-medium">${payout.notes}</p>
                    </div>
                    ` : ''}
                </div>

                ${payout.proof_of_payment_url ? `
                <div class="border-t pt-4">
                    <h4 class="font-semibold text-gray-900 mb-2">Proof of Payment</h4>
                    <a href="${payout.proof_of_payment_url}" target="_blank" 
                       class="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium">
                        <i class="fas fa-external-link-alt mr-2"></i>
                        View Receipt
                    </a>
                </div>
                ` : ''}
            </div>
        `;
    }

    hidePayoutDetailsModal() {
        document.getElementById('payoutDetailsModal').classList.add('hidden');
        this.selectedPayout = null;
    }

    // Utility Methods
    async apiCall(method, endpoint, data = null) {
        try {
            const baseURL = window.CONFIG?.API?.BASE_URL || 'http://localhost:8000/api';
            const token = localStorage.getItem('authToken');
            
            console.log(`🌐 API Call: ${method} ${baseURL}${endpoint}`);

            const response = await fetch(`${baseURL}${endpoint}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: data ? JSON.stringify(data) : null
            });

            const result = await response.json();
            
            if (!response.ok) {
                console.error(`❌ API Error ${response.status}:`, result);
                throw new Error(result.message || `HTTP error! status: ${response.status}`);
            }

            console.log(`✅ API Response: ${endpoint}`, result);
            return result;

        } catch (error) {
            console.error(`❌ API call failed for ${endpoint}:`, error);
            throw error;
        }
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    showLoadingState() {
        document.getElementById('payoutsLoading').classList.remove('hidden');
    }

    hideLoadingState() {
        document.getElementById('payoutsLoading').classList.add('hidden');
    }

    setupEventListeners() {
        // Refresh payouts
        document.getElementById('refreshPayouts').addEventListener('click', () => {
            this.loadPayoutData();
            Toast.info('Refreshing payout data...');
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            AuthManager.logout();
        });

        console.log('✅ Partner Payouts event listeners setup complete');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Starting Partner Payouts...');
    window.partnerPayouts = new PartnerPayouts();
});