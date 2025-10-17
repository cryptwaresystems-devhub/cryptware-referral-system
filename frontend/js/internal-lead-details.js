// Internal Lead Details JavaScript - Complete with backend integration
class InternalLeadDetails {
    constructor() {
        this.currentUser = null;
        this.leadId = null;
        this.leadData = null;
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Internal Lead Details...');
        await this.checkAuth();
        this.extractLeadId();
        await this.loadLeadDetails();
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

    extractLeadId() {
        const urlParams = new URLSearchParams(window.location.search);
        this.leadId = urlParams.get('id');
        
        if (!this.leadId) {
            this.showError('No lead ID provided in URL');
            return;
        }
        
        console.log('🔍 Lead ID:', this.leadId);
    }

    async loadLeadDetails() {
        if (!this.leadId) return;

        try {
            console.log('📊 Loading lead details...');
            this.showLoadingState();

            const response = await this.apiCall('GET', `/leads/${this.leadId}`);
            
            if (response && response.success) {
                console.log('✅ Lead data loaded:', response.data);
                this.leadData = response.data.lead;
                this.renderLeadDetails();
                this.hideLoadingState();
            } else {
                throw new Error(response?.message || 'Failed to load lead details');
            }

        } catch (error) {
            console.error('💥 Lead details load error:', error);
            this.hideLoadingState();
            this.showError(error.message || 'Failed to load lead details');
        }
    }

    renderLeadDetails() {
        if (!this.leadData) return;

        // Payment Status Banner
        if (this.leadData.payment_completed) {
            document.getElementById('paymentStatus').innerHTML = `
                <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 fade-in">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <i class="fas fa-check-circle text-green-500 text-2xl mr-3"></i>
                            <div>
                                <div class="font-semibold text-green-800 text-lg">Payments Completed ✅</div>
                                <div class="text-sm text-green-600">
                                    All payments completed on ${this.formatDate(this.leadData.payment_completed_at)}
                                    ${this.leadData.payment_completed_by ? `by ${this.leadData.internal_users?.name || 'Internal User'}` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">
                            Ready for Payout
                        </div>
                    </div>
                </div>
            `;
        }

        // Basic Information
        document.getElementById('companyName').textContent = this.leadData.company_name;
        document.getElementById('contactName').textContent = this.leadData.contact_name;
        document.getElementById('email').textContent = this.leadData.email;
        document.getElementById('phone').textContent = this.leadData.phone;
        document.getElementById('industry').textContent = this.leadData.industry || 'Not specified';
        document.getElementById('jobTitle').textContent = this.leadData.job_title || 'Not specified';

        // ERP & Business Details
        document.getElementById('erpSystem').textContent = this.leadData.erp_system || 'Not specified';
        document.getElementById('implementationTimeline').textContent = this.leadData.implementation_timeline || 'Not specified';
        
        const estimatedValue = this.leadData.estimated_value ? `₦${this.leadData.estimated_value.toLocaleString()}` : 'Not specified';
        document.getElementById('estimatedValue').textContent = estimatedValue;
        
        document.getElementById('leadSource').textContent = this.leadData.source === 'partner' ? 'Partner Referral' : 'Internal Direct';

        // Status
        this.updateStatusBadge(this.leadData.status);

        // Assignment & Timeline
        document.getElementById('assignedTo').textContent = this.leadData.internal_users?.name || 'Not assigned';
        document.getElementById('createdAt').textContent = this.formatDate(this.leadData.created_at);
        document.getElementById('lastContact').textContent = this.leadData.last_contact ? this.formatDate(this.leadData.last_contact) : 'Never';
        document.getElementById('updatedAt').textContent = this.formatDate(this.leadData.updated_at);

        // Referral Information
        if (this.leadData.referrals) {
            document.getElementById('referralInfo').classList.remove('hidden');
            document.getElementById('referralCode').textContent = this.leadData.referrals.referral_code;
            document.getElementById('partnerCompany').textContent = this.leadData.referrals.partners?.company_name || 'Unknown';
            document.getElementById('partnerContact').textContent = this.leadData.referrals.partners?.contact_name || 'Unknown';
            document.getElementById('partnerEmail').textContent = this.leadData.referrals.partners?.email || 'Unknown';
            
            // Show referral status
            document.getElementById('referralStatus').classList.remove('hidden');
            document.getElementById('referralStatusText').textContent = this.getStatusText(this.leadData.referrals.status);
        }

        // Activities
        this.renderActivities(this.leadData.activities || []);

        // Payments
        this.renderPayments(this.leadData.client_payments || []);

        // Show the content
        document.getElementById('leadContent').classList.remove('hidden');
    }

    updateStatusBadge(status) {
        const badge = document.getElementById('leadStatusBadge');
        badge.textContent = this.getStatusText(status);
        badge.className = `status-badge status-${status}`;
    }

    getStatusText(status) {
        const statusMap = {
            'new': 'New',
            'contacted': 'Contacted', 
            'qualified': 'Qualified',
            'proposal': 'Proposal',
            'negotiation': 'Negotiation',
            'converted': 'Converted',
            'lost': 'Lost',
            'fully_paid': 'Fully Paid'
        };
        return statusMap[status] || status;
    }

    getActivityTypeText(type) {
        const typeMap = {
            'call': 'Phone Call',
            'email': 'Email',
            'meeting': 'Meeting',
            'demo': 'Demo',
            'proposal_sent': 'Proposal Sent',
            'follow_up': 'Follow Up',
            'note': 'Note',
            'status_changed': 'Status Changed',
            'information_updated': 'Information Updated',
            'lead_created': 'Lead Created'
        };
        return typeMap[type] || type;
    }

    formatDate(dateString) {
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

    renderActivities(activities) {
        const activitiesList = document.getElementById('activitiesList');
        const noActivities = document.getElementById('noActivities');

        if (activities.length === 0) {
            activitiesList.innerHTML = '';
            noActivities.classList.remove('hidden');
            return;
        }

        noActivities.classList.add('hidden');
        
        // Sort activities by date (newest first)
        activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        activitiesList.innerHTML = activities.map(activity => `
            <div class="flex space-x-3">
                <div class="flex-shrink-0">
                    <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <i class="fas fa-${this.getActivityIcon(activity.type)} text-blue-600 text-sm"></i>
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                        <span class="activity-type type-${activity.type}">
                            ${this.getActivityTypeText(activity.type)}
                        </span>
                        <span class="text-xs text-gray-500">${this.formatDate(activity.created_at)}</span>
                    </div>
                    <p class="text-sm text-gray-700 mt-1">${this.escapeHtml(activity.notes)}</p>
                    <div class="text-xs text-gray-500 mt-1">
                        <i class="fas fa-user mr-1"></i>${activity.internal_users?.name || 'System'}
                    </div>
                </div>
            </div>
        `).join('');
    }

    getActivityIcon(type) {
        const iconMap = {
            'call': 'phone',
            'email': 'envelope',
            'meeting': 'calendar-alt',
            'demo': 'desktop',
            'proposal_sent': 'file-contract',
            'follow_up': 'redo',
            'note': 'sticky-note',
            'status_changed': 'sync-alt',
            'information_updated': 'edit',
            'lead_created': 'plus-circle'
        };
        return iconMap[type] || 'circle';
    }

    renderPayments(payments) {
        const paymentsTableBody = document.getElementById('paymentsTableBody');
        const noPayments = document.getElementById('noPayments');
        const paymentSummary = document.getElementById('paymentSummary');
        const paymentHistory = document.getElementById('paymentHistory');

        if (payments.length === 0) {
            paymentsTableBody.innerHTML = '';
            noPayments.classList.remove('hidden');
            paymentSummary.classList.add('hidden');
            paymentHistory.classList.add('hidden');
            return;
        }

        noPayments.classList.add('hidden');
        paymentSummary.classList.remove('hidden');
        paymentHistory.classList.remove('hidden');

        // Calculate totals
        const totalPayments = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
        const totalCommission = payments.reduce((sum, payment) => sum + (payment.commission_calculated || 0), 0);
        const netRevenue = totalPayments - totalCommission;

        // Update summary
        document.getElementById('totalPayments').textContent = `₦${totalPayments.toLocaleString()}`;
        document.getElementById('totalCommission').textContent = `₦${totalCommission.toLocaleString()}`;
        document.getElementById('netRevenue').textContent = `₦${netRevenue.toLocaleString()}`;

        // Render payment table
        paymentsTableBody.innerHTML = payments.map(payment => `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-3 py-3 text-sm text-gray-900">${this.formatDate(payment.payment_date)}</td>
                <td class="px-3 py-3 text-sm text-gray-900 font-semibold">₦${(payment.amount || 0).toLocaleString()}</td>
                <td class="px-3 py-3 text-sm text-green-600 font-semibold">₦${(payment.commission_calculated || 0).toLocaleString()}</td>
                <td class="px-3 py-3 text-sm text-gray-600">${this.formatPaymentMethod(payment.payment_method)}</td>
                <td class="px-3 py-3">
                    <span class="status-badge ${payment.status === 'confirmed' ? 'status-converted' : 'status-new'}">
                        ${payment.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                    </span>
                </td>
                <td class="px-3 py-3 text-sm text-gray-500 font-mono">${payment.transaction_reference || '-'}</td>
            </tr>
        `).join('');
    }

    formatPaymentMethod(method) {
        const methodMap = {
            'bank_transfer': 'Bank Transfer',
            'card': 'Credit/Debit Card',
            'cash': 'Cash',
            'other': 'Other'
        };
        return methodMap[method] || method;
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

    // Payment Completion Method
    async markPaymentComplete() {
        if (!confirm('Mark this lead as fully paid? This will allow the partner to request payout for their commission.')) {
            return;
        }

        try {
            const response = await this.apiCall('PATCH', `/leads/${this.leadId}/payment-complete`);
            
            if (response && response.success) {
                Toast.success('Lead marked as payment completed! Partner can now request payout.');
                await this.loadLeadDetails(); // Refresh data
            } else {
                throw new Error(response?.message || 'Failed to mark payment as complete');
            }
        } catch (error) {
            console.error('Payment completion error:', error);
            Toast.error(error.message || 'Failed to mark payment as complete');
        }
    }

    // Modal Methods
    showAddActivityModal() {
        document.getElementById('addActivityModal').classList.remove('hidden');
    }

    hideAddActivityModal() {
        document.getElementById('addActivityModal').classList.add('hidden');
        document.getElementById('activityType').value = '';
        document.getElementById('activityNotes').value = '';
    }

    showUpdateStatusModal() {
        document.getElementById('updateStatusModal').classList.remove('hidden');
        document.getElementById('newStatus').value = this.leadData.status;
    }

    hideUpdateStatusModal() {
        document.getElementById('updateStatusModal').classList.add('hidden');
        document.getElementById('newStatus').value = '';
        document.getElementById('statusNotes').value = '';
    }

    showRecordPaymentModal() {
        document.getElementById('recordPaymentModal').classList.remove('hidden');
        document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
    }

    hideRecordPaymentModal() {
        document.getElementById('recordPaymentModal').classList.add('hidden');
        document.getElementById('paymentAmount').value = '';
        document.getElementById('paymentDate').value = '';
        document.getElementById('paymentMethod').value = 'bank_transfer';
        document.getElementById('paymentReference').value = '';
        document.getElementById('commissionPreview').classList.add('hidden');
    }

    // Form Submission Methods
    async submitActivity() {
        const type = document.getElementById('activityType').value;
        const notes = document.getElementById('activityNotes').value;

        if (!type || !notes) {
            Toast.error('Please fill in all required fields');
            return;
        }

        try {
            const response = await this.apiCall('POST', `/leads/${this.leadId}/activities`, {
                type,
                notes
            });

            if (response && response.success) {
                Toast.success('Activity added successfully!');
                this.hideAddActivityModal();
                await this.loadLeadDetails(); // Refresh data
            } else {
                throw new Error(response?.message || 'Failed to add activity');
            }
        } catch (error) {
            console.error('Activity submission error:', error);
            Toast.error(error.message || 'Failed to add activity');
        }
    }

    async submitStatusUpdate() {
        const status = document.getElementById('newStatus').value;
        const notes = document.getElementById('statusNotes').value;

        if (!status) {
            Toast.error('Please select a status');
            return;
        }

        try {
            const response = await this.apiCall('PUT', `/leads/${this.leadId}/status`, {
                status,
                notes: notes || `Status changed to ${status}`
            });

            if (response && response.success) {
                Toast.success('Status updated successfully!');
                this.hideUpdateStatusModal();
                await this.loadLeadDetails(); // Refresh data
            } else {
                throw new Error(response?.message || 'Failed to update status');
            }
        } catch (error) {
            console.error('Status update error:', error);
            Toast.error(error.message || 'Failed to update status');
        }
    }

    async submitPayment() {
        const amount = parseFloat(document.getElementById('paymentAmount').value);
        const paymentDate = document.getElementById('paymentDate').value;
        const paymentMethod = document.getElementById('paymentMethod').value;
        const transactionReference = document.getElementById('paymentReference').value;

        if (!amount || amount <= 0 || !paymentDate) {
            Toast.error('Please fill in all required fields');
            return;
        }

        try {
            // Use lead_id instead of referral_id to match the API endpoint
            const response = await this.apiCall('POST', '/payments', {
                lead_id: this.leadId,  // Send lead_id instead of referral_id
                amount,
                payment_date: paymentDate,
                payment_method: paymentMethod,
                transaction_reference: transactionReference || null
                // Remove status since the API sets it to 'confirmed' by default
            });

            if (response && response.success) {
                Toast.success('Payment recorded successfully!');
                this.hideRecordPaymentModal();
                await this.loadLeadDetails(); // Refresh data
            } else {
                throw new Error(response?.message || 'Failed to record payment');
            }
        } catch (error) {
            console.error('Payment submission error:', error);
            Toast.error(error.message || 'Failed to record payment');
        }
    }

    // Utility Methods
    calculateCommission() {
        const amount = parseFloat(document.getElementById('paymentAmount').value) || 0;
        const commission = amount * 0.05; // 5%
        
        const preview = document.getElementById('commissionPreview');
        document.getElementById('commissionAmount').textContent = `₦${commission.toLocaleString()}`;
        
        if (amount > 0) {
            preview.classList.remove('hidden');
        } else {
            preview.classList.add('hidden');
        }
    }

    async apiCall(method, endpoint, data = null) {
        try {
            const baseURL = window.CONFIG?.API?.BASE_URL || 'http://localhost:8000/api';
            const token = localStorage.getItem('authToken');
            
            console.log(`🌐 API Call: ${method} ${baseURL}${endpoint}`, data);

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

    showLoadingState() {
        document.getElementById('loadingState').classList.remove('hidden');
        document.getElementById('leadContent').classList.add('hidden');
        document.getElementById('errorState').classList.add('hidden');
    }

    hideLoadingState() {
        document.getElementById('loadingState').classList.add('hidden');
    }

    showError(message) {
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('leadContent').classList.add('hidden');
        document.getElementById('errorState').classList.remove('hidden');
        document.getElementById('errorMessage').textContent = message;
    }

    setupEventListeners() {
        // Modal triggers
        document.getElementById('addActivityBtn').addEventListener('click', () => this.showAddActivityModal());
        document.getElementById('updateStatusBtn').addEventListener('click', () => this.showUpdateStatusModal());
        document.getElementById('recordPaymentBtn').addEventListener('click', () => this.showRecordPaymentModal());
        
        // Quick actions
        document.getElementById('addFirstActivity').addEventListener('click', () => this.showAddActivityModal());
        document.getElementById('recordFirstPayment').addEventListener('click', () => this.showRecordPaymentModal());
        
        // Quick action buttons
        document.getElementById('sendEmailBtn').addEventListener('click', () => {
            document.getElementById('activityType').value = 'email';
            this.showAddActivityModal();
        });
        
        document.getElementById('scheduleCallBtn').addEventListener('click', () => {
            document.getElementById('activityType').value = 'call';
            this.showAddActivityModal();
        });
        
        document.getElementById('addNoteBtn').addEventListener('click', () => {
            document.getElementById('activityType').value = 'note';
            this.showAddActivityModal();
        });

        // Payment completion
        document.getElementById('markPaymentCompleteBtn').addEventListener('click', () => this.markPaymentComplete());

        // Commission calculation
        document.getElementById('paymentAmount').addEventListener('input', () => this.calculateCommission());

        // Retry button
        document.getElementById('retryButton').addEventListener('click', () => this.loadLeadDetails());

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            AuthManager.logout();
        });

        console.log('✅ Event listeners setup complete');
    }
}

// Initialize lead details when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Starting Internal Lead Details...');
    window.leadDetails = new InternalLeadDetails();
});