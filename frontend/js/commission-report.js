class CommissionReport {
    constructor() {
        this.commissionData = null;
        this.currentPartner = null;
        this.payoutRequests = new Set(); // Track pending payout requests
        this.init();
    }

    async init() {
        try {
            // Check authentication
            const isAuthenticated = await AuthManager.requireAuth('partner');
            if (!isAuthenticated) return;

            // Load header
            await this.loadHeader();
            
            // Load commission data
            await this.loadCommissionReport();
            
            // Setup event listeners
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Commission report initialization error:', error);
            Toast.error('Failed to initialize commission report');
        }
    }

    async loadHeader() {
        try {
            const response = await fetch('partner-header.html');
            const headerHTML = await response.text();
            document.getElementById('header-container').innerHTML = headerHTML;
            
            // Initialize header functionality
            setTimeout(() => {
                if (window.PartnerHeader) {
                    new window.PartnerHeader();
                }
            }, 100);
        } catch (error) {
            console.error('Error loading header:', error);
        }
    }

    // Load commission report data - FIXED ENDPOINT
    async loadCommissionReport() {
        try {
            this.showLoadingState();
            
            // Load payout requests first to track pending ones
            await this.loadPayoutRequests();
            
            // Load commission data
            const response = await apiClient.get('/partner/commissions');
            
            console.log('📊 Commission API Response:', response.data);
            
            if (response.data.success) {
                this.commissionData = response.data.data;
                this.updateCommissionUI();
            } else {
                throw new Error(response.data.message || 'Failed to load commission data');
            }
            
        } catch (error) {
            console.error('Load commission error:', error);
            Toast.error(error.response?.data?.message || 'Failed to load commission report');
            this.showEmptyState();
        }
    }

    async loadPayoutRequests() {
        try {
            const response = await apiClient.get('/payouts/partner?limit=100');
            if (response.data.success) {
                // Track referrals with pending payouts
                response.data.data.payouts
                    .filter(payout => payout.status === 'pending')
                    .forEach(payout => {
                        if (payout.referral_id) {
                            this.payoutRequests.add(payout.referral_id);
                        }
                    });
                console.log('📋 Pending payout requests:', this.payoutRequests);
            }
        } catch (error) {
            console.error('Error loading payout requests:', error);
        }
    }

    // Update UI with commission data - FIXED DATA STRUCTURE
    updateCommissionUI() {
        if (!this.commissionData) return;

        console.log('📊 Commission Data:', this.commissionData);

        const { summary, referrals, payouts } = this.commissionData;

        // Update summary cards
        document.getElementById('totalCommission').textContent = this.formatCurrency(summary.total_commission_earned);
        document.getElementById('availablePayout').textContent = this.formatCurrency(summary.available_for_payout);
        document.getElementById('pendingCommission').textContent = this.formatCurrency(summary.pending_commission);
        document.getElementById('totalPaidOut').textContent = this.formatCurrency(summary.total_paid_out);

        // Update commission table
        this.updateCommissionTable(referrals);

        // Update payout history
        this.updatePayoutHistory(payouts);

        // Show/hide empty states
        document.getElementById('emptyState').classList.toggle('hidden', referrals && referrals.length > 0);
        document.getElementById('emptyPayoutState').classList.toggle('hidden', payouts && payouts.length > 0);
        document.getElementById('payoutCount').textContent = `${payouts ? payouts.length : 0} payouts`;
    }

    // Update commission table - FIXED FIELD NAMES
    updateCommissionTable(referrals) {
        const tableBody = document.getElementById('commissionTableBody');
        tableBody.innerHTML = '';

        if (!referrals || referrals.length === 0) {
            return;
        }

        referrals.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors';
            
            const hasPendingPayout = this.payoutRequests.has(item.id);
            const isEligible = item.commission_eligible && 
                              item.status === 'fully_paid' && 
                              !hasPendingPayout &&
                              (item.commission_earned || 0) > 0;

            const statusBadge = this.getStatusBadge(item.status);
            const payoutStatus = hasPendingPayout ? 
                '<span class="status-badge status-processing">Payout Pending</span>' :
                (item.commission_eligible ? 
                    '<span class="status-badge status-paid">Eligible</span>' : 
                    '<span class="status-badge status-pending">Pending</span>');

            const actionButton = isEligible ? 
                `<button onclick="commissionReport.openPayoutModal('${item.id}', ${item.commission_earned || 0})" 
                        class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm flex items-center transition-colors">
                    <i class="fas fa-paper-plane mr-1"></i>Request
                </button>` : 
                '<span class="text-gray-400 text-sm">Not eligible</span>';

            row.innerHTML = `
                <td class="px-4 py-3">
                    <div class="font-medium text-gray-900">${item.prospect_company_name}</div>
                    <div class="text-sm text-gray-500">${item.referral_code}</div>
                </td>
                <td class="px-4 py-3">${statusBadge}</td>
                <td class="px-4 py-3 font-medium">${this.formatCurrency(item.estimated_deal_value)}</td>
                <td class="px-4 py-3 font-semibold text-green-600">${this.formatCurrency(item.commission_earned)}</td>
                <td class="px-4 py-3">${payoutStatus}</td>
                <td class="px-4 py-3">${actionButton}</td>
            `;
            
            tableBody.appendChild(row);
        });
    }

    // Update payout history - FIXED FIELD NAMES
    updatePayoutHistory(payouts) {
        const container = document.getElementById('payoutHistory');
        container.innerHTML = '';

        if (!payouts || payouts.length === 0) {
            return;
        }

        payouts.forEach(payout => {
            const payoutElement = document.createElement('div');
            payoutElement.className = 'bg-white rounded-lg border border-gray-200 p-4';
            
            const statusBadge = this.getPayoutStatusBadge(payout.status);
            const processedDate = payout.processed_at ? 
                new Date(payout.processed_at).toLocaleDateString() : 'Pending';

            payoutElement.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center justify-between mb-2">
                            <div class="font-semibold text-gray-900">${this.formatCurrency(payout.amount)}</div>
                            ${statusBadge}
                        </div>
                        <div class="text-sm text-gray-600 mb-2">
                            <i class="fas fa-calendar mr-1"></i>
                            Requested: ${new Date(payout.requested_at).toLocaleDateString()}
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-xs text-gray-500">
                            <div>
                                <i class="fas fa-calendar mr-1"></i>
                                Requested: ${new Date(payout.requested_at).toLocaleDateString()}
                            </div>
                            <div>
                                <i class="fas fa-check-circle mr-1"></i>
                                Processed: ${processedDate}
                            </div>
                            ${payout.payment_reference ? `
                            <div class="col-span-2">
                                <i class="fas fa-receipt mr-1"></i>
                                Reference: ${payout.payment_reference}
                            </div>
                            ` : ''}
                        </div>
                        ${payout.notes ? `
                        <div class="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                            <i class="fas fa-sticky-note mr-1"></i>${payout.notes}
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
            
            container.appendChild(payoutElement);
        });
    }

    // Payout modal functions
    openPayoutModal(referralId, amount) {
        const modal = document.getElementById('payoutModal');
        const form = modal.querySelector('.bg-white');
        
        // Populate referral select
        const select = document.getElementById('payoutReferralSelect');
        select.innerHTML = '<option value="">Choose eligible referral...</option>';
        
        if (this.commissionData?.referrals) {
            this.commissionData.referrals
                .filter(item => item.commission_eligible && 
                               item.status === 'fully_paid' && 
                               !this.payoutRequests.has(item.id) &&
                               (item.commission_earned || 0) > 0)
                .forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = `${item.prospect_company_name} - ${this.formatCurrency(item.commission_earned)}`;
                    option.selected = item.id === referralId;
                    select.appendChild(option);
                });
        }
        
        document.getElementById('payoutAmount').value = amount;
        
        modal.classList.remove('hidden');
        setTimeout(() => {
            form.classList.remove('scale-95', 'opacity-0');
            form.classList.add('scale-100', 'opacity-100');
        }, 10);
    }

    closePayoutModal() {
        const modal = document.getElementById('payoutModal');
        const form = modal.querySelector('.bg-white');
        
        form.classList.remove('scale-100', 'opacity-100');
        form.classList.add('scale-95', 'opacity-0');
        
        setTimeout(() => {
            modal.classList.add('hidden');
            document.getElementById('payoutNotes').value = '';
        }, 300);
    }

    async submitPayoutRequest() {
        const referralId = document.getElementById('payoutReferralSelect').value;
        const amount = document.getElementById('payoutAmount').value;
        const notes = document.getElementById('payoutNotes').value;
        const submitBtn = document.getElementById('submitPayoutBtn');

        if (!referralId) {
            Toast.error('Please select a referral');
            return;
        }

        this.setLoading(submitBtn, true);

        try {
            const response = await apiClient.post('/payouts/request', {
                referral_id: referralId,
                amount: parseFloat(amount),
                notes: notes
            });

            if (response.data.success) {
                Toast.success('Payout request submitted to Cryptware team. Payment will be processed within 24-48 hours.');
                this.closePayoutModal();
                
                // Add to pending payouts and refresh data
                this.payoutRequests.add(referralId);
                await this.loadCommissionReport();
            } else {
                throw new Error(response.data.message);
            }
        } catch (error) {
            console.error('Payout request error:', error);
            Toast.error(error.response?.data?.message || 'Failed to submit payout request');
        } finally {
            this.setLoading(submitBtn, false);
        }
    }

    setupEventListeners() {
        // Close modal on outside click
        document.getElementById('payoutModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closePayoutModal();
            }
        });
    }

    // Utility functions
    formatCurrency(amount) {
        return '₦' + (parseInt(amount || 0)).toLocaleString();
    }

    getStatusBadge(status) {
        const statusMap = {
            'code_sent': ['bg-blue-100 text-blue-800', 'Code Sent'],
            'contacted': ['bg-yellow-100 text-yellow-800', 'Contacted'],
            'meeting_scheduled': ['bg-indigo-100 text-indigo-800', 'Meeting Scheduled'],
            'proposal_sent': ['bg-purple-100 text-purple-800', 'Proposal Sent'],
            'negotiation': ['bg-orange-100 text-orange-800', 'Negotiation'],
            'won': ['bg-green-100 text-green-800', 'Won'],
            'fully_paid': ['bg-green-100 text-green-800', 'Fully Paid'],
            'lost': ['bg-red-100 text-red-800', 'Lost']
        };
        
        const [bgColor, text] = statusMap[status] || ['bg-gray-100 text-gray-800', status];
        return `<span class="status-badge ${bgColor}">${text}</span>`;
    }

    getPayoutStatusBadge(status) {
        const statusMap = {
            'pending': ['status-pending', 'Pending'],
            'processing': ['status-processing', 'Processing'],
            'paid': ['status-paid', 'Paid'],
            'failed': ['status-failed', 'Failed'],
            'cancelled': ['status-pending', 'Cancelled']
        };
        
        const [className, text] = statusMap[status] || ['status-pending', status];
        return `<span class="status-badge ${className}">${text}</span>`;
    }

    setLoading(button, isLoading) {
        const btnText = button.querySelector('.btn-text');
        const spinner = button.querySelector('.loading-spinner');
        
        if (isLoading) {
            button.disabled = true;
            btnText.textContent = 'Processing...';
            spinner.classList.remove('hidden');
        } else {
            button.disabled = false;
            btnText.textContent = 'Request Payout';
            spinner.classList.add('hidden');
        }
    }

    showLoadingState() {
        document.getElementById('commissionTableBody').innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-8 text-center">
                    <div class="flex items-center justify-center">
                        <div class="loading-spinner text-blue-600 mr-3">
                            <i class="fas fa-spinner"></i>
                        </div>
                        <span class="text-gray-600">Loading commission data...</span>
                    </div>
                </td>
            </tr>
        `;
    }

    showEmptyState() {
        document.getElementById('emptyState').classList.remove('hidden');
        document.getElementById('commissionTableBody').innerHTML = '';
    }

    // Export and refresh functions
    async exportCommissionReport() {
        try {
            Toast.info('Preparing commission report for download...');
            
            const response = await apiClient.get('/commissions/export', {
                responseType: 'blob'
            });

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `commission-report-${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            Toast.success('Commission report downloaded successfully!');
        } catch (error) {
            console.error('Export error:', error);
            Toast.error('Failed to download report');
        }
    }

    async refreshCommissionData() {
        await this.loadCommissionReport();
        Toast.success('Commission data refreshed!');
    }
}

// Initialize commission report when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.commissionReport = new CommissionReport();
});

export default CommissionReport;