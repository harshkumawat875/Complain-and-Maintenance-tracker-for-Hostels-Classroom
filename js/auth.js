// Google OAuth Configuration
const GOOGLE_CONFIG = {
    // Replace with your actual Google OAuth Client ID
    CLIENT_ID: '623361446096-r6bslslav3u7br122lpvsg012tr3jni5.apps.googleusercontent.com', // Temporary placeholder - replace with real one
    // Authorized domains for your institute
    AUTHORIZED_DOMAINS: ['mitsgwl.ac.in'],
    // Redirect URI after successful authentication
    REDIRECT_URI: window.location.origin,
    // Demo mode flag
    DEMO_MODE: false
};

// Initialize Google Sign-In
function initializeGoogleAuth() {
    // Check if we have a valid Client ID format
    if (!GOOGLE_CONFIG.CLIENT_ID || GOOGLE_CONFIG.CLIENT_ID.includes('placeholder') || GOOGLE_CONFIG.CLIENT_ID.includes('1234567890')) {
        console.warn('⚠️ Please set up your real Google OAuth Client ID in js/auth.js');
        console.log('📖 Follow the guide in SETUP_REAL_GOOGLE_OAUTH.md');
        showSetupReminder();
        return;
    }
    
    // Load Google Identity Services
    if (typeof google !== 'undefined' && google.accounts) {
        try {
            google.accounts.id.initialize({
                client_id: GOOGLE_CONFIG.CLIENT_ID,
                callback: handleGoogleSignIn,
                auto_select: false,
                cancel_on_tap_outside: true,
                use_fedcm_for_prompt: true
            });
            
            console.log('✅ Google OAuth initialized successfully');
        } catch (error) {
            console.error('❌ Google OAuth initialization failed:', error);
            showSetupReminder();
        }
    }
}

// Show setup reminder for real Google OAuth
function showSetupReminder() {
    // Only show once per session
    if (sessionStorage.getItem('oauth_reminder_shown')) return;
    sessionStorage.setItem('oauth_reminder_shown', 'true');
    
    const reminder = document.createElement('div');
    reminder.className = 'fixed top-4 right-4 bg-blue-500 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm';
    reminder.innerHTML = `
        <div class="flex items-start">
            <i class="fas fa-info-circle mr-3 mt-1"></i>
            <div>
                <h4 class="font-bold mb-1">Setup Real Google OAuth</h4>
                <p class="text-sm mb-2">Follow SETUP_REAL_GOOGLE_OAUTH.md to enable real Google Sign-In</p>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" class="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded">
                    Got it
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(reminder);
    
    // Auto remove after 10 seconds
    setTimeout(() => {
        if (reminder.parentElement) {
            reminder.remove();
        }
    }, 10000);
}

// Handle Google Sign-In Response
function handleGoogleSignIn(response) {
    try {
        // Decode the JWT token
        const payload = parseJwt(response.credential);
        
        // Validate email domain
        if (!isAuthorizedEmail(payload.email)) {
            showError('Please use your official institute email address.');
            return;
        }
        
        // Extract user information
        const userInfo = {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
            firstName: payload.given_name,
            lastName: payload.family_name,
            picture: payload.picture,
            emailVerified: payload.email_verified
        };
        
        // Show loading state
        showLoadingState('Authenticating with Google...');
        
        // Send to backend for authentication
        fetch(`${API_BASE_URL}/api/auth/google`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: userInfo.email,
                name: userInfo.name,
                google_id: userInfo.id,
                picture: userInfo.picture
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.token) {
                // Store authentication data
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('authMethod', 'google');
                localStorage.setItem('loginTime', new Date().toISOString());
                
                // Show success message
                showSuccess(`Welcome ${data.user.name}! Redirecting to dashboard...`);
                
                // Redirect to dashboard
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 2000);
            } else {
                throw new Error(data.error || 'Authentication failed');
            }
        })
        .catch(error => {
            console.error('Authentication error:', error);
            showError('Authentication failed. Please try again.');
        });
        
    } catch (error) {
        console.error('Google Sign-In Error:', error);
        showError('Authentication failed. Please try again.');
    }
}

// Parse JWT token
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (error) {
        throw new Error('Invalid token format');
    }
}

// Check if email domain is authorized
function isAuthorizedEmail(email) {
    const domain = email.split('@')[1];
    return GOOGLE_CONFIG.AUTHORIZED_DOMAINS.some(authorizedDomain => 
        domain === authorizedDomain || domain.endsWith('.' + authorizedDomain)
    );
}

// Trigger Google Sign-In
function signInWithGoogle() {
    // Check if Google OAuth is properly configured
    if (!GOOGLE_CONFIG.CLIENT_ID || GOOGLE_CONFIG.CLIENT_ID.includes('placeholder') || GOOGLE_CONFIG.CLIENT_ID.includes('1234567890')) {
        showSetupReminder();
        return;
    }
    
    if (typeof google !== 'undefined' && google.accounts) {
        try {
            // Show loading state
            showLoadingState('Connecting to Google...');
            
            // Trigger Google Sign-In popup
            google.accounts.id.prompt((notification) => {
                // Remove loading state
                const overlay = document.getElementById('auth-overlay');
                if (overlay) overlay.remove();
                
                if (notification.isNotDisplayed()) {
                    console.log('Google One Tap not displayed:', notification.getNotDisplayedReason());
                    // Fallback: Use popup method
                    triggerGooglePopup();
                } else if (notification.isSkippedMoment()) {
                    console.log('Google One Tap skipped:', notification.getSkippedReason());
                    // User dismissed, no action needed
                }
            });
        } catch (error) {
            console.error('Google Sign-In error:', error);
            showError('Google Sign-In failed. Please try again.');
        }
    } else {
        showError('Google Sign-In is not available. Please refresh the page.');
    }
}

// Fallback popup method for Google Sign-In
function triggerGooglePopup() {
    // Create a temporary button for Google to render
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.top = '-9999px';
    tempContainer.id = 'temp-google-button';
    document.body.appendChild(tempContainer);
    
    // Render Google button and auto-click it
    google.accounts.id.renderButton(tempContainer, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: '300'
    });
    
    // Auto-click the button to trigger popup
    setTimeout(() => {
        const button = tempContainer.querySelector('div[role="button"]');
        if (button) {
            button.click();
        }
        // Clean up
        setTimeout(() => {
            if (tempContainer.parentElement) {
                tempContainer.remove();
            }
        }, 1000);
    }, 100);
}

// Demo Google Authentication Flow
function showDemoGoogleAuth() {
    // Create a demo login modal
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white p-8 rounded-2xl shadow-2xl max-w-md mx-4">
            <div class="text-center mb-6">
                <i class="fab fa-google text-4xl text-red-500 mb-4"></i>
                <h3 class="text-xl font-bold text-gray-900 mb-2">Demo Google Sign-In</h3>
                <p class="text-gray-600 text-sm">This is a demonstration of Google OAuth integration</p>
            </div>
            
            <form id="demoGoogleForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">
                        <i class="fas fa-envelope mr-2 text-red-500"></i>Institute Email
                    </label>
                    <input 
                        type="email" 
                        id="demoEmail" 
                        required
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                        placeholder="your.name@institute.edu"
                    >
                </div>
                
                <div class="flex space-x-3">
                    <button 
                        type="submit" 
                        class="flex-1 bg-red-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-600 transition duration-200"
                    >
                        <i class="fab fa-google mr-2"></i>Sign In
                    </button>
                    <button 
                        type="button" 
                        onclick="this.closest('.fixed').remove()" 
                        class="px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition duration-200"
                    >
                        Cancel
                    </button>
                </div>
            </form>
            
            <div class="mt-4 p-3 bg-blue-50 rounded-lg">
                <p class="text-xs text-blue-700">
                    <i class="fas fa-info-circle mr-1"></i>
                    <strong>Demo Mode:</strong> To enable real Google OAuth, follow the setup guide in GOOGLE_OAUTH_SETUP.md
                </p>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle demo form submission
    document.getElementById('demoGoogleForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('demoEmail').value;
        
        if (!email) {
            alert('Please enter an email address');
            return;
        }
        
        // Validate email domain
        if (!isAuthorizedEmail(email)) {
            showError('Please use your official institute email address.');
            return;
        }
        
        // Create demo user object
        const demoUser = {
            id: 'demo_' + Date.now(),
            email: email,
            name: email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()),
            firstName: email.split('@')[0].split('.')[0],
            lastName: email.split('@')[0].split('.')[1] || '',
            picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(email.split('@')[0])}&background=4f46e5&color=fff`,
            emailVerified: true
        };
        
        // Remove modal
        modal.remove();
        
        // Show loading state
        showLoadingState('Authenticating with Google...');
        
        // Simulate authentication process
        setTimeout(() => {
            // Store user info in localStorage
            localStorage.setItem('user', JSON.stringify(demoUser));
            localStorage.setItem('authMethod', 'google_demo');
            localStorage.setItem('loginTime', new Date().toISOString());
            
            // Show success message
            showSuccess(`Welcome ${demoUser.name}! Demo authentication successful.`);
            
            // Redirect to main page
            setTimeout(() => {
                window.location.href = 'index.html?authenticated=true';
            }, 2000);
            
        }, 1500);
    });
}

// Show loading state
function showLoadingState(message) {
    // Create or update loading overlay
    let overlay = document.getElementById('auth-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'auth-overlay';
        overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        document.body.appendChild(overlay);
    }
    
    overlay.innerHTML = `
        <div class="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-sm mx-4">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p class="text-gray-700 font-semibold">${message}</p>
        </div>
    `;
    overlay.style.display = 'flex';
}

// Show success message
function showSuccess(message) {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
        overlay.innerHTML = `
            <div class="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-sm mx-4">
                <div class="text-green-500 text-5xl mb-4">
                    <i class="fas fa-check-circle"></i>
                </div>
                <p class="text-gray-700 font-semibold">${message}</p>
            </div>
        `;
    }
}

// Show error message
function showError(message) {
    // Remove loading overlay if exists
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
        overlay.remove();
    }
    
    // Create error notification
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm';
    errorDiv.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-exclamation-triangle mr-3"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(errorDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 5000);
}

// Check if user is already authenticated
function checkAuthStatus() {
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    const authMethod = localStorage.getItem('authMethod');
    const loginTime = localStorage.getItem('loginTime');
    
    if (!user || !token || !authMethod || !loginTime) {
        return null;
    }
    
    // Check if session has expired (24 hours)
    const loginDate = new Date(loginTime);
    const now = new Date();
    const hoursDiff = (now - loginDate) / (1000 * 60 * 60);
    
    if (hoursDiff > 24) {
        clearAuthData();
        return null;
    }
    
    return JSON.parse(user);
}

// Refresh user profile data from server
async function refreshUserProfile() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const userData = await response.json();
            // Update localStorage with fresh data including profile picture
            localStorage.setItem('user', JSON.stringify(userData));
            return userData;
        }
    } catch (error) {
        console.error('Error refreshing user profile:', error);
    }
    
    return null;
}

// Clear authentication data
function clearAuthData() {
    localStorage.removeItem('user');
    localStorage.removeItem('authMethod');
    localStorage.removeItem('loginTime');
}

// Sign out function
function signOut() {
    // Clear all stored authentication data
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('authMethod');
    localStorage.removeItem('loginTime');
    
    // Disable Google auto-select if available
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.disableAutoSelect();
    }
    
    // Show logout message
    const logoutDiv = document.createElement('div');
    logoutDiv.className = 'fixed top-4 right-4 bg-green-500 text-white p-4 rounded-lg shadow-lg z-50';
    logoutDiv.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-check-circle mr-3"></i>
            <span>Successfully logged out!</span>
        </div>
    `;
    
    document.body.appendChild(logoutDiv);
    
    // Redirect to home page after showing message
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1500);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Always load Google Identity Services for real OAuth
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = function() {
        console.log('📡 Google Identity Services loaded');
        initializeGoogleAuth();
    };
    script.onerror = function() {
        console.error('❌ Failed to load Google Identity Services');
        showError('Failed to load Google Sign-In. Please check your internet connection.');
    };
    document.head.appendChild(script);
    
    // Check authentication status
    const currentUser = checkAuthStatus();
    if (currentUser && window.location.pathname.includes('login.html')) {
        // User is already logged in, redirect to main page
        window.location.href = 'index.html?authenticated=true';
    }
});

// Export functions for global use
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
window.checkAuthStatus = checkAuthStatus;
