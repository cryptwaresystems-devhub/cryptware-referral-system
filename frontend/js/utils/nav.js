
// Mobile menu functionality
document.getElementById('mobileMenuButton').addEventListener('click', function() {
    const menu = document.getElementById('mobileMenu');
    menu.classList.toggle('open');
});

// Close mobile menu when clicking outside
document.addEventListener('click', function(event) {
    const menu = document.getElementById('mobileMenu');
    const button = document.getElementById('mobileMenuButton');
    if (!menu.contains(event.target) && !button.contains(event.target)) {
        menu.classList.remove('open');
    }
});

// Set current date
document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
});

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', function() {
    AuthManager.logout();
});

// Close mobile menu when clicking on links
document.querySelectorAll('#mobileMenu a').forEach(link => {
    link.addEventListener('click', () => {
        document.getElementById('mobileMenu').classList.remove('open');
    });
});