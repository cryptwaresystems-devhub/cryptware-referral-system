// internal-payouts.js - Internal Payout Management System
class InternalPayouts {
    constructor() {
        this.currentUser = null;
        this.payouts = [];
        this.currentPage = 1;
        this.limit = 10;
        this.totalPayouts = 0;
        this.selectedPayout = null;
        this.statusFilter = 'all';
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Internal Payouts...');
        await this.checkAuth();
        await this.loadPayouts();
        this.setupEventListeners();
    }

    async checkAuth() {
        try {
            const authResult = await AuthManager.requireAuth('internal');
            if (!authResult) {
                console.error('❌ Authentication failed');
                return;
            }

            this.currentUser = AuthManager.getCurrentUser();
            if (this.currentUser && this.currentUser.data) {
                document.getElementById('userName').textContent = this.currentUser.data.name || this.currentUser.data.email;
                console.log('✅ User authenticated:', this.currentUser.data.name);
            }
        } catch (error) {
            console.error('Auth check error:', error);
            Toast.error('Authentication failed');
        }
    }

    async loadPayouts() {
        try {
            console.log('💰 Loading payouts...');
            this.showLoadingState();

            const response = await this.apiCall('GET', `/payouts/internal?page=${this.currentPage}&limit=${this.limit}&status=${this.statusFilter}`);
            
            if (response && response.success) {
                this.payouts = response.data.payouts || [];
                this.totalPayouts = response.data.pagination?.total || 0;
                this.renderPayouts();
                this.updateStatistics(response.data.statistics);
                this.updatePagination();
                this.hideLoadingState();
            } else {
                throw new Error(response?.message || 'Failed to load payouts');
            }

        } catch (error) {
            console.error('💥 Payouts load error:', error);
            this.hideLoadingState();
            Toast.error('Failed to load payouts');
        }
    }

    updateStatistics(stats) {
        document.getElementById('totalPending').textContent = stats.pending || 0;
        document.getElementById('totalAmountPending').textContent = `₦${(stats.total_amount_pending || 0).toLocaleString()}`;
        document.getElementById('totalProcessed').textContent = stats.paid || 0;
        document.getElementById('totalAmountPaid').textContent = `₦${(stats.total_amount_paid || 0).toLocaleString()}`;
    }

    renderPayouts() {
        const tableBody = document.getElementById('payoutsTableBody');
        const noPayouts = document.getElementById('noPayouts');
    
        if (this.payouts.length === 0) {
            tableBody.innerHTML = '';
            noPayouts.classList.remove('hidden');
            return;
        }
    
        noPayouts.classList.add('hidden');
    
        tableBody.innerHTML = this.payouts.map(payout => `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-3 py-3">
                    <div class="flex items-center">
                        <div class="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <i class="fas fa-building text-blue-600 text-sm"></i>
                        </div>
                        <div class="ml-3">
                            <div class="text-sm font-medium text-gray-900">${this.escapeHtml(payout.partners?.company_name || 'Unknown Partner')}</div>
                            <div class="text-xs text-gray-500">${this.escapeHtml(payout.referrals?.prospect_company_name || 'Unknown Referral')}</div>
                            <div class="text-xs text-gray-400 font-mono">${payout.referrals?.referral_code || '-'}</div>
                        </div>
                    </div>
                </td>
                <td class="px-3 py-3">
                    <div class="text-sm text-gray-900">${this.escapeHtml(payout.partners?.verified_account_name || 'N/A')}</div>
                    <div class="text-xs text-gray-500 font-mono">${payout.partners?.bank_account_number || 'N/A'}</div>
                    <div class="text-xs text-gray-400">${this.getBankName(payout.partners)}</div>
                </td>
                <td class="px-3 py-3">
                    <div class="text-sm font-semibold text-gray-900">₦${(payout.amount || 0).toLocaleString()}</div>
                    <div class="text-xs text-gray-500">Commission</div>
                </td>
                <td class="px-3 py-3 text-sm text-gray-600">
                    ${this.formatDate(payout.requested_at)}
                </td>
                <td class="px-3 py-3">
                    <span class="status-badge status-${payout.status}">
                        ${this.getStatusText(payout.status)}
                    </span>
                </td>
                <td class="px-3 py-3">
                    <div class="flex space-x-2 action-buttons">
                        ${payout.status === 'pending' ? `
                        <button onclick="internalPayouts.showProcessPayoutModal('${payout.id}')" 
                                class="text-green-600 hover:text-green-800 text-sm font-medium flex items-center">
                            <i class="fas fa-check-circle mr-1"></i> Process
                        </button>
                        ` : ''}
                        <button onclick="internalPayouts.showPayoutDetails('${payout.id}')" 
                                class="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center">
                            <i class="fas fa-eye mr-1"></i> View
                        </button>
                        ${payout.proof_of_payment_url ? `
                        <a href="${payout.proof_of_payment_url}" target="_blank" 
                           class="text-purple-600 hover:text-purple-800 text-sm font-medium flex items-center">
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

    getBankName(payoutPartners) {
        // Now the bank name comes from the backend
        return payoutPartners?.bank_name || `Bank (${payoutPartners?.bank_code})`;
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

    formatDateTime(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    updatePagination() {
        const start = ((this.currentPage - 1) * this.limit) + 1;
        const end = Math.min(this.currentPage * this.limit, this.totalPayouts);
        
        document.getElementById('paginationStart').textContent = start;
        document.getElementById('paginationEnd').textContent = end;
        document.getElementById('paginationTotal').textContent = this.totalPayouts;

        // Update button states
        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = end >= this.totalPayouts;
    }

    // Modal Methods
    async showProcessPayoutModal(payoutId) {
        try {
            console.log(`🔍 Loading payout details for: ${payoutId}`);
            
            // First, verify this payout exists in our current list
            const payoutInList = this.payouts.find(p => p.id === payoutId);
            if (!payoutInList) {
                console.warn('⚠️ Payout not found in current list, refreshing...');
                await this.loadPayouts();
                
                // Check again after refresh
                const refreshedPayout = this.payouts.find(p => p.id === payoutId);
                if (!refreshedPayout) {
                    throw new Error(`Payout ${payoutId} not found after refresh`);
                }
            }
            
            const response = await this.apiCall('GET', `/payouts/${payoutId}`);
            
            if (response && response.success) {
                this.selectedPayout = response.data.payout;
                this.populateProcessModal();
                document.getElementById('processPayoutModal').classList.remove('hidden');
            }
        } catch (error) {
            console.error('Process payout modal error:', error);
            Toast.error(`Cannot process payout: ${error.message}`);
        }
    }

    populateProcessModal() {
        const payout = this.selectedPayout;

        // Payout details
        document.getElementById('processPartnerName').textContent = payout.partners?.company_name || 'Unknown';
        document.getElementById('processReferralName').textContent = payout.referrals?.prospect_company_name || 'Unknown';
        document.getElementById('processCommission').textContent = `₦${(payout.amount || 0).toLocaleString()}`;
        document.getElementById('processRequestedDate').textContent = this.formatDateTime(payout.requested_at);

        // Bank details
        document.getElementById('processAccountName').textContent = payout.partners?.verified_account_name || 'Not provided';
        document.getElementById('processAccountNumber').textContent = payout.partners?.bank_account_number || 'Not provided';
        document.getElementById('processBankName').textContent = this.getBankName(payout.partners) || 'Not provided';

        // Reset form
        document.getElementById('amountPaid').value = payout.amount || '';
        document.getElementById('paymentReference').value = '';
        document.getElementById('proofOfPayment').value = '';
        document.getElementById('payoutNotes').value = '';
    }

    hideProcessPayoutModal() {
        document.getElementById('processPayoutModal').classList.add('hidden');
        this.selectedPayout = null;
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
                <!-- Payout Information -->
                <div class="bg-gray-50 p-3 rounded-lg">
                    <h4 class="font-semibold text-gray-900 mb-2">Payout Information</h4>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <span class="text-gray-600">Partner:</span>
                            <p class="font-semibold">${payout.partners?.company_name || 'Unknown'}</p>
                        </div>
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
                            <p class="font-medium">${this.formatDateTime(payout.requested_at)}</p>
                        </div>
                        ${payout.processed_at ? `
                        <div>
                            <span class="text-gray-600">Processed:</span>
                            <p class="font-medium">${this.formatDateTime(payout.processed_at)}</p>
                        </div>
                        <div>
                            <span class="text-gray-600">Processed By:</span>
                            <p class="font-medium">${payout.internal_users?.name || 'System'}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Bank Details -->
                <div class="bg-blue-50 p-3 rounded-lg">
                    <h4 class="font-semibold text-gray-900 mb-2">Bank Details</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Account Name:</span>
                            <span class="font-semibold">${payout.partners?.verified_account_name || 'Not provided'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Account Number:</span>
                            <span class="font-mono font-semibold">${payout.partners?.bank_account_number || 'Not provided'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Bank:</span>
                            <span class="font-semibold">${this.getBankName(payout.partners) || 'Not provided'}</span>
                        </div>
                    </div>
                </div>

                <!-- Payment Information -->
                ${payout.status === 'paid' ? `
                <div class="bg-green-50 p-3 rounded-lg">
                    <h4 class="font-semibold text-gray-900 mb-2">Payment Information</h4>
                    <div class="space-y-2 text-sm">
                        ${payout.payment_reference ? `
                        <div class="flex justify-between">
                            <span class="text-gray-600">Reference:</span>
                            <span class="font-mono font-semibold">${payout.payment_reference}</span>
                        </div>
                        ` : ''}
                        ${payout.processed_at ? `
                        <div class="flex justify-between">
                            <span class="text-gray-600">Processed Date:</span>
                            <span class="font-medium">${this.formatDateTime(payout.processed_at)}</span>
                        </div>
                        ` : ''}
                        ${payout.notes ? `
                        <div>
                            <span class="text-gray-600">Notes:</span>
                            <p class="font-medium mt-1">${payout.notes}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}

                <!-- Proof of Payment -->
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

    // Form Submission
    async handleProcessPayout(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const amountPaid = formData.get('amount_paid');
        const paymentReference = formData.get('payment_reference');
        const proofOfPayment = formData.get('proof_of_payment');
        const notes = formData.get('notes');

        if (!amountPaid || !paymentReference || !proofOfPayment) {
            Toast.error('Please fill in all required fields');
            return;
        }

        try {
            const submitBtn = event.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Processing...';
            submitBtn.disabled = true;

            const response = await this.apiCall('PATCH', `/payouts/${this.selectedPayout.id}/process`, formData, true);
            
            if (response && response.success) {
                Toast.success('Payout processed successfully!');
                this.hideProcessPayoutModal();
                await this.loadPayouts(); // Refresh data
            } else {
                throw new Error(response?.message || 'Failed to process payout');
            }

        } catch (error) {
            console.error('Process payout error:', error);
            Toast.error(error.message || 'Failed to process payout');
        } finally {
            const submitBtn = event.target.querySelector('button[type="submit"]');
            submitBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Mark as Paid';
            submitBtn.disabled = false;
        }
    }

    // Utility Methods
    async apiCall(method, endpoint, data = null, isFormData = false) {
        try {
            const baseURL = window.CONFIG?.API?.BASE_URL || 'http://localhost:8000/api';
            const token = localStorage.getItem('authToken');
            
            console.log(`🌐 API Call: ${method} ${baseURL}${endpoint}`);

            const config = {
                method,
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            };

            if (data && !isFormData) {
                config.headers['Content-Type'] = 'application/json';
                config.body = JSON.stringify(data);
            } else if (data && isFormData) {
                config.body = data;
            }

            const response = await fetch(`${baseURL}${endpoint}`, config);
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
        document.getElementById('loadingState').classList.remove('hidden');
        document.getElementById('noPayouts').classList.add('hidden');
    }

    hideLoadingState() {
        document.getElementById('loadingState').classList.add('hidden');
    }

    setupEventListeners() {
        // Refresh payouts
        document.getElementById('refreshPayouts').addEventListener('click', () => {
            this.loadPayouts();
            Toast.info('Refreshing payouts...');
        });

        // Export payouts (placeholder)
        document.getElementById('exportPayouts').addEventListener('click', () => {
            Toast.info('Export feature coming soon...');
        });

        // Status filter
        document.getElementById('statusFilter').addEventListener('change', (e) => {
            this.statusFilter = e.target.value;
            this.currentPage = 1;
            this.loadPayouts();
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadPayouts();
            }
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            if (this.currentPage * this.limit < this.totalPayouts) {
                this.currentPage++;
                this.loadPayouts();
            }
        });

        // Process payout form
        document.getElementById('processPayoutForm').addEventListener('submit', (e) => this.handleProcessPayout(e));

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            AuthManager.logout();
        });

        console.log('✅ Internal Payouts event listeners setup complete');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Starting Internal Payouts...');
    window.internalPayouts = new InternalPayouts();
});