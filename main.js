// FlipFile - PDF Tools Platform
// Main JavaScript File

class FlipFile {
    constructor() {
        this.apiBaseUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:8000' 
            : 'https://api.flipfile.online';
        
        this.currentUser = this.getCurrentUser();
        this.initializeApp();
    }

    // Initialize the application
    initializeApp() {
        this.setupEventListeners();
        this.setupFileHandlers();
        this.setupToolSelection();
        this.setupPerformanceMonitoring();
        this.checkUserStatus();
    }

    // Get current user from localStorage
    getCurrentUser() {
        const userData = localStorage.getItem('flipfile_user');
        return userData ? JSON.parse(userData) : {
            isLoggedIn: false,
            isPremium: false,
            dailyTasks: 0,
            maxDailyTasks: 4,
            lastReset: new Date().toDateString()
        };
    }

    // Save user data to localStorage
    saveUserData() {
        localStorage.setItem('flipfile_user', JSON.stringify(this.currentUser));
    }

    // Check and reset daily tasks if needed
    checkUserStatus() {
        const today = new Date().toDateString();
        if (this.currentUser.lastReset !== today) {
            this.currentUser.dailyTasks = 0;
            this.currentUser.lastReset = today;
            this.saveUserData();
        }

        this.updateTaskCounter();
    }

    // Update task counter display
    updateTaskCounter() {
        const taskElement = document.getElementById('taskCounter');
        if (taskElement) {
            const remaining = this.currentUser.maxDailyTasks - this.currentUser.dailyTasks;
            taskElement.textContent = `Tasks Today: ${remaining}/${this.currentUser.maxDailyTasks}`;
            
            if (remaining <= 2) {
                taskElement.style.color = '#FF2323';
            } else if (remaining <= 5) {
                taskElement.style.color = '#FFCC33';
            } else {
                taskElement.style.color = '#1AA260';
            }
        }
    }

    // Setup all event listeners
    setupEventListeners() {
        // Ripple effect for buttons
        document.querySelectorAll('.ripple-btn').forEach(button => {
            button.addEventListener('click', this.createRippleEffect.bind(this));
        });

        // Search functionality
        const searchInput = document.querySelector('.search-bar input');
        const searchButton = document.querySelector('.search-bar button');
        
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchTools(searchInput.value);
                }
            });
        }

        if (searchButton) {
            searchButton.addEventListener('click', () => {
                this.searchTools(searchInput.value);
            });
        }

        // Login button
        const loginBtn = document.querySelector('.btn-login');
        if (loginBtn) {
            loginBtn.addEventListener('click', this.showLoginModal.bind(this));
        }

        // Mobile menu buttons
        document.querySelectorAll('.mobile-button-group .btn').forEach(button => {
            button.addEventListener('click', this.handleMobileButtonClick.bind(this));
        });

        // Tool card clicks
        document.querySelectorAll('.tool-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('a')) {
                    const toolName = card.querySelector('.tool-title').textContent;
                    this.selectTool(toolName);
                }
            });
        });

        // Plan buttons
        document.querySelectorAll('.plan-button').forEach(button => {
            button.addEventListener('click', this.handlePlanSelection.bind(this));
        });
    }

    // Setup file handlers for drag and drop
    setupFileHandlers() {
        const dropZone = document.getElementById('dropZone');
        const selectFileBtn = document.querySelector('.select-file-btn');

        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.style.backgroundColor = '#e8e5db';
                dropZone.style.borderStyle = 'solid';
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.style.backgroundColor = '';
                dropZone.style.borderStyle = 'dashed';
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.style.backgroundColor = '';
                dropZone.style.borderStyle = 'dashed';
                
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleFileSelection(files);
                }
            });
        }

        if (selectFileBtn) {
            selectFileBtn.addEventListener('click', () => {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.multiple = true;
                fileInput.accept = '.pdf,.jpg,.jpeg,.svg,.png,.tiff,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
                
                fileInput.addEventListener('change', (e) => {
                    const files = e.target.files;
                    if (files.length > 0) {
                        this.handleFileSelection(files);
                    }
                });
                
                fileInput.click();
            });
        }
    }

    // Setup tool selection
    setupToolSelection() {
        const toolSelect = document.getElementById('tool-select');
        if (toolSelect) {
            toolSelect.addEventListener('change', (e) => {
                this.selectedTool = e.target.value;
            });
        }

        // Set default tool
        this.selectedTool = 'convert';
    }

    // Create ripple effect on button click
    createRippleEffect(e) {
        const button = e.currentTarget;
        const x = e.clientX - button.getBoundingClientRect().left;
        const y = e.clientY - button.getBoundingClientRect().top;
        
        const ripple = document.createElement('span');
        ripple.classList.add('ripple');
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        
        button.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }

    // Handle file selection
    async handleFileSelection(files) {
        // Check daily task limit
        if (this.currentUser.dailyTasks >= this.currentUser.maxDailyTasks && !this.currentUser.isPremium) {
            this.showLimitExceededModal();
            return;
        }

        // Show processing modal with ad
        this.showProcessingModal(files.length);

        // Simulate ad display for 3-5 seconds
        await this.delay(4000);

        // Process files
        const results = await this.processFiles(files);
        
        // Hide processing modal
        this.hideProcessingModal();
        
        // Show results
        this.showResults(results);
        
        // Update task counter
        this.currentUser.dailyTasks += files.length;
        this.saveUserData();
        this.updateTaskCounter();
    }

    // Process files with API
    async processFiles(files) {
        const formData = new FormData();
        
        // Add files to form data
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });
        
        // Add metadata
        formData.append('tool', this.selectedTool);
        formData.append('userId', this.currentUser.id || 'anonymous');
        formData.append('isPremium', this.currentUser.isPremium);

        try {
            // Show progress
            this.updateProgress(30);
            
            // Make API call
            const response = await fetch(`${this.apiBaseUrl}/api/process`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json'
                }
            });

            this.updateProgress(70);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.updateProgress(100);

            return {
                success: true,
                files: data.processed_files,
                downloadUrl: data.download_url,
                message: data.message
            };

        } catch (error) {
            console.error('Error processing files:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to process files. Please try again.'
            };
        }
    }

    // Show processing modal
    showProcessingModal(fileCount) {
        const modal = document.getElementById('processingModal');
        if (modal) {
            modal.style.display = 'flex';
            
            // Update modal content
            const fileCountElement = modal.querySelector('#fileCount');
            if (fileCountElement) {
                fileCountElement.textContent = fileCount;
            }
            
            // Reset progress
            this.updateProgress(0);
        }
    }

    // Hide processing modal
    hideProcessingModal() {
        const modal = document.getElementById('processingModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Update progress bar
    updateProgress(percentage) {
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = `Processing... ${percentage}%`;
        }
    }

    // Show results
    showResults(results) {
        if (results.success) {
            // Create download link
            const downloadLink = document.createElement('a');
            downloadLink.href = results.downloadUrl;
            downloadLink.download = 'processed_files.zip';
            downloadLink.innerHTML = `
                <div style="text-align: center; padding: 20px; background: #1AA260; color: white; border-radius: 4px; margin: 20px 0;">
                    <i class="fas fa-download"></i>
                    <h3>Files Ready!</h3>
                    <p>${results.message}</p>
                    <button style="background: white; color: #1AA260; border: none; padding: 10px 20px; border-radius: 4px; margin-top: 10px; cursor: pointer;">
                        Download All Files
                    </button>
                </div>
            `;
            
            downloadLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = results.downloadUrl;
                
                // Show auto-delete notification
                setTimeout(() => {
                    alert('Note: Your files will be automatically deleted in 1 hour for security and privacy.');
                }, 1000);
            });
            
            // Insert in drop zone
            const dropZone = document.getElementById('dropZone');
            if (dropZone) {
                dropZone.innerHTML = '';
                dropZone.appendChild(downloadLink);
            }
        } else {
            alert(`Error: ${results.message}`);
        }
    }

    // Search tools
    searchTools(query) {
        if (!query.trim()) return;
        
        const tools = document.querySelectorAll('.tool-card');
        tools.forEach(tool => {
            const title = tool.querySelector('.tool-title').textContent.toLowerCase();
            const desc = tool.querySelector('.tool-desc').textContent.toLowerCase();
            
            if (title.includes(query.toLowerCase()) || desc.includes(query.toLowerCase())) {
                tool.style.display = 'block';
                tool.style.animation = 'highlight 1s ease';
            } else {
                tool.style.display = 'none';
            }
        });
    }

    // Select tool
    selectTool(toolName) {
        const toolMap = {
            'PDF Converter': 'convert',
            'PDF Compressor': 'compress',
            'Color Extractor': 'color',
            'Protect PDF': 'protect',
            'Unlock PDF': 'unlock',
            'Edit PDF': 'edit'
        };

        const toolSelect = document.getElementById('tool-select');
        if (toolSelect && toolMap[toolName]) {
            toolSelect.value = toolMap[toolName];
            this.selectedTool = toolMap[toolName];
            
            // Show tool selection feedback
            const feedback = document.createElement('div');
            feedback.textContent = `Selected: ${toolName}`;
            feedback.style.cssText = `
                position: fixed;
                top: 100px;
                right: 20px;
                background: #1AA260;
                color: white;
                padding: 10px 20px;
                border-radius: 4px;
                z-index: 1000;
                animation: slideIn 0.3s ease;
            `;
            
            document.body.appendChild(feedback);
            
            setTimeout(() => {
                feedback.remove();
            }, 2000);
        }
    }

    // Handle mobile button clicks
    handleMobileButtonClick(e) {
        const type = e.currentTarget.querySelector('span').textContent;
        
        switch(type) {
            case 'Tools':
                this.showMobileToolsModal();
                break;
            case 'Language':
                this.showLanguageModal();
                break;
            case 'Login':
                this.showLoginModal();
                break;
        }
    }

    // Show mobile tools modal
    showMobileToolsModal() {
        const modalContent = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; justify-content: center; align-items: center;">
                <div style="background: white; padding: 20px; border-radius: 8px; width: 90%; max-width: 400px;">
                    <h3 style="margin-bottom: 20px; color: #1AA260;">All PDF Tools</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <button class="mobile-tool-btn" data-tool="convert">
                            <i class="fas fa-exchange-alt" style="color: #FF2323;"></i>
                            <span>Convert</span>
                        </button>
                        <button class="mobile-tool-btn" data-tool="compress">
                            <i class="fas fa-compress-alt" style="color: #1AA260;"></i>
                            <span>Compress</span>
                        </button>
                        <button class="mobile-tool-btn" data-tool="color">
                            <i class="fas fa-palette" style="color: #3944BC;"></i>
                            <span>Colors</span>
                        </button>
                        <button class="mobile-tool-btn" data-tool="protect">
                            <i class="fas fa-lock" style="color: #FFCC33;"></i>
                            <span>Protect</span>
                        </button>
                        <button class="mobile-tool-btn" data-tool="unlock">
                            <i class="fas fa-unlock" style="color: #BA68C8;"></i>
                            <span>Unlock</span>
                        </button>
                        <button class="mobile-tool-btn" data-tool="edit">
                            <i class="fas fa-edit" style="color: #4C8BF5;"></i>
                            <span>Edit</span>
                        </button>
                    </div>
                    <button onclick="this.closest('div[style]').remove()" style="margin-top: 20px; padding: 10px; background: #FF2323; color: white; border: none; border-radius: 4px; width: 100%;">Close</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalContent);
        
        // Add event listeners to tool buttons
        document.querySelectorAll('.mobile-tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.dataset.tool;
                this.selectToolFromMobile(tool);
                e.currentTarget.closest('div[style]').remove();
            });
        });
    }

    // Select tool from mobile modal
    selectToolFromMobile(tool) {
        const toolNames = {
            'convert': 'PDF Converter',
            'compress': 'PDF Compressor',
            'color': 'Color Extractor',
            'protect': 'Protect PDF',
            'unlock': 'Unlock PDF',
            'edit': 'Edit PDF'
        };
        
        this.selectTool(toolNames[tool]);
    }

    // Show language modal
    showLanguageModal() {
        const languages = [
            { code: 'en', name: 'English', flag: '🇺🇸' },
            { code: 'fr', name: 'Français', flag: '🇫🇷' },
            { code: 'es', name: 'Español', flag: '🇪🇸' },
            { code: 'de', name: 'Deutsch', flag: '🇩🇪' }
        ];
        
        const modalContent = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; justify-content: center; align-items: center;">
                <div style="background: white; padding: 20px; border-radius: 8px; width: 90%; max-width: 300px;">
                    <h3 style="margin-bottom: 20px; color: #4C8CF5;">Select Language</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${languages.map(lang => `
                            <button onclick="flipFile.setLanguage('${lang.code}')" style="display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; text-align: left;">
                                <span style="font-size: 20px;">${lang.flag}</span>
                                <span>${lang.name}</span>
                            </button>
                        `).join('')}
                    </div>
                    <button onclick="this.closest('div[style]').remove()" style="margin-top: 20px; padding: 10px; background: #4C8CF5; color: white; border: none; border-radius: 4px; width: 100%;">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalContent);
    }

    // Set language
    setLanguage(langCode) {
        localStorage.setItem('flipfile_language', langCode);
        
        // Update UI
        const langBtn = document.querySelector('.btn-language span');
        if (langBtn) {
            const langText = {
                'en': 'ENG',
                'fr': 'FRA',
                'es': 'SPA',
                'de': 'DEU'
            };
            langBtn.textContent = langText[langCode] || 'ENG';
        }
        
        // Close modal
        document.querySelector('div[style*="position: fixed"]')?.remove();
        
        // Show confirmation
        alert('Language preference saved. Page will refresh to apply changes.');
        setTimeout(() => window.location.reload(), 100);
    }

    // Show login modal
    showLoginModal() {
        const modalContent = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; justify-content: center; align-items: center;">
                <div style="background: white; padding: 30px; border-radius: 8px; width: 90%; max-width: 400px;">
                    <h3 style="margin-bottom: 20px; color: #FFBF00; text-align: center;">Login to FlipFile</h3>
                    <form id="loginForm" style="display: flex; flex-direction: column; gap: 15px;">
                        <input type="email" placeholder="Email" required style="padding: 12px; border: 1px solid #ddd; border-radius: 4px;">
                        <input type="password" placeholder="Password" required style="padding: 12px; border: 1px solid #ddd; border-radius: 4px;">
                        <button type="submit" style="padding: 12px; background: #FFBF00; color: white; border: none; border-radius: 4px; cursor: pointer;">Login</button>
                    </form>
                    <div style="margin-top: 20px; text-align: center;">
                        <p style="color: #666; font-size: 14px;">Don't have an account? <a href="#" style="color: #1AA260;">Sign up</a></p>
                        <p style="color: #666; font-size: 14px; margin-top: 10px;">Free account benefits:</p>
                        <ul style="text-align: left; color: #666; font-size: 13px; margin-top: 10px;">
                            <li>200MB file size limit</li>
                            <li>12 daily tasks</li>
                            <li>Basic OCR</li>
                        </ul>
                    </div>
                    <button onclick="this.closest('div[style]').remove()" style="margin-top: 20px; padding: 10px; background: #FF2323; color: white; border: none; border-radius: 4px; width: 100%;">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalContent);
        
        // Handle form submission
        const form = document.getElementById('loginForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin(form);
            });
        }
    }

    // Handle login
    async handleLogin(form) {
        const email = form.querySelector('input[type="email"]').value;
        const password = form.querySelector('input[type="password"]').value;
        
        // Simulate API call
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
            
            if (response.ok) {
                const userData = await response.json();
                this.currentUser = {
                    ...userData,
                    isLoggedIn: true,
                    lastReset: new Date().toDateString()
                };
                this.saveUserData();
                
                // Update UI
                const loginBtn = document.querySelector('.btn-login span');
                if (loginBtn) {
                    loginBtn.textContent = 'Profile';
                }
                
                // Close modal
                document.querySelector('div[style*="position: fixed"]')?.remove();
                
                // Show welcome message
                alert(`Welcome back, ${userData.name || 'User'}!`);
                
                // Update task counter
                this.updateTaskCounter();
            } else {
                alert('Login failed. Please check your credentials.');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Network error. Please try again.');
        }
    }

    // Handle plan selection
    handlePlanSelection(e) {
        const plan = e.currentTarget.closest('.plan-card').classList.contains('premium') 
            ? 'premium' 
            : 'free';
        
        if (plan === 'premium') {
            // Redirect to payment page
            window.location.href = 'https://buy.stripe.com/test_14k4j92xL0KL0kI3cd';
        } else {
            // Sign up for free account
            this.showLoginModal();
        }
    }

    // Show limit exceeded modal
    showLimitExceededModal() {
        const modalContent = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; justify-content: center; align-items: center;">
                <div style="background: white; padding: 30px; border-radius: 8px; width: 90%; max-width: 400px; text-align: center;">
                    <h3 style="color: #FF2323; margin-bottom: 20px;">Daily Limit Reached</h3>
                    <p style="color: #666; margin-bottom: 20px;">You've reached your daily limit of ${this.currentUser.maxDailyTasks} tasks.</p>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                        <p style="color: #1AA260; font-weight: bold; margin-bottom: 10px;">Get More Tasks:</p>
                        <button onclick="flipFile.shareForTasks()" style="padding: 10px 20px; background: #1AA260; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 10px;">
                            <i class="fas fa-share-alt"></i> Share on Social Media (+5 tasks)
                        </button>
                        <p style="color: #666; font-size: 12px; margin-top: 10px;">OR</p>
                        <button onclick="flipFile.upgradeToPremium()" style="padding: 10px 20px; background: #FFCC33; color: #333; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px;">
                            <i class="fas fa-crown"></i> Upgrade to Premium (Unlimited)
                        </button>
                    </div>
                    <button onclick="this.closest('div[style]').remove()" style="padding: 10px; background: #666; color: white; border: none; border-radius: 4px; width: 100%;">Close</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalContent);
    }

    // Share for extra tasks
    shareForTasks() {
        const shareUrl = window.location.href;
        const shareText = 'Check out FlipFile - Amazing PDF tools for free!';
        
        // Create share modal
        const shareModal = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; justify-content: center; align-items: center;">
                <div style="background: white; padding: 30px; border-radius: 8px; width: 90%; max-width: 400px; text-align: center;">
                    <h3 style="color: #1AA260; margin-bottom: 20px;">Share & Get 5 More Tasks</h3>
                    <p style="color: #666; margin-bottom: 20px;">Share this link on any social media platform and get 5 additional tasks today!</p>
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin-bottom: 20px; word-break: break-all;">
                        ${shareUrl}
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 20px;">
                        <button onclick="flipFile.shareToPlatform('whatsapp', '${shareUrl}', '${shareText}')" style="padding: 10px 15px; background: #25D366; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            <i class="fab fa-whatsapp"></i> WhatsApp
                        </button>
                        <button onclick="flipFile.shareToPlatform('twitter', '${shareUrl}', '${shareText}')" style="padding: 10px 15px; background: #1DA1F2; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            <i class="fab fa-twitter"></i> Twitter
                        </button>
                        <button onclick="flipFile.shareToPlatform('facebook', '${shareUrl}', '${shareText}')" style="padding: 10px 15px; background: #1877F2; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            <i class="fab fa-facebook"></i> Facebook
                        </button>
                    </div>
                    <button onclick="flipFile.claimExtraTasks()" style="padding: 10px; background: #1AA260; color: white; border: none; border-radius: 4px; width: 100%;">
                        I've Shared - Give Me 5 More Tasks!
                    </button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', shareModal);
    }

    // Share to specific platform
    shareToPlatform(platform, url, text) {
        let shareUrl = '';
        
        switch(platform) {
            case 'whatsapp':
                shareUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
                break;
            case 'twitter':
                shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
                break;
            case 'facebook':
                shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
                break;
        }
        
        window.open(shareUrl, '_blank', 'width=600,height=400');
    }

    // Claim extra tasks
    claimExtraTasks() {
        this.currentUser.maxDailyTasks += 5;
        this.saveUserData();
        this.updateTaskCounter();
        
        // Remove modals
        document.querySelectorAll('div[style*="position: fixed"]').forEach(modal => modal.remove());
        
        // Show success message
        alert('Success! You now have 5 additional tasks for today.');
    }

    // Upgrade to premium
    upgradeToPremium() {
        // Redirect to Stripe payment
        window.location.href = 'https://buy.stripe.com/test_14k4j92xL0KL0kI3cd';
    }

    // Setup performance monitoring
    setupPerformanceMonitoring() {
        // Monitor FPS
        let frameCount = 0;
        let lastTime = performance.now();
        
        function checkFPS() {
            frameCount++;
            const currentTime = performance.now();
            
            if (currentTime >= lastTime + 1000) {
                const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
                
                if (fps < 50) {
                    console.warn(`Low FPS detected: ${fps}. Consider optimizing.`);
                }
                
                frameCount = 0;
                lastTime = currentTime;
            }
            
            requestAnimationFrame(checkFPS);
        }
        
        requestAnimationFrame(checkFPS);
        
        // Lazy loading
        const lazyImages = document.querySelectorAll('img[data-src]');
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy-load');
                    imageObserver.unobserve(img);
                }
            });
        });
        
        lazyImages.forEach(img => imageObserver.observe(img));
    }

    // Utility function for delays
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize FlipFile when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.flipFile = new FlipFile();
    
    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes highlight {
            0% { background-color: white; }
            50% { background-color: rgba(26, 162, 96, 0.1); }
            100% { background-color: white; }
        }
        
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        
        .processing {
            animation: pulse 1s infinite;
        }
    `;
    document.head.appendChild(style);
});

// Service Worker for offline functionality
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('ServiceWorker registered:', registration);
        }).catch(error => {
            console.log('ServiceWorker registration failed:', error);
        });
    });
}

// Add CSS for file processing progress
const progressCSS = `
    .progress-container {
        margin: 20px 0;
        padding: 20px;
        background: #f9f9f9;
        border-radius: 8px;
    }
    
    .progress-bar {
        width: 100%;
        height: 20px;
        background: #e0e0e0;
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 10px;
    }
    
    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #1AA260, #4C8BF5);
        transition: width 0.3s ease;
    }
    
    .progress-text {
        text-align: center;
        color: #666;
        font-size: 14px;
    }
    
    .download-ready {
        animation: pulse 2s infinite;
        border: 2px solid #1AA260;
    }
`;

const styleEl = document.createElement('style');
styleEl.textContent = progressCSS;
document.head.appendChild(styleEl);
