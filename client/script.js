class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentConversation = null;
        this.token = localStorage.getItem('chat_token');
        this.isTyping = false;
        this.typingTimeout = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthentication();
    }

    setupEventListeners() {
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        document.getElementById('register-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        const messageInput = document.getElementById('message-input');
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            } else {
                this.handleTyping();
            }
        });

        messageInput.addEventListener('input', () => {
            this.handleTyping();
        });

        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                this.sendMessage();
            });
        }

        const imageBtn = document.getElementById('image-btn');
        const imageInput = document.getElementById('image-input');
        if (imageBtn && imageInput) {
            imageBtn.addEventListener('click', () => {
                imageInput.click();
            });
            imageInput.addEventListener('change', (e) => {
                this.handleImageUpload(e);
            });
        }

        const fileBtn = document.getElementById('file-btn');
        const fileInput = document.getElementById('file-input');
        if (fileBtn && fileInput) {
            fileBtn.addEventListener('click', () => {
                fileInput.click();
            });
            fileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e);
            });
        }

        const newChatBtn = document.querySelector('.new-chat-btn');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => {
                this.showCreateGroupModal();
            });
        }

        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        document.getElementById('back-btn').addEventListener('click', () => {
            this.goBackToChats();
        });

        document.getElementById('search-input').addEventListener('input', (e) => {
            this.searchConversations(e.target.value);
        });

        document.getElementById('chat-menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleChatMenu();
        });

        document.addEventListener('click', () => {
            this.closeChatMenu();
        });
    }

    async checkAuthentication() {
        if (this.token) {
            try {
                const response = await fetch('/api/users/profile', {
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    this.currentUser = data.user;
                    this.hideAuthModal();
                    this.showChatInterface();
                    this.initializeSocket();
                    this.loadUserData();
                } else {
                    this.clearToken();
                    this.showAuthModal();
                }
            } catch (error) {
                this.clearToken();
                this.showAuthModal();
            }
        } else {
            this.showAuthModal();
        }
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            this.showLoading();
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.currentUser = data.user;
                localStorage.setItem('chat_token', this.token);
                
                this.hideAuthModal();
                this.showChatInterface();
                this.initializeSocket();
                this.loadUserData();
                this.showToast('Login successful!', 'success');
            } else {
                this.showToast(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            this.showToast('Network error. Please try again.', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async handleRegister() {
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        try {
            this.showLoading();
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.currentUser = data.user;
                localStorage.setItem('chat_token', this.token);
                
                this.hideAuthModal();
                this.showChatInterface();
                this.initializeSocket();
                this.loadUserData();
                this.showToast('Registration successful! Welcome to the chat!', 'success');
            } else {
                this.showToast(data.error || 'Registration failed', 'error');
            }
        } catch (error) {
            this.showToast('Network error. Please try again.', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async logout() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
        } catch (error) {
        }

        this.clearToken();
        this.disconnectSocket();
        this.showAuthModal();
        this.showToast('Logged out successfully', 'info');
    }

    clearToken() {
        this.token = null;
        this.currentUser = null;
        localStorage.removeItem('chat_token');
    }

    initializeSocket() {
        this.socket = io();

        this.socket.emit('authenticate', this.token);

        this.socket.on('authenticated', (data) => {
        });

        this.socket.on('auth_error', (data) => {
            this.clearToken();
            this.showAuthModal();
        });

        this.socket.on('new_message', (message) => {
            if (message.sender_id !== this.currentUser.id) {
                this.displayMessage(message);
            } else {
                this.replaceOptimisticMessage(message);
            }
            
            this.updateConversationLastMessage(message);
            
            if (message.sender_id === this.currentUser.id) {
                setTimeout(() => {
                    this.updateMessageStatus(message.id, 'delivered');
                }, 1500);
                
                setTimeout(() => {
                    this.updateMessageStatus(message.id, 'read');
                }, 5000);
            }
        });

        this.socket.on('message_delivered', (data) => {
            this.updateMessageStatus(data.messageId, 'delivered');
        });

        this.socket.on('message_read', (data) => {
            this.updateMessageStatus(data.messageId, 'read');
        });

        this.socket.on('user_typing', (data) => {
            this.showTypingIndicator(data);
        });

        this.socket.on('user_stopped_typing', (data) => {
            this.hideTypingIndicator(data);
        });

        this.socket.on('user_online', (user) => {
            this.updateUserOnlineStatus(user, true);
        });

        this.socket.on('user_offline', (user) => {
            this.updateUserOnlineStatus(user, false);
        });

        this.socket.on('error', (data) => {
            this.showToast(data.error, 'error');
        });
    }

    disconnectSocket() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    async loadUserData() {
        document.getElementById('user-name').textContent = this.currentUser.username;
        
        await this.loadAllUsersAndConversations();
        
        await this.loadOnlineUsers();

        this.showWelcomeMessage();
    }

    async loadAllUsersAndConversations() {
        try {

            
            await this.loadConversations();
            
        } catch (error) {
            this.loadConversations();
        }
    }

    async loadConversations() {
        try {
            const response = await fetch('/api/users/conversations', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.displayConversations(data.conversations);
            } else {
                const errorText = await response.text();
            }
        } catch (error) {
        }
    }

    async loadOnlineUsers() {
        try {
            const response = await fetch('/api/users/online', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayOnlineUsers(data.users);
            }
        } catch (error) {
        }
    }

    displayConversations(conversations) {
        const container = document.getElementById('conversations-list');
        
        if (container) {
            container.innerHTML = '';
            conversations.forEach(conversation => {
                const conversationElement = this.createConversationElement(conversation);
                container.appendChild(conversationElement);
            });
        }
    }

    createConversationElement(conversation) {
        const div = document.createElement('div');
        div.className = 'conversation-item';
        div.dataset.conversationId = conversation.id;
        
        const lastMessageTime = conversation.last_message_time 
            ? this.formatTime(new Date(conversation.last_message_time))
            : '';

        const isOnline = conversation.status === 'online';
        const statusIndicator = isOnline ? '<span class="online-indicator"></span>' : '';

        let displayName = conversation.name || 'Unnamed Chat';
        if (conversation.type === 'direct') {
            displayName = conversation.other_username || conversation.name || 'Direct Chat';
        }
        
        div.innerHTML = `
            <div class="conversation-avatar">
                <i class="fas fa-${conversation.type === 'group' ? 'users' : 'user'}"></i>
                ${statusIndicator}
            </div>
            <div class="conversation-info">
                <div class="conversation-header">
                    <h4>${displayName}</h4>
                    <span class="conversation-time">${lastMessageTime}</span>
                </div>
                <p class="last-message">
                    ${conversation.type === 'group' && conversation.participant_count ? 
                        `<span class="participant-count">${conversation.participant_count} participants</span> • ` : ''
                    }${conversation.last_message || 'Start a conversation...'}
                </p>
            </div>
        `;

        div.addEventListener('click', () => {
            this.handleConversationClick(conversation);
        });

        return div;
    }

    async handleConversationClick(conversation) {
        if (typeof conversation.id === 'string' && conversation.id.startsWith('user_')) {
            await this.createOrGetConversation(conversation);
        } else {
            await this.selectConversation(conversation);
        }
    }

    async createOrGetConversation(userConversation) {
        try {
            const response = await fetch('/api/conversations/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    type: 'direct',
                    participants: [userConversation.user_id]
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                const conversation = {
                    id: data.conversationId,
                    name: userConversation.name,
                    type: 'direct'
                };
                
                await this.selectConversation(conversation);
            } else if (data.conversationId) {
                const conversation = {
                    id: data.conversationId,
                    name: userConversation.name,
                    type: 'direct'
                };
                
                await this.selectConversation(conversation);
            }
        } catch (error) {
            this.showToast('Failed to start conversation', 'error');
        }
    }

    displayOnlineUsers(users) {
        const container = document.getElementById('online-users-list');
        if (container) {
            container.innerHTML = '';
            users.forEach(user => {
                const userElement = this.createOnlineUserElement(user);
                container.appendChild(userElement);
            });
        }
    }

    createOnlineUserElement(user) {
        const div = document.createElement('div');
        div.className = 'online-user-item';
        div.dataset.userId = user.id;

        div.innerHTML = `
            <div class="user-avatar">
                <i class="fas fa-user"></i>
            </div>
            <div class="user-info">
                <span class="username">${user.username}</span>
                <div class="user-status online">
                    <span class="status-dot"></span>
                    <span>Online</span>
                </div>
            </div>
        `;

        div.addEventListener('click', () => {
            this.startConversationWithUser(user);
        });

        return div;
    }

    showChatInterface() {
        const authModal = document.getElementById('auth-modal');
        if (authModal) {
            authModal.classList.remove('active');
        }
        
        const chatApp = document.getElementById('chat-app');
        if (chatApp) {
            chatApp.classList.add('active');
            chatApp.style.display = 'flex';
        }
        
        const chatSidebar = document.querySelector('.chat-sidebar');
        const chatMain = document.querySelector('.chat-main');
        
        if (chatSidebar) {
            chatSidebar.style.display = 'flex';
        }
        
        if (chatMain) {
            chatMain.classList.remove('active');
        }
        
        this.showWelcomeMessage();
    }

    showWelcomeMessage() {
        const container = document.getElementById('messages-list');
        
        if (container) {
            container.innerHTML = '';
        }
    }

    async startConversationWithUser(user) {
        try {
            const response = await fetch('/api/conversations/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    type: 'direct',
                    participants: [user.id]
                })
            });

            if (response.ok) {
                const data = await response.json();
                
                await this.loadConversations();
                
                const conversation = {
                    id: data.conversationId,
                    name: user.username,
                    type: 'direct'
                };
                
                await this.selectConversation(conversation);
            } else {
                const errorData = await response.json();
                if (errorData.message === 'Conversation already exists') {
                    await this.loadConversations();
                    const existingConv = document.querySelector(`[data-conversation-id="${errorData.conversationId}"]`);
                    if (existingConv) {
                        existingConv.click();
                    }
                } else {
                    this.showToast('Failed to start conversation', 'error');
                }
            }
        } catch (error) {
            this.showToast('Failed to start conversation', 'error');
        }
    }

    async selectConversation(conversation) {
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });

        const selectedElement = document.querySelector(`[data-conversation-id="${conversation.id}"]`);
        if (selectedElement) {
            selectedElement.classList.add('active');
        }

        this.currentConversation = conversation;

        const isGroup = conversation.type === 'group';
        document.getElementById('current-chat-name').textContent = 
            isGroup ? conversation.name : (conversation.other_username || conversation.username || conversation.name || 'Chat');
        
        if (isGroup) {
            const participantCount = conversation.participant_count || conversation.participants?.length || 0;
            document.getElementById('chat-status').textContent = `${participantCount} participants`;
        } else {
            document.getElementById('chat-status').textContent = 'Online'; // Show online status when in chat
        }

        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            backBtn.style.display = 'flex';
        }

        const chatMain = document.querySelector('.chat-main');
        if (chatMain) {
            chatMain.classList.add('active');
        }

        if (this.socket) {
            this.socket.emit('join_conversation', conversation.id);
        }

        await this.loadMessages(conversation.id);
    }

    async loadMessages(conversationId) {
        try {
            const response = await fetch(`/api/messages/${conversationId}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayMessages(data.messages);
            }
        } catch (error) {
        }
    }

    displayMessages(messages) {
        const container = document.getElementById('messages-list');
        if (container) {
            container.innerHTML = '';
            let lastDate = null;
            
            messages.forEach((message, index) => {
                const messageDate = this.getMessageDate(message.created_at ? new Date(message.created_at) : new Date());
                
                if (lastDate !== messageDate) {

                    const dateSeparator = this.createDateSeparator(message.created_at ? new Date(message.created_at) : new Date());
                    container.appendChild(dateSeparator);
                    lastDate = messageDate;
                }
                
                const messageElement = this.createMessageElement(message);
                container.appendChild(messageElement);
            });
            container.scrollTop = container.scrollHeight;
        }
    }

    createMessageElement(message) {
        const div = document.createElement('div');
        const isOwnMessage = message.sender_id === this.currentUser.id;
        
        div.className = `message ${isOwnMessage ? 'own-message' : 'other-message'}`;
        div.dataset.messageId = message.id;

        let messageTime;
        if (message.created_at) {
            messageTime = new Date(message.created_at);
        } else {
            messageTime = new Date();
        }
        const time = this.formatTime(messageTime);
        
        let statusTicks = '';
        if (isOwnMessage) {
            let status = 'sent'; // Default status
            
            if (!message.created_at) {
                status = 'sent';
            } else {
                status = this.getMessageStatus(message);
            }
            
            if (status === 'sent') {
                statusTicks = '<span class="message-status single-tick" title="Sent">✓</span>';
            } else if (status === 'delivered') {
                statusTicks = '<span class="message-status double-tick" title="Delivered">✓✓</span>';
            } else if (status === 'read') {
                statusTicks = '<span class="message-status double-tick-filled" title="Read">✓✓</span>';
            }
        }

        div.innerHTML = `
            <div class="message-content">
                ${!isOwnMessage ? `
                    <div class="message-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                ` : ''}
                <div class="message-bubble">
                    ${!isOwnMessage ? `<div class="sender-name">${message.sender_username}</div>` : ''}
                    ${this.getMessageContent(message)}
                    <div class="message-meta">
                        <span class="message-time">${time}</span>${statusTicks}
                    </div>
                </div>
            </div>
        `;

        div.dataset.createdAt = message.created_at || new Date().toISOString();

        return div;
    }

    createDateSeparator(date) {
        const separator = document.createElement('div');
        separator.className = 'date-separator';
        
        const dateText = this.formatDateSeparator(date);
        separator.innerHTML = `
            <div class="date-separator-line"></div>
            <div class="date-separator-text">${dateText}</div>
            <div class="date-separator-line"></div>
        `;
        
        return separator;
    }

    displayMessage(message) {
        if (!this.currentConversation || message.conversation_id !== this.currentConversation.id) {
            return;
        }

        const container = document.getElementById('messages-list');
        if (container) {
            const messages = container.querySelectorAll('.message');
            const lastMessage = messages[messages.length - 1];
            
            if (lastMessage) {
                const lastMessageDate = this.getMessageDate(new Date(lastMessage.dataset.createdAt || Date.now()));
                const currentMessageDate = this.getMessageDate(message.created_at ? new Date(message.created_at) : new Date());
                
                if (lastMessageDate !== currentMessageDate) {

                    
                    const existingSeparators = container.querySelectorAll('.date-separator');
                    const dateText = this.formatDateSeparator(message.created_at ? new Date(message.created_at) : new Date());
                    let separatorExists = false;
                    
                    existingSeparators.forEach(sep => {
                        if (sep.textContent.includes(dateText)) {
                            separatorExists = true;
                        }
                    });
                    
                    if (!separatorExists) {
                        const dateSeparator = this.createDateSeparator(message.created_at ? new Date(message.created_at) : new Date());
                        container.appendChild(dateSeparator);
                    }
                }
            } else {
                const existingSeparators = container.querySelectorAll('.date-separator');
                if (existingSeparators.length === 0) {
                    const dateSeparator = this.createDateSeparator(message.created_at ? new Date(message.created_at) : new Date());
                    container.appendChild(dateSeparator);
                }
            }
            
            const messageElement = this.createMessageElement(message);
            container.appendChild(messageElement);
            container.scrollTop = container.scrollHeight;
        }
    }

    sendMessage() {
        const input = document.getElementById('message-input');
        const content = input.value.trim();

        if (!content || !this.currentConversation) {
            return;
        }

        const optimisticMessage = {
            id: Date.now(), // Temporary ID
            content: content,
            sender_id: this.currentUser.id,
            sender_username: this.currentUser.username,
            conversation_id: this.currentConversation.id,
            created_at: null // Will trigger 'sent' status
        };
        
        this.displayMessage(optimisticMessage);
        
        if (this.socket) {
            this.socket.emit('send_message', {
                conversationId: this.currentConversation.id,
                content: content,
                messageType: 'text'
            });
        }

        input.value = '';
        
        this.stopTyping();
    }

    handleTyping() {
        if (!this.currentConversation || !this.socket) return;

        if (!this.isTyping) {
            this.isTyping = true;
            this.socket.emit('typing_start', this.currentConversation.id);
        }

        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        this.typingTimeout = setTimeout(() => {
            this.stopTyping();
        }, 2000);
    }

    stopTyping() {
        if (this.isTyping && this.currentConversation && this.socket) {
            this.isTyping = false;
            this.socket.emit('typing_stop', this.currentConversation.id);
        }

        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
    }

    showTypingIndicator(data) {
        if (data.conversationId === this.currentConversation?.id) {
            const indicator = document.getElementById('typing-indicator');
            const text = indicator.querySelector('.typing-text');
            text.textContent = `${data.username} is typing...`;
            indicator.style.display = 'flex';
        }
    }

    hideTypingIndicator(data) {
        if (data.conversationId === this.currentConversation?.id) {
            const indicator = document.getElementById('typing-indicator');
            indicator.style.display = 'none';
        }
    }

    updateConversationLastMessage(message) {
        const conversationElement = document.querySelector(`[data-conversation-id="${message.conversation_id}"]`);
        if (conversationElement) {
            const lastMessageElement = conversationElement.querySelector('.last-message');
            const timeElement = conversationElement.querySelector('.conversation-time');
            
            if (lastMessageElement) {
                lastMessageElement.textContent = message.content.length > 50 
                    ? message.content.substring(0, 50) + '...'
                    : message.content;
            }
            
            if (timeElement) {
                timeElement.textContent = this.formatTime(new Date(message.created_at));
            }
        }
    }

    updateUserOnlineStatus(user, isOnline) {
        const userElement = document.querySelector(`[data-user-id="${user.userId}"]`);
        if (userElement) {
            const statusElement = userElement.querySelector('.user-status');
            if (statusElement) {
                statusElement.className = `user-status ${isOnline ? 'online' : 'offline'}`;
                statusElement.querySelector('span:last-child').textContent = isOnline ? 'Online' : 'Offline';
            }
        }
    }

    searchConversations(query) {
        const conversations = document.querySelectorAll('.conversation-item');
        
        conversations.forEach(conversation => {
            const name = conversation.querySelector('h4').textContent.toLowerCase();
            const lastMessage = conversation.querySelector('.last-message').textContent.toLowerCase();
            
            if (name.includes(query.toLowerCase()) || lastMessage.includes(query.toLowerCase())) {
                conversation.style.display = 'flex';
            } else {
                conversation.style.display = 'none';
            }
        });
    }

    showAuthModal() {
        document.getElementById('auth-modal').classList.add('active');
        document.getElementById('chat-app').classList.remove('active');
    }

    hideAuthModal() {
        document.getElementById('auth-modal').classList.remove('active');
        document.getElementById('chat-app').classList.add('active');
    }

    showLoading() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) {
            spinner.style.display = 'flex';
        }
    }

    hideLoading() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    container.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this.showToast('Please select a valid image file', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            this.showToast('Image size should be less than 5MB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = e.target.result;
            this.sendImageMessage(imageData, file.name, file.size);
        };
        reader.readAsDataURL(file);
        
        event.target.value = ''; // Clear the input
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            this.showToast('File size should be less than 10MB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const fileData = e.target.result;
            this.sendDocumentMessage(fileData, file.name, file.size, file.type);
        };
        reader.readAsDataURL(file);
        
        event.target.value = ''; // Clear the input
    }

    sendImageMessage(imageData, fileName, fileSize) {
        if (!this.currentConversation) {
            this.showToast('Please select a conversation first', 'error');
            return;
        }

        const messageData = {
            conversation_id: this.currentConversation.id,
            type: 'image',
            image_data: imageData,
            file_name: fileName,
            file_size: fileSize,
            content: `Image: ${fileName}`
        };

        const optimisticMessage = {
            id: 'temp-' + Date.now(),
            ...messageData,
            sender_id: this.currentUser.id,
            created_at: null
        };

        this.displayMessage(optimisticMessage);
        this.socket.emit('send_message', messageData);
    }

    sendDocumentMessage(fileData, fileName, fileSize, fileType) {
        if (!this.currentConversation) {
            this.showToast('Please select a conversation first', 'error');
            return;
        }

        const messageData = {
            conversation_id: this.currentConversation.id,
            type: 'document',
            file_data: fileData,
            file_name: fileName,
            file_size: fileSize,
            file_type: fileType,
            content: `📎 Document: ${fileName}`
        };

        const optimisticMessage = {
            id: 'temp-' + Date.now(),
            ...messageData,
            sender_id: this.currentUser.id,
            created_at: null
        };

        this.displayMessage(optimisticMessage);
        this.socket.emit('send_message', messageData);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getMessageContent(message) {
        if (message.type === 'image') {
            const imageData = message.image_data || message.file_data;
            return `
                <div class="message-image-container">
                    <img src="${imageData}" alt="${message.file_name || 'Image'}" class="message-image" onclick="this.classList.toggle('enlarged')">
                    <div class="image-info">
                        <span class="image-name"><i class="fas fa-image"></i> ${message.file_name || 'image.jpg'}</span>
                        <span class="image-size">${this.formatFileSize(message.file_size || 0)}</span>
                    </div>
                </div>
            `;
        } else if (message.type === 'document') {
            const fileData = message.file_data;
            return `
                <div class="message-document-container">
                    <div class="document-icon">
                        <i class="fas fa-file-alt"></i>
                    </div>
                    <div class="document-info">
                        <div class="document-name">${message.file_name || 'document.pdf'}</div>
                        <div class="document-size">${this.formatFileSize(message.file_size || 0)}</div>
                        <a href="${fileData}" download="${message.file_name}" class="document-download">
                            <i class="fas fa-download"></i> Download
                        </a>
                    </div>
                </div>
            `;
        } else {
            return `<div class="message-text">${this.escapeHtml(message.content)}</div>`;
        }
    }

    getMessageStatus(message) {
        const messageAge = Date.now() - new Date(message.created_at).getTime();
        
        if (messageAge < 2000) {
            return 'sent';
        }
        
        if (messageAge < 10000) {
            return 'delivered';
        }
        
        return 'read';
    }

    updateMessageStatus(messageId, newStatus) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const statusElement = messageElement.querySelector('.message-status');
        if (!statusElement) return;

        if (newStatus === 'sent') {
            statusElement.innerHTML = '✓';
            statusElement.className = 'message-status single-tick';
            statusElement.title = 'Sent';
        } else if (newStatus === 'delivered') {
            statusElement.innerHTML = '✓✓';
            statusElement.className = 'message-status double-tick';
            statusElement.title = 'Delivered';
        } else if (newStatus === 'read') {
            statusElement.innerHTML = '✓✓';
            statusElement.className = 'message-status double-tick-filled';
            statusElement.title = 'Read';
        }
    }

    replaceOptimisticMessage(serverMessage) {
        const messages = document.querySelectorAll('.message.own-message');
        const lastMessage = messages[messages.length - 1];
        
        if (lastMessage) {
            lastMessage.dataset.messageId = serverMessage.id;
            lastMessage.dataset.createdAt = serverMessage.created_at;
            
            
            setTimeout(() => {
                this.updateMessageStatus(serverMessage.id, 'delivered');
            }, 500);
        }
    }

    goBackToChats() {
        if (this.socket && this.currentConversation) {
            this.socket.emit('leave_conversation', this.currentConversation.id);
        }

        this.currentConversation = null;

        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            backBtn.style.display = 'none';
        }

        const chatMain = document.querySelector('.chat-main');
        if (chatMain) {
            chatMain.classList.remove('active');
        }

        document.getElementById('current-chat-name').textContent = 'Select a conversation';
        document.getElementById('chat-status').textContent = 'Click on a conversation to start chatting';

        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });

        this.loadAllUsersAndConversations();

        this.showWelcomeMessage();
    }

    formatTime(date = null) {
        const sourceDate = date || new Date();
        
        const utcTime = sourceDate.getTime();
        const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
        const istTime = new Date(utcTime + istOffset);
        
        const hours = istTime.getUTCHours().toString().padStart(2, '0');
        const minutes = istTime.getUTCMinutes().toString().padStart(2, '0');
        
        return `${hours}:${minutes}`;
    }

    formatDateSeparator(date) {
        if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
            date = new Date();
        }
        
        const istTime = new Date(date.getTime() + (330 * 60 * 1000));
        
        return istTime.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC' // Use UTC since we already converted
        });
    }

    getMessageDate(date) {
        if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
            date = new Date();
        }
        
        const istTime = new Date(date.getTime() + (330 * 60 * 1000));
        
        const year = istTime.getUTCFullYear();
        const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
        const day = String(istTime.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    getToken() {
        return localStorage.getItem('chat_token');
    }

    showCreateGroupModal() {
        const modalHTML = `
            <div id="group-modal" class="group-modal-overlay">
                <div class="group-modal-container">
                    <div class="group-modal-header">
                        <h3>Create Group Chat</h3>
                        <button class="close-modal-btn" id="close-group-modal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="group-modal-content">
                        <div class="input-group">
                            <label>Group Name</label>
                            <input type="text" id="group-name" placeholder="Enter group name" maxlength="50">
                        </div>
                        <div class="input-group">
                            <label>Select Members</label>
                            <div id="users-selection" class="users-selection">
                                <!-- Users will be loaded here -->
                            </div>
                        </div>
                    </div>
                    <div class="group-modal-footer">
                        <button type="button" class="btn-secondary" id="cancel-group-modal">Cancel</button>
                        <button type="button" class="btn-primary" id="create-group-btn">Create Group</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        document.getElementById('close-group-modal').addEventListener('click', () => {
            this.closeCreateGroupModal();
        });
        
        document.getElementById('cancel-group-modal').addEventListener('click', () => {
            this.closeCreateGroupModal();
        });
        
        document.getElementById('create-group-btn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.createGroup();
        });
        
        this.loadUsersForGroupSelection();
    }

    async loadUsersForGroupSelection() {
        const usersContainer = document.getElementById('users-selection');
        
        try {
            usersContainer.innerHTML = '<p class="loading-users">Loading users...</p>';
            
            const token = localStorage.getItem('chat_token');
            if (!token) {
                throw new Error('No authentication token found. Please log in again.');
            }
            
            if (!this.currentUser || !this.currentUser.id) {
                throw new Error('Current user data not available');
            }
            

            
            let response;
            let apiUrl = '/api/users';
            
            try {
                response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            } catch (fetchError) {

                apiUrl = '/api/users/all';
                response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            }
            

            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API call failed with status ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();

            
            if (!data.users || !Array.isArray(data.users)) {
                throw new Error('Invalid response format: users array not found');
            }
            
            const otherUsers = data.users.filter(user => 
                user.id && user.id !== this.currentUser.id
            );
            

            
            if (otherUsers.length > 0) {
                usersContainer.innerHTML = otherUsers.map(user => `
                    <label class="user-checkbox">
                        <input type="checkbox" value="${user.id}" data-username="${user.username || 'Unknown'}">
                        <span class="checkbox-custom"></span>
                        <span class="user-name">${user.username || 'Unknown User'}</span>
                        <span class="user-status ${user.status === 'online' ? 'online' : 'offline'}">
                            ${user.status || 'offline'}
                        </span>
                    </label>
                `).join('');
                

            } else {
                usersContainer.innerHTML = `
                    <div class="no-users-message">
                        <i class="fas fa-users"></i>
                        <p>No other users available</p>
                        <small>You need other registered users to create groups</small>
                    </div>
                `;
            }
            
        } catch (error) {
            usersContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Cannot load users</p>
                    <small>${error.message}</small>
                    <br>
                    <button id="retry-load-users" class="retry-btn">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
            this.showToast('Failed to load users: ' + error.message, 'error');
            
            const retryBtn = document.getElementById('retry-load-users');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    this.loadUsersForGroupSelection();
                });
            }
        }
    }

    closeCreateGroupModal() {
        const modal = document.getElementById('group-modal');
        if (modal) {
            modal.remove();
        }
    }

    async createGroup(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const groupName = document.getElementById('group-name').value.trim();
        const selectedUsers = Array.from(document.querySelectorAll('#users-selection input[type="checkbox"]:checked'))
            .map(checkbox => parseInt(checkbox.value));

        if (!groupName) {
            this.showToast('Please enter a group name', 'error');
            return;
        }

        if (selectedUsers.length === 0) {
            this.showToast('Please select at least one member', 'error');
            return;
        }

        try {
            const response = await fetch('/api/conversations/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getToken()}`
                },
                body: JSON.stringify({
                    type: 'group',
                    name: groupName,
                    participants: selectedUsers
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.showToast('Group created successfully!', 'success');
                this.closeCreateGroupModal();
                
                await this.loadConversations();
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Failed to create group', 'error');
            }
        } catch (error) {
            this.showToast('Failed to create group', 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    toggleChatMenu() {
        if (!this.currentConversation) return;
        
        const menuBtn = document.getElementById('chat-menu-btn');
        let dropdown = document.querySelector('.chat-menu-dropdown');
        
        if (dropdown) {
            dropdown.remove();
            return;
        }
        
        dropdown = document.createElement('div');
        dropdown.className = 'chat-menu-dropdown show';
        
        const menuItems = [];
        
        if (this.currentConversation.type === 'group') {
            menuItems.push({
                icon: 'fas fa-info-circle',
                text: 'Group Info',
                action: () => this.showGroupInfo()
            });
        }
        
        menuItems.forEach(item => {
            const menuItem = document.createElement('button');
            menuItem.className = 'chat-menu-item';
            menuItem.innerHTML = `<i class="${item.icon}"></i> ${item.text}`;
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                item.action();
                dropdown.remove();
            });
            dropdown.appendChild(menuItem);
        });
        
        menuBtn.parentNode.appendChild(dropdown);
    }
    
    closeChatMenu() {
        const dropdown = document.querySelector('.chat-menu-dropdown');
        if (dropdown) {
            dropdown.remove();
        }
    }

    async showGroupInfo() {
        if (!this.currentConversation || this.currentConversation.type !== 'group') return;
        
        const modal = document.getElementById('group-info-modal');
        const titleEl = document.getElementById('group-info-title');
        const nameEl = document.getElementById('group-info-name');
        const membersEl = document.getElementById('group-info-members');
        
        titleEl.textContent = 'Group Info';
        nameEl.textContent = this.currentConversation.name;
        membersEl.textContent = 'Loading members...';
        
        modal.style.display = 'flex';
        
        try {
            const response = await fetch(`/api/conversations/${this.currentConversation.id}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const participants = data.conversation.participants;
                membersEl.textContent = `${participants.length} members: ${participants.map(p => p.username).join(', ')}`;
            }
        } catch (error) {
            membersEl.textContent = 'Failed to load members';
        }
        
        this.setupGroupInfoListeners();
    }
    
    setupGroupInfoListeners() {
        document.getElementById('close-group-info').onclick = () => {
            document.getElementById('group-info-modal').style.display = 'none';
        };
        
        document.getElementById('leave-group-btn').onclick = () => {
            this.leaveGroup();
        };
        
        document.getElementById('delete-group-btn').onclick = () => {
            this.confirmDeleteGroup();
        };
        
        document.getElementById('group-info-modal').onclick = (e) => {
            if (e.target.id === 'group-info-modal') {
                document.getElementById('group-info-modal').style.display = 'none';
            }
        };
    }
    
    async confirmDeleteGroup() {
        const confirmed = confirm(`Are you sure you want to delete "${this.currentConversation.name}"? This action cannot be undone.`);
        if (confirmed) {
            await this.deleteGroup();
        }
    }
    
    async deleteGroup() {
        try {
            const response = await fetch(`/api/conversations/${this.currentConversation.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                this.showToast('Group deleted successfully', 'success');
                document.getElementById('group-info-modal').style.display = 'none';
                
                this.goBackToChats();
                
                await this.loadConversations();
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Failed to delete group', 'error');
            }
        } catch (error) {
            this.showToast('Failed to delete group', 'error');
        }
    }
    
    async leaveGroup() {
        const confirmed = confirm(`Are you sure you want to leave "${this.currentConversation.name}"?`);
        if (confirmed) {
            try {
                const response = await fetch(`/api/conversations/${this.currentConversation.id}/leave`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
                
                if (response.ok) {
                    this.showToast('Left group successfully', 'success');
                    document.getElementById('group-info-modal').style.display = 'none';
                    
                    this.goBackToChats();
                    
                    await this.loadConversations();
                } else {
                    const error = await response.json();
                    this.showToast(error.error || 'Failed to leave group', 'error');
                }
            } catch (error) {
                this.showToast('Failed to leave group', 'error');
            }
        }
    }
}

window.closeCreateGroupModal = function() {
    const modal = document.getElementById('group-modal');
    if (modal) {
        modal.remove();
    }
};

window.createGroup = function() {
    if (window.chatApp) {
        window.chatApp.createGroup();
    }
};

function switchToRegister() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
}

function switchToLogin() {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        window.chatApp = new ChatApp();
        
        const authModal = document.getElementById('auth-modal');
        if (authModal) {
            authModal.style.display = 'flex';
            authModal.classList.add('active');
        }
        
    } catch (error) {
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center; font-family: Arial;">
                <h2>Error Loading Chat App</h2>
                <p>Please refresh the page and try again.</p>
                <p>Error: ${error.message}</p>
            </div>
        `;
    }
});
