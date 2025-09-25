class ABHIChatRealtime {
    constructor() {
        this.peer = null;
        this.connections = new Map();
        this.currentUser = null;
        this.messages = [];
        this.isTyping = false;
        this.typingTimeout = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // User configuration
        this.users = {
            'khusbu': { 
                password: 'khusbu123', 
                displayName: 'Khusbu', 
                peerId: 'abhi-chat-khusbu-2025',
                avatar: '👩'
            },
            'abhijit': { 
                password: 'abhi123', 
                displayName: 'Abhijit', 
                peerId: 'abhi-chat-abhijit-2025',
                avatar: '👨'
            }
        };
        
        this.init();
    }

    async init() {
        this.initializeElements();
        this.setupEventListeners();
        this.loadChatHistory();
        this.checkExistingSession();
        
        // Initialize PeerJS with multiple server options
        this.initializePeer();
        
        console.log('🚀 ABHI Chat initialized - Cross-device ready!');
    }

    initializeElements() {
        // Login elements
        this.loginPage = document.getElementById('loginPage');
        this.chatPage = document.getElementById('chatPage');
        this.loginForm = document.getElementById('loginForm');
        this.loginBtn = document.getElementById('loginBtn');
        this.connectionStatus = document.getElementById('connectionStatus');
        
        // Chat elements
        this.messageForm = document.getElementById('messageForm');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.charCounter = document.getElementById('charCounter');
        this.sendBtn = document.getElementById('sendBtn');
        
        // Header elements
        this.otherUserName = document.getElementById('otherUserName');
        this.otherUserAvatar = document.getElementById('otherUserAvatar');
        this.userStatus = document.getElementById('userStatus');
        this.statusText = document.getElementById('statusText');
        
        // UI elements
        this.emojiBtn = document.getElementById('emojiBtn');
        this.emojiPicker = document.getElementById('emojiPicker');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.toast = document.getElementById('toast');
    }

    setupEventListeners() {
        // Form events
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.messageForm.addEventListener('submit', (e) => this.handleSendMessage(e));
        
        // Button events
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        document.getElementById('clearChat').addEventListener('click', () => this.clearChat());
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshConnection());
        
        // Emoji picker events
        this.emojiBtn.addEventListener('click', () => this.toggleEmojiPicker());
        document.getElementById('closeEmoji').addEventListener('click', () => this.hideEmojiPicker());
        
        document.querySelectorAll('.emoji').forEach(emoji => {
            emoji.addEventListener('click', (e) => this.insertEmoji(e.target.dataset.emoji));
        });

        // Message input events
        this.messageInput.addEventListener('input', () => {
            this.updateCharCounter();
            this.handleTyping();
        });
        
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage(e);
            }
        });

        // Global events
        document.addEventListener('click', (e) => {
            if (!this.emojiPicker.contains(e.target) && e.target !== this.emojiBtn) {
                this.hideEmojiPicker();
            }
        });

        window.addEventListener('beforeunload', () => this.handleDisconnect());
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Visibility change for presence
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.updatePresence('away');
            } else {
                this.updatePresence('online');
            }
        });
    }

    async initializePeer() {
        const peerConfig = {
            debug: 2,
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            }
        };

        // Try multiple PeerJS servers
        const servers = [
            { host: '0.peerjs.com', port: 443, path: '/', secure: true },
            { host: 'peerjs-server.herokuapp.com', port: 443, path: '/peerjs', secure: true }
        ];

        for (let serverConfig of servers) {
            try {
                await this.tryPeerConnection({ ...peerConfig, ...serverConfig });
                break;
            } catch (error) {
                console.warn('Failed to connect to server:', serverConfig.host);
                continue;
            }
        }
    }

    tryPeerConnection(config) {
        return new Promise((resolve, reject) => {
            try {
                this.peer = new Peer(config);
                
                const timeout = setTimeout(() => {
                    this.peer?.destroy();
                    reject(new Error('Connection timeout'));
                }, 10000);

                this.peer.on('open', () => {
                    clearTimeout(timeout);
                    console.log('✅ Peer connection established');
                    this.updateConnectionStatus('Ready to Connect', 'success');
                    resolve();
                });

                this.peer.on('error', (err) => {
                    clearTimeout(timeout);
                    console.error('Peer error:', err);
                    reject(err);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        const loginId = document.getElementById('loginId').value.trim().toLowerCase();
        const password = document.getElementById('password').value;
        const errorElement = document.getElementById('loginError');

        if (!this.users[loginId] || this.users[loginId].password !== password) {
            this.showError('❌ Invalid credentials! Please check your login details.');
            return;
        }

        try {
            this.showLoadingOverlay('Establishing P2P Connection...', 'Setting up secure peer-to-peer connection');
            this.loginBtn.classList.add('loading');

            // Destroy existing peer if any
            if (this.peer && !this.peer.destroyed) {
                this.peer.destroy();
            }

            // Create new peer with user-specific ID
            this.peer = new Peer(this.users[loginId].peerId, {
                host: '0.peerjs.com',
                port: 443,
                path: '/',
                secure: true,
                debug: 1,
                config: {
                    'iceServers': [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            });

            await this.waitForPeerReady();

            this.currentUser = {
                loginId: loginId,
                displayName: this.users[loginId].displayName,
                peerId: this.users[loginId].peerId,
                avatar: this.users[loginId].avatar,
                loginTime: Date.now()
            };

            this.otherUser = loginId === 'khusbu' ? 
                this.users['abhijit'] : this.users['khusbu'];

            localStorage.setItem('abhiChatCurrentUser', JSON.stringify(this.currentUser));
            
            this.setupPeerListeners();
            await this.connectToOtherUser();
            
            this.hideLoadingOverlay();
            this.loginBtn.classList.remove('loading');
            this.showChatPage();
            this.showToast(`Welcome ${this.currentUser.displayName}! 🎉`, 'success');

        } catch (error) {
            console.error('Login failed:', error);
            this.hideLoadingOverlay();
            this.loginBtn.classList.remove('loading');
            this.showError(`❌ Connection failed: ${error.message}. Please try again.`);
        }
    }

    waitForPeerReady() {
        return new Promise((resolve, reject) => {
            if (this.peer.open) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('Peer connection timeout'));
            }, 15000);

            this.peer.on('open', (id) => {
                clearTimeout(timeout);
                console.log('✅ Peer ID assigned:', id);
                resolve();
            });

            this.peer.on('error', (err) => {
                clearTimeout(timeout);
                console.error('Peer error:', err);
                reject(err);
            });
        });
    }

    setupPeerListeners() {
        this.peer.on('connection', (conn) => {
            console.log('📞 Incoming connection from:', conn.peer);
            this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('❌ Peer error:', err);
            this.handlePeerError(err);
        });

        this.peer.on('disconnected', () => {
            console.warn('⚠️ Peer disconnected');
            this.updateConnectionStatus('Reconnecting...', 'warning');
            this.attemptReconnect();
        });
    }

    async connectToOtherUser() {
        try {
            console.log('🔗 Connecting to:', this.otherUser.peerId);
            
            const conn = this.peer.connect(this.otherUser.peerId, {
                reliable: true,
                serialization: 'json'
            });

            if (conn) {
                this.handleConnection(conn);
                
                // Wait for connection to open
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Connection timeout'));
                    }, 10000);

                    conn.on('open', () => {
                        clearTimeout(timeout);
                        resolve();
                    });

                    conn.on('error', (err) => {
                        clearTimeout(timeout);
                        reject(err);
                    });
                });
            }
        } catch (error) {
            console.warn('⚠️ Direct connection failed:', error.message);
            // Connection will be established when other user comes online
        }
    }

    handleConnection(conn) {
        this.connections.set(conn.peer, conn);
        
        conn.on('open', () => {
            console.log('✅ Connection opened with:', conn.peer);
            this.updateConnectionStatus('Connected', 'online');
            this.reconnectAttempts = 0;
            
            // Send initial handshake
            this.sendToPeer({
                type: 'handshake',
                user: this.currentUser,
                timestamp: Date.now()
            });
            
            this.showToast(`Connected to ${this.otherUser.displayName}! 🎉`, 'success');
        });

        conn.on('data', (data) => {
            this.handleIncomingData(data);
        });

        conn.on('close', () => {
            console.log('⚠️ Connection closed with:', conn.peer);
            this.connections.delete(conn.peer);
            this.updateConnectionStatus('Disconnected', 'offline');
            this.showToast('Connection lost. Attempting to reconnect...', 'warning');
        });

        conn.on('error', (err) => {
            console.error('❌ Connection error:', err);
            this.connections.delete(conn.peer);
        });
    }

    handleIncomingData(data) {
        switch (data.type) {
            case 'message':
                this.handleIncomingMessage(data);
                break;
            case 'typing':
                this.handleIncomingTyping(data);
                break;
            case 'handshake':
                console.log('🤝 Handshake received from:', data.user.displayName);
                this.updateConnectionStatus('Connected', 'online');
                break;
            case 'presence':
                this.handlePresenceUpdate(data);
                break;
        }
    }

    handleIncomingMessage(data) {
        const message = {
            id: data.id,
            text: data.text,
            sender: data.sender,
            senderName: data.senderName,
            timestamp: data.timestamp,
            avatar: data.avatar
        };

        // Add to messages array
        this.messages.push(message);
        this.saveChatHistory();
        
        // Display message
        this.displayMessage(message);
        this.scrollToBottom();
        
        // Play notification sound
        this.playNotificationSound();
        
        // Show notification if page is not visible
        if (document.hidden) {
            this.showBrowserNotification(message);
        }
    }

    handleIncomingTyping(data) {
        if (data.isTyping) {
            this.showTypingIndicator(data.user);
        } else {
            this.hideTypingIndicator();
        }
    }

    async handleSendMessage(e) {
        e.preventDefault();
        const messageText = this.messageInput.value.trim();
        
        if (!messageText || messageText.length > 500) return;

        const message = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            text: messageText,
            sender: this.currentUser.loginId,
            senderName: this.currentUser.displayName,
            timestamp: Date.now(),
            avatar: this.currentUser.avatar,
            type: 'message'
        };

        // Add to local messages
        this.messages.push(message);
        this.saveChatHistory();
        
        // Display message immediately
        this.displayMessage(message);
        
        // Send to peer
        this.sendToPeer(message);
        
        // Clear input and stop typing indicator
        this.messageInput.value = '';
        this.updateCharCounter();
        this.stopTyping();
        this.scrollToBottom();
        
        // Disable send button briefly to prevent spam
        this.sendBtn.disabled = true;
        setTimeout(() => {
            this.sendBtn.disabled = false;
        }, 500);
    }

    sendToPeer(data) {
        let sentCount = 0;
        this.connections.forEach((conn, peerId) => {
            if (conn.open) {
                try {
                    conn.send(data);
                    sentCount++;
                } catch (error) {
                    console.error('Failed to send to:', peerId, error);
                }
            }
        });
        
        if (sentCount === 0 && data.type === 'message') {
            // Store message for delivery when user comes online
            this.storeForLaterDelivery(data);
        }
        
        return sentCount > 0;
    }

    storeForLaterDelivery(message) {
        const pendingKey = `abhiChat_pending_${this.currentUser.loginId}`;
        const pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
        pending.push(message);
        localStorage.setItem(pendingKey, JSON.stringify(pending));
    }

    displayMessage(message) {
        // Remove welcome message if present
        const welcomeMessage = this.messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        const messageDiv = document.createElement('div');
        const isOwn = message.sender === this.currentUser.loginId;
        messageDiv.className = `message ${isOwn ? 'sent' : 'received'}`;
        
        const messageTime = new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        messageDiv.innerHTML = `
            <div class="message-content">${this.formatMessageText(message.text)}</div>
            <div class="message-time">
                ${messageTime}
                ${isOwn ? '<i class="fas fa-check"></i>' : ''}
            </div>
        `;

        this.messagesContainer.appendChild(messageDiv);
    }

    formatMessageText(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
            .replace(/\n/g, '<br>')
            .replace(/:\)/g, '😊')
            .replace(/:\(/g, '😢')
            .replace(/:D/g, '😃')
            .replace(/:P/g, '😛')
            .replace(/<3/g, '❤️');
    }

    handleTyping() {
        if (!this.isTyping) {
            this.isTyping = true;
            this.sendToPeer({
                type: 'typing',
                isTyping: true,
                user: this.currentUser.displayName
            });
        }

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.stopTyping();
        }, 3000);
    }

    stopTyping() {
        if (this.isTyping) {
            this.isTyping = false;
            this.sendToPeer({
                type: 'typing',
                isTyping: false,
                user: this.currentUser.displayName
            });
        }
        clearTimeout(this.typingTimeout);
    }

    showTypingIndicator(username) {
        this.hideTypingIndicator(); // Remove existing indicator
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
            <span style="margin-left: 10px; color: var(--text-light); font-size: 14px;">
                ${username} is typing...
            </span>
        `;
        
        this.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.hideTypingIndicator();
        }, 5000);
    }

    hideTypingIndicator() {
        const indicator = this.messagesContainer.querySelector('.typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    showChatPage() {
        this.loginPage.style.display = 'none';
        this.chatPage.style.display = 'flex';
        
        // Update UI
        this.otherUserName.textContent = this.otherUser.displayName;
        this.otherUserAvatar.textContent = this.otherUser.avatar;
        
        // Load and display messages
        this.displayAllMessages();
        
        // Focus input
        setTimeout(() => {
            this.messageInput.focus();
        }, 300);
        
        this.updateCharCounter();
    }

    displayAllMessages() {
        // Clear container except typing indicator
        const typingIndicator = this.messagesContainer.querySelector('.typing-indicator');
        this.messagesContainer.innerHTML = '';
        
        if (this.messages.length === 0) {
            this.messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <h3>Start Chatting with ${this.otherUser.displayName}!</h3>
                    <p>Your messages will sync in real-time across all devices</p>
                    <div class="connection-info">
                        <i class="fas fa-mobile-alt"></i>
                        <span>Cross-device messaging active</span>
                    </div>
                </div>
            `;
        } else {
            this.messages.forEach(message => {
                this.displayMessage(message);
            });
        }
        
        if (typingIndicator) {
            this.messagesContainer.appendChild(typingIndicator);
        }
        
        this.scrollToBottom();
    }

    updateCharCounter() {
        const remaining = 500 - this.messageInput.value.length;
        this.charCounter.textContent = remaining;
        this.charCounter.style.color = remaining < 50 ? 'var(--error-color)' : 'var(--text-light)';
    }

    updateConnectionStatus(status, type = 'default') {
        this.statusText.textContent = status;
        
        const statusElement = this.userStatus;
        statusElement.className = `status ${type}`;
        
        const icon = statusElement.querySelector('i');
        switch (type) {
            case 'online':
                icon.className = 'fas fa-circle';
                break;
            case 'offline':
                icon.className = 'fas fa-circle';
                break;
            case 'warning':
                icon.className = 'fas fa-exclamation-circle';
                break;
            default:
                icon.className = 'fas fa-circle';
        }
    }

    updatePresence(status) {
        this.sendToPeer({
            type: 'presence',
            status: status,
            user: this.currentUser.displayName,
            timestamp: Date.now()
        });
    }

    refreshConnection() {
        if (this.currentUser) {
            this.showToast('Refreshing connection...', 'warning');
            this.connectToOtherUser();
        }
    }

    toggleEmojiPicker() {
        const isVisible = this.emojiPicker.style.display === 'block';
        if (isVisible) {
            this.hideEmojiPicker();
        } else {
            this.showEmojiPicker();
        }
    }

    showEmojiPicker() {
        this.emojiPicker.style.display = 'block';
    }

    hideEmojiPicker() {
        this.emojiPicker.style.display = 'none';
    }

    insertEmoji(emoji) {
        const cursorPos = this.messageInput.selectionStart;
        const textBefore = this.messageInput.value.substring(0, cursorPos);
        const textAfter = this.messageInput.value.substring(cursorPos);
        
        this.messageInput.value = textBefore + emoji + textAfter;
        this.messageInput.focus();
        this.messageInput.setSelectionRange(cursorPos + emoji.length, cursorPos + emoji.length);
        
        this.updateCharCounter();
        this.hideEmojiPicker();
    }

    clearChat() {
        if (confirm('🗑️ Are you sure you want to clear all chat history?\n\nThis action cannot be undone and will clear messages on all devices.')) {
            this.messages = [];
            this.saveChatHistory();
            this.displayAllMessages();
            this.showToast('Chat history cleared', 'success');
        }
    }

    logout() {
        if (confirm('👋 Are you sure you want to logout?')) {
            this.handleDisconnect();
            
            // Clear session
            localStorage.removeItem('abhiChatCurrentUser');
            this.currentUser = null;
            this.otherUser = null;
            
            // Reset form
            document.getElementById('loginId').value = '';
            document.getElementById('password').value = '';
            this.messageInput.value = '';
            
            // Show login page
            this.chatPage.style.display = 'none';
            this.loginPage.style.display = 'flex';
            
            this.showToast('Logged out successfully', 'success');
        }
    }

    handleDisconnect() {
        if (this.peer && !this.peer.destroyed) {
            this.peer.destroy();
        }
        this.connections.clear();
        this.stopTyping();
    }

    handleOnline() {
        console.log('📶 Back online');
        this.showToast('Connection restored', 'success');
        if (this.currentUser && (!this.peer || this.peer.destroyed)) {
            this.initializePeer();
        }
    }

    handleOffline() {
        console.log('📵 Gone offline');
        this.showToast('No internet connection', 'error');
        this.updateConnectionStatus('Offline', 'offline');
    }

    handlePeerError(error) {
        console.error('Peer error:', error);
        this.updateConnectionStatus('Connection Error', 'offline');
        
        if (!this.peer.destroyed) {
            this.attemptReconnect();
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}`);
            
            setTimeout(() => {
                if (this.currentUser) {
                    this.initializePeer().then(() => {
                        this.setupPeerListeners();
                        this.connectToOtherUser();
                    });
                }
            }, 2000 * this.reconnectAttempts);
        }
    }

    loadChatHistory() {
        const saved = localStorage.getItem('abhiChatMessages');
        if (saved) {
            try {
                this.messages = JSON.parse(saved);
            } catch (error) {
                console.error('Error loading chat history:', error);
                this.messages = [];
            }
        }
    }

    saveChatHistory() {
        try {
            localStorage.setItem('abhiChatMessages', JSON.stringify(this.messages));
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
    }

    checkExistingSession() {
        const saved = localStorage.getItem('abhiChatCurrentUser');
        if (saved) {
            try {
                const userData = JSON.parse(saved);
                // Auto-login if session is less than 24 hours old
                if (Date.now() - userData.loginTime < 24 * 60 * 60 * 1000) {
                    console.log('🔄 Restoring session for:', userData.displayName);
                    // Don't auto-login, let user manually login for security
                    document.getElementById('loginId').value = userData.loginId;
                }
            } catch (error) {
                localStorage.removeItem('abhiChatCurrentUser');
            }
        }
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
    }

    showLoadingOverlay(title, message) {
        document.getElementById('loadingTitle').textContent = title;
        document.getElementById('loadingMessage').textContent = message;
        this.loadingOverlay.style.display = 'flex';
    }

    hideLoadingOverlay() {
        this.loadingOverlay.style.display = 'none';
    }

    showError(message) {
        const errorElement = document.getElementById('loginError');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    }

    showToast(message, type = 'default') {
        const toast = this.toast;
        const toastMessage = document.getElementById('toastMessage');
        
        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        toast.style.display = 'flex';
        
        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }

    playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.log('🔇 Audio not available');
        }
    }

    showBrowserNotification(message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`New message from ${message.senderName}`, {
                body: message.text,
                icon: '/favicon.ico',
                tag: 'abhi-chat'
            });
        } else if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.abhiChat = new ABHIChatRealtime();
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    console.log('🎉 ABHI Chat loaded successfully!');
});
