// ==UserScript==
// @name         小雅答答答
// @license      MIT
// @version      1.16
// @description  小雅平台学习助手 📖，智能整理归纳学习资料 📚，辅助完成练习 💪，并提供便捷的查阅和修改功能 📝！
// @author       Yi
// @match        https://*.ai-augmented.com/*
// @icon           https://www.ai-augmented.com/static/logo3.1dbbea8f.png
// @grant        none
// @run-at       document-end
// @require      https://unpkg.com/docx@7.7.0/build/index.js
// @require      https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js
// @require      https://update.greasyfork.org/scripts/515732/1477483/av-min.js
// @homepageURL https://zygame1314.site
// ==/UserScript==

(function () {
    'use strict';

    window.AV.init({
        appId: 'cj8zZ6A5m4PGXeo4ZbXMiYjQ-MdYXbMMI',
        appKey: 'lRmp8XNj4rN1zewkdBMVT9pr',
        serverURLs: 'https://api.zygame1314.site'
    });

    let isActivated = false;
    const activationTime = localStorage.getItem('activationTime');
    if (activationTime) {
        const currentTime = Date.now();
        const elapsed = currentTime - parseInt(activationTime, 10);
        if (elapsed < 14400000) {
            isActivated = true;
        } else {
            localStorage.removeItem('isActivated');
            localStorage.removeItem('activationTime');
        }
    }

    const {
        Document,
        Packer,
        Paragraph,
        HeadingLevel,
        AlignmentType,
        ImageRun,
        TextRun
    } = window.docx;

    let autoFetchEnabled = localStorage.getItem('autoFetchEnabled') === 'true';
    let autoFillEnabled = localStorage.getItem('autoFillEnabled') === 'true';

    function addButtons() {
        let panelContainer = document.createElement('div');
        panelContainer.style.position = 'fixed';
        panelContainer.style.top = '50px';
        panelContainer.style.left = '20px';
        panelContainer.style.zIndex = '9999';
        panelContainer.style.width = '240px';
        panelContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        panelContainer.style.backdropFilter = 'blur(10px)';
        panelContainer.style.border = '1px solid rgba(230, 230, 230, 0.7)';
        panelContainer.style.borderRadius = '16px';
        panelContainer.style.boxShadow = '0 4px 24px rgba(0, 0, 0, 0.1)';
        panelContainer.style.fontFamily = '"Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        panelContainer.style.overflow = 'hidden';
        panelContainer.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

        let panelHeader = document.createElement('div');
        panelHeader.style.background = 'linear-gradient(135deg, #6366F1, #4F46E5)';
        panelHeader.style.padding = '15px 20px';
        panelHeader.style.cursor = 'move';
        panelHeader.style.color = '#fff';
        panelHeader.style.fontSize = '16px';
        panelHeader.style.fontWeight = 'bold';
        panelHeader.style.display = 'flex';
        panelHeader.style.alignItems = 'center';
        panelHeader.style.justifyContent = 'space-between';
        panelHeader.innerHTML = '答题助手 <span style="font-size: 18px;">⚡</span>';

        let panelContent = document.createElement('div');
        panelContent.style.padding = '15px';
        panelContent.style.display = 'none';
        panelContent.style.transition = 'all 0.3s ease';

        function styleButton(btn, bgColor, hoverColor) {
            Object.assign(btn.style, {
                width: '100%',
                marginBottom: '10px',
                padding: '10px 15px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: bgColor,
                color: '#fff',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
            });

            btn.onmouseover = () => {
                btn.style.backgroundColor = hoverColor;
                btn.style.transform = 'translateY(-1px)';
            };
            btn.onmouseout = () => {
                btn.style.backgroundColor = bgColor;
                btn.style.transform = 'translateY(0)';
            };
        }

        let getAnswerBtn = document.createElement('button');
        getAnswerBtn.innerHTML = '🕷️ 获取答案/激活脚本';
        styleButton(getAnswerBtn, '#EF4444', '#DC2626');
        getAnswerBtn.onclick = function () {
            if (isActivated) {
                getAndStoreAnswers();
            } else {
                promptActivationCode();
            }
        };

        let fillAnswerBtn = document.createElement('button');
        fillAnswerBtn.innerHTML = '✨ 填写答案';
        styleButton(fillAnswerBtn, '#3B82F6', '#2563EB');
        fillAnswerBtn.onclick = fillAnswers;

        let editAnswerBtn = document.createElement('button');
        editAnswerBtn.innerHTML = '📝 查看/编辑答案';
        styleButton(editAnswerBtn, '#FF9800', '#FB8C00');
        editAnswerBtn.onclick = showAnswerEditor;

        let exportHomeworkBtn = document.createElement('button');
        exportHomeworkBtn.innerHTML = '📄 导出作业';
        styleButton(exportHomeworkBtn, '#8B5CF6', '#7C3AED');
        exportHomeworkBtn.onclick = exportHomework;

        let guideBtn = document.createElement('button');
        guideBtn.innerHTML = '📖 使用指南';
        styleButton(guideBtn, '#6366F1', '#4F46E5');
        guideBtn.onclick = showTutorial;

        let autoFetchBtn = document.createElement('button');
        autoFetchBtn.innerHTML = `${autoFetchEnabled ? '🔄' : '⭕'} 自动获取`;
        styleButton(autoFetchBtn, autoFetchEnabled ? '#22c55e' : '#94a3b8',
            autoFetchEnabled ? '#16a34a' : '#64748b');

        autoFetchBtn.onclick = function () {
            autoFetchEnabled = !autoFetchEnabled;
            localStorage.setItem('autoFetchEnabled', autoFetchEnabled);
            autoFetchBtn.innerHTML = `${autoFetchEnabled ? '🔄' : '⭕'} 自动获取`;
            styleButton(autoFetchBtn, autoFetchEnabled ? '#22c55e' : '#94a3b8',
                autoFetchEnabled ? '#16a34a' : '#64748b');

            showNotification(
                `已${autoFetchEnabled ? '开启' : '关闭'}自动获取功能`,
                {
                    type: autoFetchEnabled ? 'success' : 'info',
                    keywords: ['自动获取', autoFetchEnabled ? '开启' : '关闭']
                }
            );
        };

        let autoFillBtn = document.createElement('button');
        autoFillBtn.innerHTML = `${autoFillEnabled ? '🔄' : '⭕'} 自动填写`;
        styleButton(autoFillBtn, autoFillEnabled ? '#22c55e' : '#94a3b8',
            autoFillEnabled ? '#16a34a' : '#64748b');

        autoFillBtn.onclick = function () {
            autoFillEnabled = !autoFillEnabled;
            localStorage.setItem('autoFillEnabled', autoFillEnabled);
            autoFillBtn.innerHTML = `${autoFillEnabled ? '🔄' : '⭕'} 自动填写`;
            styleButton(autoFillBtn, autoFillEnabled ? '#22c55e' : '#94a3b8',
                autoFillEnabled ? '#16a34a' : '#64748b');

            showNotification(
                `已${autoFillEnabled ? '开启' : '关闭'}自动填写功能`,
                {
                    type: autoFillEnabled ? 'success' : 'info',
                    keywords: ['自动填写', autoFillEnabled ? '开启' : '关闭']
                }
            );
        };

        panelContent.appendChild(autoFetchBtn);
        panelContent.appendChild(autoFillBtn);
        panelContent.appendChild(getAnswerBtn);
        panelContent.appendChild(fillAnswerBtn);
        panelContent.appendChild(editAnswerBtn);
        panelContent.appendChild(exportHomeworkBtn);
        panelContent.appendChild(guideBtn);

        let isDraggingPanel = false;

        panelHeader.addEventListener('click', function (e) {
            if (isDraggingPanel) {
                e.stopPropagation();
                return;
            }
            if (panelContent.style.display === 'none') {
                panelContent.style.display = 'block';
                panelContent.style.opacity = '0';
                panelContent.style.transform = 'translateY(-10px)';
                setTimeout(() => {
                    panelContent.style.opacity = '1';
                    panelContent.style.transform = 'translateY(0)';
                }, 10);
            } else {
                panelContent.style.opacity = '0';
                panelContent.style.transform = 'translateY(-10px)';
                setTimeout(() => {
                    panelContent.style.display = 'none';
                }, 300);
            }
        });

        panelContainer.appendChild(panelHeader);
        panelContainer.appendChild(panelContent);
        document.body.appendChild(panelContainer);

        makePanelDraggable(panelContainer, panelHeader);

        function makePanelDraggable(panel, handle) {
            let isDragging = false;
            let startX = 0;
            let startY = 0;
            let offsetX = 0;
            let offsetY = 0;

            handle.addEventListener('mousedown', function (e) {
                isDragging = false;
                isDraggingPanel = false;
                startX = e.clientX;
                startY = e.clientY;
                offsetX = e.clientX - panel.offsetLeft;
                offsetY = e.clientY - panel.offsetTop;

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);

                e.preventDefault();
            });

            function onMouseMove(e) {
                let dx = e.clientX - startX;
                let dy = e.clientY - startY;

                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                    isDragging = true;
                    isDraggingPanel = true;
                }

                if (isDragging) {
                    panel.style.left = (e.clientX - offsetX) + 'px';
                    panel.style.top = (e.clientY - offsetY) + 'px';
                }
            }

            function onMouseUp(e) {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                if (isDragging) {
                    setTimeout(() => {
                        isDraggingPanel = false;
                    }, 50);
                }
            }
        }
    }

    addButtons();

    function getNotificationContainer() {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.style.position = 'fixed';
            container.style.top = '20px';
            container.style.left = '50%';
            container.style.transform = 'translateX(-50%)';
            container.style.zIndex = '10000';
            container.style.width = '400px';
            container.style.maxHeight = 'calc(100vh - 40px)';
            container.style.overflowY = 'auto';
            container.style.pointerEvents = 'none';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'center';
            document.body.appendChild(container);
        }
        return container;
    }

    function showNotification(message, options = {}) {
        const {
            type = 'info',
            duration = 3000,
            keywords = [],
        } = options;

        const highlightColors = {
            success: '#ffba08',
            error: '#14b8a6',
            warning: '#8b5cf6',
            info: '#f472b6'
        };

        const highlightColor = highlightColors[type] || highlightColors.info;

        const highlightStyle = `
            color: ${highlightColor};
            font-weight: bold;
            border-bottom: 2px solid ${highlightColor}50;
            transition: all 0.3s ease;
            border-radius: 3px;
        `;

        const highlightedMessage = keywords.reduce((msg, keyword) => {
            if (keyword && keyword.trim()) {
                const regex = new RegExp(keyword.trim(), 'g');
                return msg.replace(regex, `<span style="${highlightStyle}"
                onmouseover="this.style.backgroundColor='${highlightColor}15'; this.style.borderBottomColor='${highlightColor}'"
                onmouseout="this.style.backgroundColor='transparent'; this.style.borderBottomColor='${highlightColor}50'"
            >${keyword}</span>`);
            }
            return msg;
        }, message);

        const notification = document.createElement('div');
        notification.style.position = 'relative';
        notification.style.marginBottom = '10px';
        notification.style.padding = '15px 20px';
        notification.style.borderRadius = '12px';
        notification.style.color = '#333';
        notification.style.fontSize = '16px';
        notification.style.fontWeight = 'bold';
        notification.style.boxShadow = '0 8px 16px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.06)';
        notification.style.pointerEvents = 'auto';
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        notification.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        notification.style.display = 'flex';
        notification.style.alignItems = 'center';
        notification.style.backdropFilter = 'blur(8px)';

        const typeStyles = {
            success: {
                background: 'linear-gradient(145deg, rgba(104, 214, 156, 0.95), rgba(89, 186, 134, 0.95))',
                icon: '🎉'
            },
            error: {
                background: 'linear-gradient(145deg, rgba(248, 113, 113, 0.95), rgba(220, 38, 38, 0.95))',
                icon: '❌'
            },
            warning: {
                background: 'linear-gradient(145deg, rgba(251, 191, 36, 0.95), rgba(245, 158, 11, 0.95))',
                icon: '⚠️'
            },
            info: {
                background: 'linear-gradient(145deg, rgba(96, 165, 250, 0.95), rgba(59, 130, 246, 0.95))',
                icon: 'ℹ️'
            }
        };

        const currentType = typeStyles[type] || typeStyles.info;
        notification.style.background = currentType.background;
        notification.style.color = type === 'info' || type === 'success' ? '#fff' : '#000';

        const progressBar = document.createElement('div');
        progressBar.style.position = 'absolute';
        progressBar.style.bottom = '0';
        progressBar.style.left = '0';
        progressBar.style.height = '4px';
        progressBar.style.width = '100%';
        progressBar.style.background = 'rgba(255, 255, 255, 0.3)';
        progressBar.style.borderRadius = '0 0 12px 12px';
        progressBar.style.transition = `width ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;

        const icon = document.createElement('span');
        icon.style.marginRight = '12px';
        icon.style.fontSize = '20px';
        icon.textContent = currentType.icon;
        icon.style.filter = 'saturate(1.2)';

        const messageContainer = document.createElement('div');
        messageContainer.innerHTML = highlightedMessage;
        messageContainer.style.flex = '1';
        messageContainer.style.fontWeight = 'bold';

        const closeBtn = document.createElement('span');
        closeBtn.textContent = '×';
        closeBtn.style.marginLeft = '12px';
        closeBtn.style.fontSize = '24px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.opacity = '0.8';
        closeBtn.style.transition = 'opacity 0.2s';
        closeBtn.addEventListener('mouseover', () => {
            closeBtn.style.opacity = '1';
        });
        closeBtn.addEventListener('mouseout', () => {
            closeBtn.style.opacity = '0.8';
        });

        notification.addEventListener('mouseenter', () => {
            notification.style.transform = 'translateY(0) scale(1.02)';
            progressBar.style.transition = 'none';
        });

        notification.addEventListener('mouseleave', () => {
            notification.style.transform = 'translateY(0) scale(1)';
            progressBar.style.transition = `width ${duration}ms linear`;
        });

        notification.appendChild(icon);
        notification.appendChild(messageContainer);
        notification.appendChild(closeBtn);
        notification.appendChild(progressBar);

        const container = getNotificationContainer();

        container.appendChild(notification);

        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
            requestAnimationFrame(() => {
                progressBar.style.width = '0';
            });
        });

        function hideNotification(notification) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                container.removeChild(notification);
                if (container.children.length === 0) {
                    document.body.removeChild(container);
                }
            }, 300);
        }

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideNotification(notification);
        });

        notification.addEventListener('click', () => {
            hideNotification(notification);
        });

        if (duration > 0) {
            setTimeout(() => {
                if (container.contains(notification)) {
                    hideNotification(notification);
                }
            }, duration);
        }
    }

    function promptActivationCode() {
        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
        modalOverlay.style.zIndex = '9999';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.opacity = '0';
        modalOverlay.style.transition = 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        modalOverlay.style.backdropFilter = 'blur(8px)';

        const modalContainer = document.createElement('div');
        modalContainer.style.backgroundColor = '#ffffff';
        modalContainer.style.padding = '40px';
        modalContainer.style.borderRadius = '20px';
        modalContainer.style.boxShadow = '0 20px 50px rgba(0,0,0,0.15), 0 0 20px rgba(0,0,0,0.1)';
        modalContainer.style.width = '420px';
        modalContainer.style.maxWidth = '90%';
        modalContainer.style.textAlign = 'center';
        modalContainer.style.position = 'relative';
        modalContainer.style.transform = 'scale(0.8) translateY(20px)';
        modalContainer.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        modalContainer.style.border = '1px solid rgba(255, 255, 255, 0.1)';

        const modalHeader = document.createElement('div');
        modalHeader.style.marginBottom = '30px';
        modalHeader.style.position = 'relative';

        const icon = document.createElement('div');
        icon.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
        </svg>`;
        icon.style.marginBottom = '15px';
        icon.style.color = '#4CAF50';

        const closeButton = document.createElement('button');
        closeButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>`;
        closeButton.style.position = 'absolute';
        closeButton.style.top = '16px';
        closeButton.style.right = '16px';
        closeButton.style.padding = '8px';
        closeButton.style.border = 'none';
        closeButton.style.background = 'transparent';
        closeButton.style.cursor = 'pointer';
        closeButton.style.color = '#9e9e9e';
        closeButton.style.transition = 'all 0.2s ease';
        closeButton.style.display = 'flex';
        closeButton.style.alignItems = 'center';
        closeButton.style.justifyContent = 'center';
        closeButton.style.width = '32px';
        closeButton.style.height = '32px';
        closeButton.style.borderRadius = '8px';

        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.background = '#f5f5f5';
            closeButton.style.color = '#666';
            closeButton.style.transform = 'rotate(90deg)';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.background = 'transparent';
            closeButton.style.color = '#9e9e9e';
            closeButton.style.transform = 'rotate(0deg)';
        });

        closeButton.addEventListener('mousedown', () => {
            closeButton.style.transform = 'rotate(90deg) scale(0.9)';
        });

        closeButton.addEventListener('mouseup', () => {
            closeButton.style.transform = 'rotate(90deg) scale(1)';
        });

        const title = document.createElement('h2');
        title.textContent = '输入激活码';
        title.style.fontSize = '24px';
        title.style.fontWeight = '600';
        title.style.color = '#333';
        title.style.margin = '0 0 8px 0';

        const subtitle = document.createElement('p');
        subtitle.textContent = '请输入激活码以继续使用完整功能';
        subtitle.style.color = '#666';
        subtitle.style.fontSize = '14px';
        subtitle.style.margin = '0';

        const infoMessage = document.createElement('p');
        infoMessage.innerHTML = '激活码免费获取，主要用于防滥用，请移步<a href="https://zygame1314.site" target="_blank" style="color: #4CAF50; text-decoration: none;">我的主页</a>';
        infoMessage.style.color = '#666';
        infoMessage.style.fontSize = '14px';
        infoMessage.style.margin = '10px 0 0 0';

        const inputContainer = document.createElement('div');
        inputContainer.style.position = 'relative';
        inputContainer.style.marginTop = '25px';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '请输入激活码';
        input.style.width = '100%';
        input.style.padding = '15px 20px';
        input.style.border = '2px solid #e0e0e0';
        input.style.borderRadius = '12px';
        input.style.fontSize = '16px';
        input.style.backgroundColor = '#f8f9fa';
        input.style.transition = 'all 0.3s ease';
        input.style.boxSizing = 'border-box';
        input.style.outline = 'none';

        input.addEventListener('focus', () => {
            input.style.border = '2px solid #4CAF50';
            input.style.backgroundColor = '#ffffff';
            input.style.boxShadow = '0 0 0 4px rgba(76, 175, 80, 0.1)';
        });

        input.addEventListener('blur', () => {
            input.style.border = '2px solid #e0e0e0';
            input.style.backgroundColor = '#f8f9fa';
            input.style.boxShadow = 'none';
        });

        const confirmButton = document.createElement('button');
        confirmButton.textContent = '激活';
        confirmButton.style.width = '100%';
        confirmButton.style.padding = '15px';
        confirmButton.style.marginTop = '20px';
        confirmButton.style.border = 'none';
        confirmButton.style.borderRadius = '12px';
        confirmButton.style.backgroundColor = '#4CAF50';
        confirmButton.style.color = '#fff';
        confirmButton.style.fontSize = '16px';
        confirmButton.style.fontWeight = '600';
        confirmButton.style.cursor = 'pointer';
        confirmButton.style.transition = 'all 0.3s ease';
        confirmButton.style.transform = 'translateY(0)';
        confirmButton.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.2)';

        let isLoading = false;
        const setLoadingState = (loading) => {
            isLoading = loading;
            if (loading) {
                confirmButton.innerHTML = '<span class="loading"></span>验证中...';
                confirmButton.style.backgroundColor = '#45a049';
                confirmButton.disabled = true;
            } else {
                confirmButton.textContent = '激活';
                confirmButton.style.backgroundColor = '#4CAF50';
                confirmButton.disabled = false;
            }
        };

        const style = document.createElement('style');
        style.textContent = `
            .loading {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid rgba(255,255,255,.3);
                border-radius: 50%;
                border-top-color: #fff;
                animation: spin 1s ease-in-out infinite;
                margin-right: 8px;
                vertical-align: middle;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);

        modalHeader.appendChild(icon);
        modalHeader.appendChild(title);
        modalHeader.appendChild(subtitle);
        modalHeader.appendChild(infoMessage);
        modalContainer.appendChild(modalHeader);
        modalContainer.appendChild(closeButton);
        inputContainer.appendChild(input);
        modalContainer.appendChild(inputContainer);
        modalContainer.appendChild(confirmButton);
        modalOverlay.appendChild(modalContainer);
        document.body.appendChild(modalOverlay);

        requestAnimationFrame(() => {
            modalOverlay.style.opacity = '1';
            modalContainer.style.transform = 'scale(1) translateY(0)';
        });

        function closeModal() {
            modalOverlay.style.opacity = '0';
            modalContainer.style.transform = 'scale(0.8) translateY(20px)';
            setTimeout(() => {
                document.body.removeChild(modalOverlay);
                document.head.removeChild(style);
            }, 400);
        }

        closeButton.addEventListener('click', () => {
            closeModal();
            showNotification('请输入激活码。', { type: 'warning', keywords: ['激活码'] });
        });

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
                showNotification('请输入激活码。', { type: 'warning', keywords: ['激活码'] });
            }
        });

        confirmButton.addEventListener('click', () => {
            const userCode = input.value.trim();
            if (userCode) {
                setLoadingState(true);
                window.AV.Cloud.run('verifyActivationCode', { activationCode: userCode })
                    .then((result) => {
                        isActivated = true;
                        localStorage.setItem('isActivated', 'true');
                        localStorage.setItem('activationTime', Date.now().toString());
                        showNotification('激活成功！', { type: 'success', keywords: ['激活', '成功'] });
                        closeModal();
                        getAndStoreAnswers();
                    })
                    .catch((error) => {
                        console.error('Activation failed:', error);
                        setLoadingState(false);
                        input.style.border = '2px solid #ff4444';
                        input.style.backgroundColor = '#fff8f8';
                        showNotification('激活码不正确或已过期，请重试。', { type: 'error', keywords: ['激活码', '不正确', '过期'] });
                        input.focus();
                    });
            } else {
                input.style.border = '2px solid #ff4444';
                input.style.backgroundColor = '#fff8f8';
                showNotification('请输入激活码。', { type: 'warning', keywords: ['激活码'] });
                input.focus();
            }
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !isLoading) {
                confirmButton.click();
            }
        });
    }

    async function createRecord(paperId, groupId, token) {
        try {
            const response = await fetch(`${window.location.origin}/api/jx-iresource/survey/createRecord`, {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'authorization': `Bearer ${token}`,
                    'content-type': 'application/json; charset=UTF-8'
                },
                body: JSON.stringify({
                    paper_id: paperId,
                    group_id: groupId
                }),
                credentials: 'include'
            });
            const data = await response.json();
            if (!data.success) {
                console.warn('创建记录失败,可能是作业已提交或截止:', data.message);
                return null;
            }
            return data.data.id;
        } catch (error) {
            console.warn('创建记录请求失败:', error);
            return null;
        }
    }

    async function getAndStoreAnswers() {
        const taskElement = document.querySelector('#xy_app_content > div.ta-frame > div.ta_panel.ta_panel_group.ta_group > section > section > main > div > div.group-resource-header.flex_panel.hor > div.flex_align_center > div.entry_task_btn');
        if (!taskElement) {
            showNotification('请确保在作业页面操作！', { type: 'warning', keywords: ['作业页面'] });
            return;
        }

        const token = getToken();
        if (!token) {
            showNotification('无法获取token，请确保已登录。', { type: 'error', keywords: ['token', '登录'] });
            return;
        }

        let currentUrl = window.location.href;
        let node_id = getNodeIDFromUrl(currentUrl);
        let group_id = getGroupIDFromUrl(currentUrl);

        if (!node_id || !group_id) {
            showNotification('无法获取必要参数，请确保在正确的页面。', { type: 'error', keywords: ['参数'] });
            return;
        }

        try {
            let requestUrl = `${window.location.origin}/api/jx-iresource/resource/queryResource?node_id=${node_id}`;
            const resourceResponse = await fetch(requestUrl, {
                headers: {
                    'authorization': `Bearer ${token}`,
                    'content-type': 'application/json; charset=utf-8'
                },
                credentials: 'include'
            });

            const resourceData = await resourceResponse.json();
            if (!resourceData.success) {
                throw new Error('获取试卷资源失败');
            }

            const paperId = resourceData.data.resource.id;

            const recordId = await createRecord(paperId, group_id, token);
            if (!recordId) {
                console.log('无法创建答题记录,尝试直接获取答案...');
            }

            const taskFlowResponse = await fetch(
                `${window.location.origin}/api/jx-iresource/survey/course/task/flow?node_id=${node_id}&group_id=${group_id}`,
                {
                    headers: {
                        'accept': '*/*',
                        'authorization': `Bearer ${token}`,
                        'content-type': 'application/json; charset=utf-8'
                    },
                    credentials: 'include'
                }
            );

            const taskFlowData = await taskFlowResponse.json();
            if (!taskFlowData.success) {
                throw new Error('获取task flow数据失败');
            }

            localStorage.setItem('recordId', recordId || '');
            localStorage.setItem('groupId', group_id);
            localStorage.setItem('paperId', paperId);
            localStorage.setItem('assignmentTitle', resourceData.data.resource.title || '作业答案');
            localStorage.setItem('answerData', JSON.stringify(resourceData.data.resource.questions));

            showNotification('答案数据获取成功！', { type: 'success', keywords: ['答案', '获取'] });
            return true;

        } catch (error) {
            console.error('获取数据失败:', error);
            showNotification('获取数据失败，请查看控制台。', { type: 'error', keywords: ['获取', '失败'] });
            return false;
        }
    }

    async function fillAnswers() {
        const answerData = JSON.parse(localStorage.getItem('answerData'));
        const recordId = localStorage.getItem('recordId');
        const groupId = localStorage.getItem('groupId');
        const paperId = localStorage.getItem('paperId');

        if (!answerData || !recordId || !groupId || !paperId) {
            showNotification('缺少必要数据，请先获取答案。', { type: 'error', keywords: ['数据', '获取'] });
            return;
        }

        const token = getToken();
        if (!token) {
            showNotification('无法获取token。', { type: 'error', keywords: ['token'] });
            return;
        }

        try {
            for (const question of answerData) {
                await submitAnswer(question, recordId, groupId, paperId, token);
            }

            showNotification('答案填写完成！页面将于1s后刷新。', { type: 'success', keywords: ['答案', '填写', '刷新'] });
            setTimeout(() => {
                location.reload();
            }, 1000);
        } catch (error) {
            console.error('填写答案失败:', error);
            showNotification('填写答案失败，请查看控制台。', { type: 'error', keywords: ['填写', '失败'] });
        }
    }

    async function submitAnswer(question, recordId, groupId, paperId, token) {
        let answer;
        let extAnswer = '';

        switch (question.type) {
            case 1:
                answer = [question.answer_items.find(item => item.answer_checked === 2)?.id];
                break;
            case 2:
                answer = question.answer_items.filter(item => item.answer_checked === 2).map(item => item.id);
                break;
            case 4:
                let fillObject = {};
                question.answer_items.forEach(item => {
                    fillObject[item.id] = item.answer;
                });
                answer = [fillObject];
                break;
            case 5:
                answer = [question.answer_items.find(item => item.answer_checked === 2)?.id];
                break;
            case 6:
                answer = [question.answer_items[0].answer];
                break;
            case 9:
                if (question.subQuestions && question.subQuestions.length > 0) {
                    for (const subQuestion of question.subQuestions) {
                        await submitAnswer(subQuestion, recordId, groupId, paperId, token);
                    }
                }
                return;
            case 12:
                answer = question.answer_items
                    .sort((a, b) => parseInt(a.answer) - parseInt(b.answer))
                    .map(item => item.id);
                break;
            case 13:
                let matchObject = {};
                question.answer_items
                    .filter(item => !item.is_target_opt && item.answer)
                    .forEach(item => {
                        matchObject[item.id] = item.answer;
                    });
                if (Object.keys(matchObject).length > 0) {
                    answer = [matchObject];
                } else {
                    return;
                }
                break;
            default:
                return;
        }

        const requestBody = {
            record_id: recordId,
            question_id: question.id,
            answer: answer,
            ext_answer: extAnswer,
            group_id: groupId,
            paper_id: paperId,
            is_try: 0
        };

        await fetch(`${window.location.origin}/api/jx-iresource/survey/answer`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(requestBody),
            credentials: 'include'
        });
    }

    function getToken() {
        const cookies = document.cookie.split('; ');
        for (let cookie of cookies) {
            const [name, value] = cookie.split('=');
            if (name.includes('prd-access-token')) {
                return value;
            }
        }
        return null;
    }

    function parseRichText(content) {
        try {
            let jsonContent = JSON.parse(content);
            let text = '';
            jsonContent.blocks.forEach((block) => {
                text += block.text + '\n';
            });
            return text.trim();
        } catch (e) {
            return content;
        }
    }

    function parseRichTextForDisplay(content) {
        try {
            let jsonContent = JSON.parse(content);
            let result = '';
            jsonContent.blocks.forEach((block) => {
                if (block.type === 'atomic' && block.data && block.data.type === 'IMAGE') {
                    let imageSrc = block.data.src;

                    let fileIdMatch = imageSrc.match(/\/cloud\/file_access\/(\d+)/);
                    if (fileIdMatch && fileIdMatch[1]) {
                        let fileId = fileIdMatch[1];
                        let randomParam = Date.now();

                        let imageUrl = `${window.location.origin}/api/jx-oresource/cloud/file_access/${fileId}?random=${randomParam}`;

                        result += `<img src="${imageUrl}" alt="图片" style="max-width: 100%; height: auto;" />`;
                    } else {
                        result += '[无法解析图片链接]<br>';
                    }
                } else {
                    result += block.text.replace(/\n/g, '<br>');
                }
            });
            return result;
        } catch (e) {
            return content;
        }
    }

    function getNodeIDFromUrl(url) {
        let nodeId = null;
        let urlObj = new URL(url);
        let pathParts = urlObj.pathname.split('/').filter(part => part);

        nodeId = pathParts[pathParts.length - 1];
        return nodeId;
    }

    function getGroupIDFromUrl(url) {
        const match = url.match(/mycourse\/(\d+)/);
        return match ? match[1] : null;
    }

    function addKeyboardShortcuts() {
        document.addEventListener('keydown', function (e) {
            if (e.ctrlKey && e.shiftKey && !e.altKey) {
                switch (e.key.toLowerCase()) {
                    case 'a':
                        e.preventDefault();
                        getAndStoreAnswers();
                        break;
                    case 'f':
                        e.preventDefault();
                        fillAnswers();
                        break;
                    case 'e':
                        e.preventDefault();
                        showAnswerEditor();
                        break;
                    case 'q':
                        e.preventDefault();
                        exportHomework();
                        break;
                    default:
                        break;
                }
            }
        });
    }

    addKeyboardShortcuts();

    function showTutorial() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes modalFadeIn {
                from { opacity: 0; transform: scale(0.8); }
                to { opacity: 1; transform: scale(1); }
            }

            @keyframes floatAnimation {
                0% { transform: translateY(0px); }
                50% { transform: translateY(-10px); }
                100% { transform: translateY(0px); }
            }

            .highlight-text {
                background: linear-gradient(120deg, rgba(255,223,186,0.6) 0%, rgba(255,223,186,0) 100%);
                padding: 0 4px;
            }

            .feature-icon {
                display: inline-block;
                width: 24px;
                height: 24px;
                margin-right: 8px;
                vertical-align: middle;
                animation: floatAnimation 3s ease-in-out infinite;
            }
        `;
        document.head.appendChild(style);

        let modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
        modalOverlay.style.zIndex = '10000';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.opacity = '0';
        modalOverlay.style.backdropFilter = 'blur(5px)';
        modalOverlay.style.transition = 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

        let modalContent = document.createElement('div');
        modalContent.style.backgroundColor = '#fff';
        modalContent.style.borderRadius = '16px';
        modalContent.style.width = '90%';
        modalContent.style.maxWidth = '680px';
        modalContent.style.maxHeight = '85vh';
        modalContent.style.overflowY = 'auto';
        modalContent.style.padding = '32px';
        modalContent.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.2)';
        modalContent.style.position = 'relative';
        modalContent.style.transform = 'scale(0.8)';
        modalContent.style.opacity = '0';
        modalContent.style.animation = 'modalFadeIn 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards';
        modalContent.style.background = 'linear-gradient(135deg, #fff 0%, #f8f9fa 100%)';

        let closeButton = document.createElement('button');
        closeButton.innerHTML = '×';
        closeButton.style.position = 'absolute';
        closeButton.style.top = '20px';
        closeButton.style.right = '20px';
        closeButton.style.fontSize = '28px';
        closeButton.style.border = 'none';
        closeButton.style.background = 'none';
        closeButton.style.cursor = 'pointer';
        closeButton.style.color = '#666';
        closeButton.style.width = '40px';
        closeButton.style.height = '40px';
        closeButton.style.borderRadius = '50%';
        closeButton.style.transition = 'all 0.3s ease';

        closeButton.onmouseover = () => {
            closeButton.style.backgroundColor = '#f0f0f0';
            closeButton.style.transform = 'rotate(90deg)';
        };
        closeButton.onmouseout = () => {
            closeButton.style.backgroundColor = 'transparent';
            closeButton.style.transform = 'rotate(0deg)';
        };

        closeButton.onclick = () => {
            modalContent.style.transform = 'scale(0.8)';
            modalContent.style.opacity = '0';
            modalOverlay.style.opacity = '0';
            setTimeout(() => document.body.removeChild(modalOverlay), 400);
        };

        let tutorialContent = document.createElement('div');
        tutorialContent.innerHTML = `
            <h2 style="margin: 0 0 24px 0; color: #1a1a1a; font-weight: 700; font-size: 28px;
                    background: linear-gradient(120deg, #2b5876 0%, #4e4376 100%);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                ✨ 使用指南
            </h2>

            <p style="color: #444; line-height: 1.8; font-size: 16px;">
                欢迎使用 <span class="highlight-text" style="font-weight: 600;">小雅答答答</span> 答题助手！
                这里有一些可能帮得上你的信息～
            </p>

            <div style="margin: 32px 0; padding: 20px; background: #f8f9fa; border-radius: 12px; border-left: 4px solid #4e4376;">
                <h3 style="margin: 0 0 16px 0; color: #2b5876; display: flex; align-items: center;">
                    <span class="feature-icon">🎯</span> 核心功能
                </h3>
                <ol style="padding-left: 24px; color: #444; line-height: 1.8; margin: 0;">
                    <li><strong>获取答案</strong> - 答案在手，底气满满</li>
                    <li><strong>填写答案</strong> - 智能填写，快速完成</li>
                    <li><strong>编辑答案</strong> - 调整内容，应对自如</li>
                    <li><strong>导出作业</strong> - 一键导出，便捷保存</li>
                    <li><strong>使用指南</strong> - 随时查看，贴心帮助</li>
                </ol>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin: 32px 0;">
                <div style="padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
                    <h3 style="margin: 0 0 16px 0; color: #2b5876; display: flex; align-items: center;">
                        <span class="feature-icon">📝</span> 支持题型
                    </h3>
                    <ul style="padding-left: 20px; color: #444; line-height: 1.8; margin: 0;">
                        <li>单选题</li>
                        <li>多选题</li>
                        <li>填空题</li>
                        <li>判断题</li>
                        <li>简答题</li>
                        <li>数组题</li>
                        <li>排序题</li>
                        <li>匹配题</li>
                        <li>剩余题型部分支持</li>
                    </ul>
                </div>

                <div style="padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
                    <h3 style="margin: 0 0 16px 0; color: #2b5876; display: flex; align-items: center;">
                        <span class="feature-icon">⌨️</span> 快捷键
                    </h3>
                    <ul style="padding-left: 20px; color: #444; line-height: 1.8; margin: 0;">
                        <li><strong>Ctrl + Shift + A</strong>: 获取答案</li>
                        <li><strong>Ctrl + Shift + F</strong>: 填写答案</li>
                        <li><strong>Ctrl + Shift + E</strong>: 编辑答案</li>
                        <li><strong>Ctrl + Shift + Q</strong>: 导出作业</li>
                    </ul>
                </div>
            </div>

            <div style="margin: 32px 0; padding: 24px; background: #f8f9fa; border-radius: 12px;">
                <h3 style="margin: 0 0 16px 0; color: #2b5876; display: flex; align-items: center;">
                    <span class="feature-icon">💡</span> 使用提示
                </h3>
                <ul style="padding-left: 20px; color: #444; line-height: 1.8; margin: 0;">
                    <li style="border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; margin-bottom: 8px;">
                        请确保已登录并有权限获取题目答案
                    </li>
                    <li style="border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; margin-bottom: 8px;">
                        必须定位至作业资源才能获取到答案
                    </li>
                    <li style="border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; margin-bottom: 8px;">
                        获取答案后需进入答题页面再点击填写
                    </li>
                    <li style="border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; margin-bottom: 8px;">
                        部分题型可能需要手动检查
                    </li>
                    <li style="border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; margin-bottom: 8px;">
                        清空答案会刷新页面，请注意保存信息
                    </li>
                    <li>
                        若需将导出的作业导入其他题库软件，请先手动打开并随意编辑保存一次，以确保图片等内容能被正确识别
                    </li>
                </ul>
            </div>

            <div style="margin-top: 32px; padding: 24px; background: #fff; border-radius: 12px; border: 1px dashed #4e4376;">
                <h3 style="margin: 0 0 16px 0; color: #2b5876; display: flex; align-items: center;">
                    <span class="feature-icon">🤝</span> 需要帮助？
                </h3>
                <p style="color: #444; line-height: 1.8; margin: 0;">
                    发送邮件至 <a href="mailto:zygame1314@gmail.com"
                            style="color: #4e4376; text-decoration: none; border-bottom: 1px dashed #4e4376;">
                        zygame1314@gmail.com
                    </a>
                    或访问
                    <a href="https://zygame1314.site" target="_blank"
                    style="color: #4e4376; text-decoration: none; border-bottom: 1px dashed #4e4376;">
                        我的个人主页
                    </a>
                </p>
            </div>

            <p style="margin: 32px 0 0 0; text-align: center; color: #666;">别太依赖脚本哦，多动脑才是真本事！😉</p>
            <p style="color: #999; font-size: 14px; text-align: center; margin-top: 10px;">
                版权 © zygame1314 保留所有权利。
            </p>
        `;

        tutorialContent.style.fontSize = '16px';
        tutorialContent.style.lineHeight = '1.6';

        modalContent.style.scrollbarWidth = 'thin';
        modalContent.style.scrollbarColor = '#4e4376 #f1f1f1';

        const scrollbarStyles = `
            .tutorial-modal::-webkit-scrollbar {
                width: 8px;
            }
            .tutorial-modal::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 4px;
            }
            .tutorial-modal::-webkit-scrollbar-thumb {
                background: #4e4376;
                border-radius: 4px;
            }
        `;
        style.textContent += scrollbarStyles;
        modalContent.classList.add('tutorial-modal');

        modalContent.appendChild(closeButton);
        modalContent.appendChild(tutorialContent);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        setTimeout(() => {
            modalOverlay.style.opacity = '1';
        }, 10);
    }

    function showAnswerEditor() {
        let storedData = localStorage.getItem('answerData');
        if (!storedData) {
            showNotification('未找到存储的答案数据，请先点击“获取答案”按钮。', { type: 'error', keywords: ['存储', '答案', '获取'] });
            return;
        }

        let answerData = JSON.parse(storedData);

        let overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        overlay.style.backdropFilter = 'blur(5px)';
        overlay.style.zIndex = '9999';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease-in-out';

        let modalContainer = document.createElement('div');
        modalContainer.id = 'modal-container';
        modalContainer.style.position = 'fixed';
        modalContainer.style.top = '50%';
        modalContainer.style.left = '50%';
        modalContainer.style.transform = 'translate(-50%, -50%) scale(0.8)';
        modalContainer.style.zIndex = '10000';
        modalContainer.style.width = '90%';
        modalContainer.style.maxWidth = '800px';
        modalContainer.style.maxHeight = '1000px';
        modalContainer.style.overflowY = 'auto';
        modalContainer.style.backgroundColor = '#ffffff';
        modalContainer.style.borderRadius = '20px';
        modalContainer.style.padding = '32px';
        modalContainer.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
        modalContainer.style.opacity = '0';
        modalContainer.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';

        let closeButton = document.createElement('button');
        closeButton.innerHTML = '×';
        closeButton.style.position = 'absolute';
        closeButton.style.top = '20px';
        closeButton.style.right = '20px';
        closeButton.style.width = '36px';
        closeButton.style.height = '36px';
        closeButton.style.fontSize = '24px';
        closeButton.style.border = 'none';
        closeButton.style.background = '#f3f4f6';
        closeButton.style.borderRadius = '50%';
        closeButton.style.cursor = 'pointer';
        closeButton.style.color = '#666';
        closeButton.style.transition = 'all 0.3s ease';
        closeButton.style.display = 'flex';
        closeButton.style.alignItems = 'center';
        closeButton.style.justifyContent = 'center';
        closeButton.style.padding = '0';
        closeButton.style.lineHeight = '1';

        closeButton.onmouseover = () => {
            closeButton.style.background = '#e5e7eb';
            closeButton.style.color = '#000';
            closeButton.style.transform = 'rotate(90deg)';
        };
        closeButton.onmouseout = () => {
            closeButton.style.background = '#f3f4f6';
            closeButton.style.color = '#666';
            closeButton.style.transform = 'rotate(0deg)';
        };

        const closeModal = () => {
            overlay.style.opacity = '0';
            modalContainer.style.transform = 'translate(-50%, -50%) scale(0.8)';
            modalContainer.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(overlay);
                document.body.removeChild(modalContainer);
            }, 300);
        };

        closeButton.onclick = closeModal;
        overlay.onclick = closeModal;

        let title = document.createElement('h2');
        title.textContent = '查看/编辑答案';
        title.style.margin = '0 0 28px 0';
        title.style.color = '#111827';
        title.style.fontSize = '24px';
        title.style.fontWeight = '600';
        title.style.textAlign = 'center';

        let saveButton = document.createElement('button');
        saveButton.textContent = '保存修改';
        saveButton.style.width = '100%';
        saveButton.style.marginBottom = '24px';
        saveButton.style.padding = '12px 24px';
        saveButton.style.fontSize = '16px';
        saveButton.style.border = 'none';
        saveButton.style.borderRadius = '12px';
        saveButton.style.backgroundColor = '#4f46e5';
        saveButton.style.color = '#ffffff';
        saveButton.style.cursor = 'pointer';
        saveButton.style.transition = 'all 0.3s ease';
        saveButton.style.boxShadow = '0 4px 6px -1px rgba(79, 70, 229, 0.1), 0 2px 4px -1px rgba(79, 70, 229, 0.06)';

        saveButton.onmouseover = () => {
            saveButton.style.backgroundColor = '#4338ca';
            saveButton.style.transform = 'translateY(-1px)';
            saveButton.style.boxShadow = '0 6px 8px -1px rgba(79, 70, 229, 0.1), 0 4px 6px -1px rgba(79, 70, 229, 0.06)';
        };
        saveButton.onmouseout = () => {
            saveButton.style.backgroundColor = '#4f46e5';
            saveButton.style.transform = 'translateY(0)';
            saveButton.style.boxShadow = '0 4px 6px -1px rgba(79, 70, 229, 0.1), 0 2px 4px -1px rgba(79, 70, 229, 0.06)';
        };

        saveButton.onclick = () => {
            localStorage.setItem('answerData', JSON.stringify(answerData));
            showNotification('答案已保存', { type: 'success', keywords: ['答案', '保存'] });
            closeModal();
        };

        let modalContentWrapper = document.createElement('div');
        modalContentWrapper.id = 'modal-content-wrapper';
        modalContentWrapper.style.display = 'flex';
        modalContentWrapper.style.gap = '20px';
        modalContentWrapper.style.maxHeight = 'calc(85vh - 120px)';
        modalContentWrapper.style.overflowY = 'auto';

        let tocContainer = document.createElement('div');
        tocContainer.id = 'toc-container';
        tocContainer.style.flex = '0 0 200px';
        tocContainer.style.position = 'sticky';
        tocContainer.style.top = '0';
        tocContainer.style.alignSelf = 'flex-start';
        tocContainer.style.marginBottom = '24px';
        tocContainer.style.overflowY = 'auto';
        tocContainer.style.maxHeight = '680px';

        let tocTitle = document.createElement('h3');
        tocTitle.textContent = '目录';
        tocTitle.style.fontSize = '18px';
        tocTitle.style.fontWeight = '600';
        tocTitle.style.marginBottom = '12px';
        tocTitle.style.color = '#111827';

        let tocList = document.createElement('ul');
        tocList.style.listStyle = 'none';
        tocList.style.padding = '0';
        tocList.style.margin = '0';
        tocList.style.display = 'flex';
        tocList.style.flexWrap = 'wrap';
        tocList.style.gap = '8px';

        let tocLinks = [];
        let questionContainers = [];

        answerData.forEach((_, index) => {
            let tocItem = document.createElement('li');
            let tocLink = document.createElement('a');
            tocLink.textContent = `${index + 1}`;
            tocLink.href = '#';
            tocLink.style.display = 'flex';
            tocLink.style.alignItems = 'center';
            tocLink.style.justifyContent = 'center';
            tocLink.style.width = '40px';
            tocLink.style.height = '40px';
            tocLink.style.backgroundColor = '#f3f4f6';
            tocLink.style.borderRadius = '8px';
            tocLink.style.color = '#1f2937';
            tocLink.style.fontSize = '16px';
            tocLink.style.fontWeight = '600';
            tocLink.style.textDecoration = 'none';
            tocLink.style.transition = 'background-color 0.2s ease';

            tocLink.isActive = false;

            tocLink.onmouseover = () => {
                if (!tocLink.isActive) {
                    tocLink.style.backgroundColor = '#e5e7eb';
                }
            };

            tocLink.onmouseout = () => {
                if (!tocLink.isActive) {
                    tocLink.style.backgroundColor = '#f3f4f6';
                }
            };

            tocLink.onclick = (e) => {
                e.preventDefault();
                let targetQuestion = document.getElementById(`question_${index}`);
                if (targetQuestion) {
                    targetQuestion.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            };

            tocItem.appendChild(tocLink);
            tocList.appendChild(tocItem);
            tocLinks.push(tocLink);
        });

        tocContainer.appendChild(tocTitle);
        tocContainer.appendChild(tocList);

        let content = document.createElement('div');
        content.style.flex = '1';
        content.style.display = 'grid';
        content.style.gap = '20px';

        answerData.forEach((question, index) => {
            let questionContainer = document.createElement('div');
            questionContainer.id = `question_${index}`;
            questionContainer.style.padding = '24px';
            questionContainer.style.backgroundColor = '#ffffff';
            questionContainer.style.borderRadius = '16px';
            questionContainer.style.border = '1px solid #e5e7eb';
            questionContainer.style.transition = 'box-shadow 0.3s ease, margin-top 0.3s ease';
            questionContainer.style.marginTop = '0';
            questionContainer.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)';

            questionContainer.onmouseover = () => {
                questionContainer.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.1)';
            };

            questionContainer.onmouseout = () => {
                questionContainer.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
            };

            let questionTitle = document.createElement('div');
            questionTitle.innerHTML = `<strong>题目 ${index + 1}：</strong> ${parseRichTextForDisplay(question.title)}`;
            questionTitle.style.marginBottom = '16px';
            questionTitle.style.color = '#111827';
            questionTitle.style.fontSize = '16px';
            questionTitle.style.lineHeight = '1.5';

            questionContainer.appendChild(questionTitle);

            if ([1, 2, 5].includes(question.type)) {
                let optionsContainer = document.createElement('div');
                optionsContainer.style.display = 'grid';
                optionsContainer.style.gap = '16px';

                question.answer_items.forEach((item, idx) => {
                    let optionLabel = document.createElement('label');
                    optionLabel.style.display = 'flex';
                    optionLabel.style.alignItems = 'center';
                    optionLabel.style.padding = '16px';
                    optionLabel.style.backgroundColor = '#ffffff';
                    optionLabel.style.borderRadius = '12px';
                    optionLabel.style.cursor = 'pointer';
                    optionLabel.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                    optionLabel.style.position = 'relative';
                    optionLabel.style.border = '1px solid #e5e7eb';
                    optionLabel.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';

                    optionLabel.onmouseover = () => {
                        optionLabel.style.backgroundColor = '#f8fafc';
                        optionLabel.style.transform = 'translateY(-1px)';
                        optionLabel.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.08)';
                    };

                    optionLabel.onmouseout = () => {
                        optionLabel.style.backgroundColor = '#ffffff';
                        optionLabel.style.transform = 'translateY(0)';
                        optionLabel.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                    };

                    let optionInput = document.createElement('input');
                    optionInput.type = question.type === 2 ? 'checkbox' : 'radio';
                    optionInput.name = `question_${question.id}`;
                    optionInput.value = item.id;
                    optionInput.checked = item.answer_checked === 2;
                    optionInput.style.display = 'none';

                    let customCheckbox = document.createElement('span');
                    customCheckbox.style.width = '44px';
                    customCheckbox.style.height = '24px';
                    customCheckbox.style.backgroundColor = optionInput.checked ? '#6366f1' : '#e5e7eb';
                    customCheckbox.style.borderRadius = '24px';
                    customCheckbox.style.position = 'relative';
                    customCheckbox.style.marginRight = '16px';
                    customCheckbox.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                    customCheckbox.style.boxShadow = optionInput.checked ?
                        'inset 0 2px 4px rgba(99, 102, 241, 0.2)' :
                        'inset 0 2px 4px rgba(0, 0, 0, 0.05)';

                    let toggleCircle = document.createElement('span');
                    toggleCircle.style.width = '20px';
                    toggleCircle.style.height = '20px';
                    toggleCircle.style.backgroundColor = '#ffffff';
                    toggleCircle.style.borderRadius = '50%';
                    toggleCircle.style.position = 'absolute';
                    toggleCircle.style.top = '2px';
                    toggleCircle.style.left = optionInput.checked ? '22px' : '2px';
                    toggleCircle.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                    toggleCircle.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                    toggleCircle.style.transform = optionInput.checked ? 'scale(1.1)' : 'scale(1)';

                    let icon = document.createElement('span');
                    icon.style.position = 'absolute';
                    icon.style.top = '50%';
                    icon.style.left = '50%';
                    icon.style.transform = 'translate(-50%, -50%)';
                    icon.style.transition = 'all 0.3s ease';
                    icon.innerHTML = optionInput.checked ?
                        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' :
                        '';

                    toggleCircle.appendChild(icon);
                    customCheckbox.appendChild(toggleCircle);

                    optionLabel.onclick = () => {
                        optionInput.checked = !optionInput.checked;
                        if (question.type !== 2) {
                            let siblingInputs = optionsContainer.querySelectorAll(`input[name="question_${question.id}"]`);
                            siblingInputs.forEach(sibling => {
                                sibling.checked = false;
                                let siblingToggle = sibling.nextSibling;
                                siblingToggle.style.backgroundColor = '#e5e7eb';
                                siblingToggle.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.05)';
                                let siblingCircle = siblingToggle.firstChild;
                                siblingCircle.style.left = '2px';
                                siblingCircle.style.transform = 'scale(1)';
                                siblingCircle.firstChild.innerHTML = '';
                            });
                            optionInput.checked = true;
                        }

                        if (optionInput.checked) {
                            customCheckbox.style.backgroundColor = '#6366f1';
                            customCheckbox.style.boxShadow = 'inset 0 2px 4px rgba(99, 102, 241, 0.2)';
                            toggleCircle.style.left = '22px';
                            toggleCircle.style.transform = 'scale(1.1)';
                            icon.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                        } else {
                            customCheckbox.style.backgroundColor = '#e5e7eb';
                            customCheckbox.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.05)';
                            toggleCircle.style.left = '2px';
                            toggleCircle.style.transform = 'scale(1)';
                            icon.innerHTML = '';
                        }
                        item.answer_checked = optionInput.checked ? 2 : 1;
                    };

                    let optionText = document.createElement('span');
                    optionText.innerHTML = question.type === 5 ?
                        (idx === 0 ? '正确' : '错误') :
                        parseRichText(item.value);
                    optionText.style.color = '#1f2937';
                    optionText.style.flex = '1';
                    optionText.style.fontSize = '15px';
                    optionText.style.fontWeight = '500';

                    optionLabel.appendChild(optionInput);
                    optionLabel.appendChild(customCheckbox);
                    optionLabel.appendChild(optionText);
                    optionsContainer.appendChild(optionLabel);
                });

                questionContainer.appendChild(questionTitle);
                questionContainer.appendChild(optionsContainer);
            } else if ([4, 6].includes(question.type)) {
                let inputContainer = document.createElement('div');
                inputContainer.style.position = 'relative';
                inputContainer.style.width = '100%';
                inputContainer.style.marginTop = '8px';
                inputContainer.style.paddingBottom = '40px';

                let answerInput = document.createElement('textarea');
                answerInput.style.width = '100%';
                answerInput.style.minHeight = '160px';
                answerInput.style.maxHeight = '400px';
                answerInput.style.padding = '16px';
                answerInput.style.paddingTop = '24px';
                answerInput.style.border = '1px solid #e5e7eb';
                answerInput.style.borderRadius = '12px';
                answerInput.style.resize = 'vertical';
                answerInput.style.fontSize = '15px';
                answerInput.style.lineHeight = '1.6';
                answerInput.style.color = '#1f2937';
                answerInput.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                answerInput.style.backgroundColor = '#ffffff';
                answerInput.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                answerInput.style.outline = 'none';
                answerInput.style.display = 'block';
                answerInput.style.boxSizing = 'border-box';
                answerInput.style.overflow = 'auto';

                let floatingLabel = document.createElement('label');
                floatingLabel.textContent = '在这里输入答案';
                floatingLabel.style.position = 'absolute';
                floatingLabel.style.left = '16px';
                floatingLabel.style.top = '16px';
                floatingLabel.style.color = '#9ca3af';
                floatingLabel.style.fontSize = '15px';
                floatingLabel.style.fontWeight = '500';
                floatingLabel.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                floatingLabel.style.pointerEvents = 'none';
                floatingLabel.style.transformOrigin = 'left top';
                floatingLabel.style.backgroundColor = '#ffffff';
                floatingLabel.style.padding = '0 4px';

                let charCount = document.createElement('div');
                charCount.style.position = 'absolute';
                charCount.style.right = '16px';
                charCount.style.bottom = '8px';
                charCount.style.fontSize = '12px';
                charCount.style.color = '#9ca3af';
                charCount.style.pointerEvents = 'none';

                answerInput.onfocus = () => {
                    answerInput.style.borderColor = '#6366f1';
                    answerInput.style.backgroundColor = '#ffffff';
                    answerInput.style.boxShadow = '0 4px 6px rgba(99, 102, 241, 0.1)';

                    floatingLabel.style.transform = 'translateY(-20px) scale(0.85)';
                    floatingLabel.style.color = '#6366f1';
                };

                answerInput.onblur = () => {
                    answerInput.style.borderColor = '#e5e7eb';
                    answerInput.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';

                    if (!answerInput.value) {
                        floatingLabel.style.transform = 'translateY(0) scale(1)';
                        floatingLabel.style.color = '#9ca3af';
                    }
                };

                answerInput.oninput = () => {
                    let length = answerInput.value.length;
                    charCount.textContent = `${length} 个字符`;
                    question.answer_items[0].answer = answerInput.value;
                };

                answerInput.value = question.answer_items.map(item => parseRichTextForDisplay(item.answer)).join('\n---\n');
                if (answerInput.value) {
                    floatingLabel.style.transform = 'translateY(-20px) scale(0.85)';
                    floatingLabel.style.color = '#6366f1';
                    charCount.textContent = `${answerInput.value.length} 个字符`;
                }

                let decorativeLine = document.createElement('div');
                decorativeLine.style.position = 'absolute';
                decorativeLine.style.left = '16px';
                decorativeLine.style.right = '16px';
                decorativeLine.style.bottom = '40px';
                decorativeLine.style.height = '1px';
                decorativeLine.style.background = 'linear-gradient(to right, #e5e7eb 50%, transparent)';
                decorativeLine.style.opacity = '0.5';

                inputContainer.appendChild(answerInput);
                inputContainer.appendChild(floatingLabel);
                inputContainer.appendChild(charCount);
                inputContainer.appendChild(decorativeLine);

                questionContainer.appendChild(questionTitle);
                questionContainer.appendChild(inputContainer);
            } else if (question.type === 9) {
                if (question.subQuestions && question.subQuestions.length > 0) {
                    let subQuestionsContainer = document.createElement('div');
                    subQuestionsContainer.style.display = 'flex';
                    subQuestionsContainer.style.flexDirection = 'column';
                    subQuestionsContainer.style.gap = '24px';
                    subQuestionsContainer.style.marginTop = '20px';
                    subQuestionsContainer.style.padding = '20px';
                    subQuestionsContainer.style.backgroundColor = '#f8fafc';
                    subQuestionsContainer.style.borderRadius = '12px';
                    subQuestionsContainer.style.border = '1px solid #e2e8f0';

                    let subQuestionTitle = document.createElement('div');
                    subQuestionTitle.textContent = '子题目:';
                    subQuestionTitle.style.fontSize = '16px';
                    subQuestionTitle.style.fontWeight = '600';
                    subQuestionTitle.style.color = '#475569';
                    subQuestionTitle.style.marginBottom = '16px';

                    subQuestionsContainer.appendChild(subQuestionTitle);

                    question.subQuestions.forEach((subQuestion, subIndex) => {
                        let subQuestionBox = document.createElement('div');
                        subQuestionBox.style.padding = '20px';
                        subQuestionBox.style.backgroundColor = '#ffffff';
                        subQuestionBox.style.borderRadius = '10px';
                        subQuestionBox.style.border = '1px solid #e5e7eb';
                        subQuestionBox.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';

                        let subQuestionHeader = document.createElement('div');
                        subQuestionHeader.innerHTML = `<strong>${subIndex + 1}. </strong>${parseRichTextForDisplay(subQuestion.title)}`;
                        subQuestionHeader.style.marginBottom = '16px';
                        subQuestionHeader.style.color = '#1e293b';
                        subQuestionHeader.style.fontSize = '15px';

                        subQuestionBox.appendChild(subQuestionHeader);

                        if ([1, 2, 5].includes(subQuestion.type)) {
                            let optionsContainer = document.createElement('div');
                            optionsContainer.style.display = 'grid';
                            optionsContainer.style.gap = '16px';

                            subQuestion.answer_items.forEach((item, idx) => {
                                let optionLabel = document.createElement('label');
                                optionLabel.style.display = 'flex';
                                optionLabel.style.alignItems = 'center';
                                optionLabel.style.padding = '16px';
                                optionLabel.style.backgroundColor = '#ffffff';
                                optionLabel.style.borderRadius = '12px';
                                optionLabel.style.cursor = 'pointer';
                                optionLabel.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                                optionLabel.style.position = 'relative';
                                optionLabel.style.border = '1px solid #e5e7eb';
                                optionLabel.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';

                                optionLabel.onmouseover = () => {
                                    optionLabel.style.backgroundColor = '#f8fafc';
                                    optionLabel.style.transform = 'translateY(-1px)';
                                    optionLabel.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.08)';
                                };

                                optionLabel.onmouseout = () => {
                                    optionLabel.style.backgroundColor = '#ffffff';
                                    optionLabel.style.transform = 'translateY(0)';
                                    optionLabel.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                                };

                                let optionInput = document.createElement('input');
                                optionInput.type = question.type === 2 ? 'checkbox' : 'radio';
                                optionInput.name = `question_${subQuestion.id}`;
                                optionInput.value = item.id;
                                optionInput.checked = item.answer_checked === 2;
                                optionInput.style.display = 'none';

                                let customCheckbox = document.createElement('span');
                                customCheckbox.style.width = '44px';
                                customCheckbox.style.height = '24px';
                                customCheckbox.style.backgroundColor = optionInput.checked ? '#6366f1' : '#e5e7eb';
                                customCheckbox.style.borderRadius = '24px';
                                customCheckbox.style.position = 'relative';
                                customCheckbox.style.marginRight = '16px';
                                customCheckbox.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                                customCheckbox.style.boxShadow = optionInput.checked ?
                                    'inset 0 2px 4px rgba(99, 102, 241, 0.2)' :
                                    'inset 0 2px 4px rgba(0, 0, 0, 0.05)';

                                let toggleCircle = document.createElement('span');
                                toggleCircle.style.width = '20px';
                                toggleCircle.style.height = '20px';
                                toggleCircle.style.backgroundColor = '#ffffff';
                                toggleCircle.style.borderRadius = '50%';
                                toggleCircle.style.position = 'absolute';
                                toggleCircle.style.top = '2px';
                                toggleCircle.style.left = optionInput.checked ? '22px' : '2px';
                                toggleCircle.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                                toggleCircle.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                                toggleCircle.style.transform = optionInput.checked ? 'scale(1.1)' : 'scale(1)';

                                let icon = document.createElement('span');
                                icon.style.position = 'absolute';
                                icon.style.top = '50%';
                                icon.style.left = '50%';
                                icon.style.transform = 'translate(-50%, -50%)';
                                icon.style.transition = 'all 0.3s ease';
                                icon.innerHTML = optionInput.checked ?
                                    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' :
                                    '';

                                toggleCircle.appendChild(icon);
                                customCheckbox.appendChild(toggleCircle);

                                optionLabel.onclick = () => {
                                    optionInput.checked = !optionInput.checked;
                                    if (question.type !== 2) {
                                        let siblingInputs = optionsContainer.querySelectorAll(`input[name="question_${question.id}"]`);
                                        siblingInputs.forEach(sibling => {
                                            sibling.checked = false;
                                            let siblingToggle = sibling.nextSibling;
                                            siblingToggle.style.backgroundColor = '#e5e7eb';
                                            siblingToggle.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.05)';
                                            let siblingCircle = siblingToggle.firstChild;
                                            siblingCircle.style.left = '2px';
                                            siblingCircle.style.transform = 'scale(1)';
                                            siblingCircle.firstChild.innerHTML = '';
                                        });
                                        optionInput.checked = true;
                                    }

                                    if (optionInput.checked) {
                                        customCheckbox.style.backgroundColor = '#6366f1';
                                        customCheckbox.style.boxShadow = 'inset 0 2px 4px rgba(99, 102, 241, 0.2)';
                                        toggleCircle.style.left = '22px';
                                        toggleCircle.style.transform = 'scale(1.1)';
                                        icon.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                                    } else {
                                        customCheckbox.style.backgroundColor = '#e5e7eb';
                                        customCheckbox.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.05)';
                                        toggleCircle.style.left = '2px';
                                        toggleCircle.style.transform = 'scale(1)';
                                        icon.innerHTML = '';
                                    }
                                    item.answer_checked = optionInput.checked ? 2 : 1;
                                };

                                let optionText = document.createElement('span');
                                optionText.innerHTML = question.type === 5 ?
                                    (idx === 0 ? '正确' : '错误') :
                                    parseRichText(item.value);
                                optionText.style.color = '#1f2937';
                                optionText.style.flex = '1';
                                optionText.style.fontSize = '15px';
                                optionText.style.fontWeight = '500';

                                optionLabel.appendChild(optionInput);
                                optionLabel.appendChild(customCheckbox);
                                optionLabel.appendChild(optionText);
                                optionsContainer.appendChild(optionLabel);
                            });

                            subQuestionBox.appendChild(subQuestionHeader);
                            subQuestionBox.appendChild(optionsContainer);
                        } else if ([4, 6].includes(subQuestion.type)) {
                            let inputContainer = document.createElement('div');
                            inputContainer.style.position = 'relative';
                            inputContainer.style.width = '100%';
                            inputContainer.style.marginTop = '8px';
                            inputContainer.style.paddingBottom = '40px';

                            let answerInput = document.createElement('textarea');
                            answerInput.style.width = '100%';
                            answerInput.style.minHeight = '160px';
                            answerInput.style.maxHeight = '400px';
                            answerInput.style.padding = '16px';
                            answerInput.style.paddingTop = '24px';
                            answerInput.style.border = '1px solid #e5e7eb';
                            answerInput.style.borderRadius = '12px';
                            answerInput.style.resize = 'vertical';
                            answerInput.style.fontSize = '15px';
                            answerInput.style.lineHeight = '1.6';
                            answerInput.style.color = '#1f2937';
                            answerInput.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                            answerInput.style.backgroundColor = '#ffffff';
                            answerInput.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                            answerInput.style.outline = 'none';
                            answerInput.style.display = 'block';
                            answerInput.style.boxSizing = 'border-box';
                            answerInput.style.overflow = 'auto';

                            let floatingLabel = document.createElement('label');
                            floatingLabel.textContent = '在这里输入答案';
                            floatingLabel.style.position = 'absolute';
                            floatingLabel.style.left = '16px';
                            floatingLabel.style.top = '16px';
                            floatingLabel.style.color = '#9ca3af';
                            floatingLabel.style.fontSize = '15px';
                            floatingLabel.style.fontWeight = '500';
                            floatingLabel.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                            floatingLabel.style.pointerEvents = 'none';
                            floatingLabel.style.transformOrigin = 'left top';
                            floatingLabel.style.backgroundColor = '#ffffff';
                            floatingLabel.style.padding = '0 4px';

                            let charCount = document.createElement('div');
                            charCount.style.position = 'absolute';
                            charCount.style.right = '16px';
                            charCount.style.bottom = '8px';
                            charCount.style.fontSize = '12px';
                            charCount.style.color = '#9ca3af';
                            charCount.style.pointerEvents = 'none';

                            answerInput.onfocus = () => {
                                answerInput.style.borderColor = '#6366f1';
                                answerInput.style.backgroundColor = '#ffffff';
                                answerInput.style.boxShadow = '0 4px 6px rgba(99, 102, 241, 0.1)';

                                floatingLabel.style.transform = 'translateY(-20px) scale(0.85)';
                                floatingLabel.style.color = '#6366f1';
                            };

                            answerInput.onblur = () => {
                                answerInput.style.borderColor = '#e5e7eb';
                                answerInput.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';

                                if (!answerInput.value) {
                                    floatingLabel.style.transform = 'translateY(0) scale(1)';
                                    floatingLabel.style.color = '#9ca3af';
                                }
                            };

                            answerInput.oninput = () => {
                                let length = answerInput.value.length;
                                charCount.textContent = `${length} 个字符`;
                                question.answer_items[0].answer = answerInput.value;
                            };

                            answerInput.value = subQuestion.answer_items.map(item =>
                                parseRichTextForDisplay(item.answer)).join('\n---\n');
                            if (answerInput.value) {
                                floatingLabel.style.transform = 'translateY(-20px) scale(0.85)';
                                floatingLabel.style.color = '#6366f1';
                                charCount.textContent = `${answerInput.value.length} 个字符`;
                            }

                            let decorativeLine = document.createElement('div');
                            decorativeLine.style.position = 'absolute';
                            decorativeLine.style.left = '16px';
                            decorativeLine.style.right = '16px';
                            decorativeLine.style.bottom = '40px';
                            decorativeLine.style.height = '1px';
                            decorativeLine.style.background = 'linear-gradient(to right, #e5e7eb 50%, transparent)';
                            decorativeLine.style.opacity = '0.5';

                            inputContainer.appendChild(answerInput);
                            inputContainer.appendChild(floatingLabel);
                            inputContainer.appendChild(charCount);
                            inputContainer.appendChild(decorativeLine);

                            subQuestionBox.appendChild(subQuestionHeader);
                            subQuestionBox.appendChild(inputContainer);
                        }
                        if (subQuestion.description && subQuestion.description !== '{}') {
                            let toggleDescriptionContainer = document.createElement('div');
                            toggleDescriptionContainer.style.cssText = `
                                margin: 24px 0;
                                position: relative; 
                            `;

                            let toggleDescriptionButton = document.createElement('button');
                            toggleDescriptionButton.style.cssText = `
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 16px;
                                color: #2563eb;
                                background: #fff;
                                border: 1px solid #e5e7eb;
                                border-bottom: none;
                                border-radius: 8px;
                                border-bottom-left-radius: 0;
                                border-bottom-right-radius: 0;
                                cursor: pointer;
                                padding: 12px 16px;
                                width: 100%;
                                transition: background-color 0.3s, box-shadow 0.3s;
                                position: relative;
                            `;
                            toggleDescriptionButton.innerHTML = `
                                <span style="display: flex; align-items: center;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" style="display: inline-block; margin-right: 8px; transition: transform 0.3s; transform-origin: center;" viewBox="0 0 16 16">
                                        <path fill-rule="evenodd" d="M1.5 5.5l6 6 6-6H1.5z"/>
                                    </svg>
                                    <span>查看解析</span>
                                </span>
                            `;

                            let descriptionContainer = document.createElement('div');
                            descriptionContainer.style.cssText = `
                                max-height: 0;
                                overflow: hidden;
                                transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                                background-color: #f9fafb;
                                border: 1px solid #e5e7eb;
                                border-top: none;
                                border-radius: 8px;
                                border-top-left-radius: 0;
                                border-top-right-radius: 0;
                                margin-top: 0;
                            `;

                            let descriptionContent = document.createElement('div');
                            descriptionContent.style.cssText = `
                                padding: 24px;
                                color: #111827;
                                font-size: 16px;
                                line-height: 1.8;
                            `;
                            descriptionContent.innerHTML = parseRichTextForDisplay(subQuestion.description);

                            let isDescriptionVisible = false;
                            toggleDescriptionButton.onclick = () => {
                                isDescriptionVisible = !isDescriptionVisible;
                                let svgIcon = toggleDescriptionButton.querySelector('svg');
                                let textLabel = toggleDescriptionButton.querySelector('span > span');

                                if (isDescriptionVisible) {
                                    descriptionContainer.style.maxHeight = descriptionContent.scrollHeight + 'px';
                                    svgIcon.style.transform = 'rotate(180deg)';
                                    textLabel.textContent = '收起解析';
                                    toggleDescriptionButton.style.backgroundColor = '#ebf5ff';
                                    toggleDescriptionButton.style.boxShadow = 'inset 0 3px 6px rgba(0,0,0,0.1)';
                                } else {
                                    descriptionContainer.style.maxHeight = '0';
                                    svgIcon.style.transform = 'rotate(0deg)';
                                    textLabel.textContent = '查看解析';
                                    toggleDescriptionButton.style.backgroundColor = '#fff';
                                    toggleDescriptionButton.style.boxShadow = 'none';
                                }
                            };

                            descriptionContainer.appendChild(descriptionContent);
                            toggleDescriptionContainer.appendChild(toggleDescriptionButton);
                            toggleDescriptionContainer.appendChild(descriptionContainer);
                            subQuestionBox.appendChild(toggleDescriptionContainer);
                        }
                        subQuestionsContainer.appendChild(subQuestionBox);
                    });
                    questionContainer.appendChild(subQuestionsContainer);
                }
            } else if (question.type === 12) {
                question.answer_items.sort((a, b) => {
                    return parseInt(a.answer) - parseInt(b.answer);
                });

                let sortableContainer = document.createElement('div');
                sortableContainer.style.display = 'flex';
                sortableContainer.style.flexDirection = 'column';
                sortableContainer.style.gap = '12px';
                sortableContainer.style.marginTop = '16px';

                question.answer_items.forEach((item, index) => {
                    let sortableItem = document.createElement('div');
                    sortableItem.setAttribute('draggable', 'true');
                    sortableItem.dataset.id = item.id;
                    sortableItem.dataset.index = index;

                    sortableItem.style.display = 'flex';
                    sortableItem.style.alignItems = 'center';
                    sortableItem.style.padding = '16px';
                    sortableItem.style.backgroundColor = '#ffffff';
                    sortableItem.style.borderRadius = '12px';
                    sortableItem.style.border = '1px solid #e5e7eb';
                    sortableItem.style.cursor = 'move';
                    sortableItem.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                    sortableItem.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                    sortableItem.style.userSelect = 'none';

                    let orderNumber = document.createElement('div');
                    orderNumber.textContent = index + 1;
                    orderNumber.style.width = '28px';
                    orderNumber.style.height = '28px';
                    orderNumber.style.borderRadius = '50%';
                    orderNumber.style.backgroundColor = '#6366f1';
                    orderNumber.style.color = '#ffffff';
                    orderNumber.style.display = 'flex';
                    orderNumber.style.alignItems = 'center';
                    orderNumber.style.justifyContent = 'center';
                    orderNumber.style.marginRight = '16px';
                    orderNumber.style.fontWeight = '600';
                    orderNumber.style.fontSize = '14px';
                    orderNumber.style.flexShrink = '0';

                    let dragHandle = document.createElement('div');
                    dragHandle.innerHTML = `
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2">
                            <circle cx="8" cy="6" r="2" />
                            <circle cx="8" cy="12" r="2" />
                            <circle cx="8" cy="18" r="2" />
                            <circle cx="16" cy="6" r="2" />
                            <circle cx="16" cy="12" r="2" />
                            <circle cx="16" cy="18" r="2" />
                        </svg>
                    `;
                    dragHandle.style.marginRight = '12px';
                    dragHandle.style.flexShrink = '0';
                    dragHandle.style.opacity = '0.5';
                    dragHandle.style.transition = 'opacity 0.2s ease';

                    let itemText = document.createElement('div');
                    itemText.innerHTML = parseRichTextForDisplay(item.value);
                    itemText.style.flex = '1';
                    itemText.style.color = '#1f2937';
                    itemText.style.fontSize = '15px';
                    itemText.style.fontWeight = '500';

                    sortableItem.ondragstart = (e) => {
                        e.stopPropagation();
                        sortableItem.style.opacity = '0.6';
                        sortableItem.style.transform = 'scale(1.02)';
                        e.dataTransfer.setData('text/plain', sortableItem.dataset.index);
                        sortableItem.style.backgroundColor = '#f8fafc';
                    };

                    sortableItem.ondragend = (e) => {
                        e.stopPropagation();
                        sortableItem.style.opacity = '1';
                        sortableItem.style.transform = 'scale(1)';
                        sortableItem.style.backgroundColor = '#ffffff';
                    };

                    sortableItem.ondragover = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        sortableItem.style.transform = 'scale(1.02)';
                        sortableItem.style.borderColor = '#6366f1';
                        sortableItem.style.boxShadow = '0 4px 6px rgba(99, 102, 241, 0.1)';
                    };

                    sortableItem.ondragleave = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        sortableItem.style.transform = 'scale(1)';
                        sortableItem.style.borderColor = '#e5e7eb';
                        sortableItem.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                    };

                    sortableItem.ondrop = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                        const toIndex = parseInt(sortableItem.dataset.index);

                        if (fromIndex !== toIndex) {
                            const items = Array.from(sortableContainer.children);
                            const movingItem = items[fromIndex];
                            const targetItem = items[toIndex];

                            if (fromIndex < toIndex) {
                                targetItem.parentNode.insertBefore(movingItem, targetItem.nextSibling);
                            } else {
                                targetItem.parentNode.insertBefore(movingItem, targetItem);
                            }

                            const newOrder = Array.from(sortableContainer.children).map((item, idx) => {
                                item.querySelector('div:nth-child(2)').textContent = idx + 1;
                                item.dataset.index = idx;
                                return item.dataset.id;
                            });

                            newOrder.forEach((id, idx) => {
                                const answerItem = question.answer_items.find(item => item.id === id);
                                if (answerItem) {
                                    answerItem.answer = (idx + 1).toString();
                                }
                            });
                        }

                        sortableItem.style.transform = 'scale(1)';
                        sortableItem.style.borderColor = '#e5e7eb';
                        sortableItem.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                    };

                    sortableItem.onmouseover = () => {
                        sortableItem.style.backgroundColor = '#f8fafc';
                        sortableItem.style.transform = 'translateY(-1px)';
                        sortableItem.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.08)';
                        dragHandle.style.opacity = '1';
                    };

                    sortableItem.onmouseout = () => {
                        sortableItem.style.backgroundColor = '#ffffff';
                        sortableItem.style.transform = 'translateY(0)';
                        sortableItem.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                        dragHandle.style.opacity = '0.5';
                    };

                    sortableItem.appendChild(dragHandle);
                    sortableItem.appendChild(orderNumber);
                    sortableItem.appendChild(itemText);
                    sortableContainer.appendChild(sortableItem);
                });

                questionContainer.appendChild(questionTitle);
                questionContainer.appendChild(sortableContainer);
            } else if (question.type === 13) {
                let matchingContainer = document.createElement('div');
                matchingContainer.style.display = 'flex';
                matchingContainer.style.flexDirection = 'column';
                matchingContainer.style.gap = '16px';
                matchingContainer.style.marginTop = '20px';
                matchingContainer.style.padding = '16px';
                matchingContainer.style.backgroundColor = '#f8fafc';
                matchingContainer.style.borderRadius = '16px';

                let leftItems = question.answer_items.filter(item => !item.is_target_opt);
                let rightItems = question.answer_items.filter(item => item.is_target_opt);

                let leftLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                let rightLetters = 'abcdefghijklmnopqrstuvwxyz';

                let rightItemMap = {};
                rightItems.forEach((rightItem, idx) => {
                    rightItemMap[rightItem.id] = {
                        letter: rightLetters[idx],
                        content: rightItem.value
                    };
                });

                leftItems.forEach((leftItem, idx) => {
                    let matchItem = document.createElement('div');
                    matchItem.style.display = 'flex';
                    matchItem.style.flexDirection = 'column';
                    matchItem.style.padding = '20px';
                    matchItem.style.backgroundColor = '#ffffff';
                    matchItem.style.borderRadius = '12px';
                    matchItem.style.border = '1px solid #e2e8f0';
                    matchItem.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                    matchItem.style.transition = 'all 0.3s ease';
                    matchItem.style.position = 'relative';

                    let headerContainer = document.createElement('div');
                    headerContainer.style.display = 'flex';
                    headerContainer.style.alignItems = 'flex-start';
                    headerContainer.style.marginBottom = '16px';

                    let leftLetter = leftLetters[idx];
                    let leftLabel = document.createElement('div');
                    leftLabel.textContent = leftLetter + '.';
                    leftLabel.style.marginRight = '12px';
                    leftLabel.style.fontWeight = '600';
                    leftLabel.style.color = '#6366f1';
                    leftLabel.style.fontSize = '16px';
                    leftLabel.style.width = '24px';

                    let leftContent = document.createElement('div');
                    leftContent.innerHTML = parseRichTextForDisplay(leftItem.value);
                    leftContent.style.flex = '1';
                    leftContent.style.color = '#1e293b';
                    leftContent.style.fontSize = '15px';
                    leftContent.style.fontWeight = '500';
                    leftContent.style.lineHeight = '1.6';

                    let chipContainer = document.createElement('div');
                    chipContainer.style.display = 'flex';
                    chipContainer.style.flexWrap = 'wrap';
                    chipContainer.style.gap = '8px';
                    chipContainer.style.marginTop = '12px';
                    chipContainer.style.minHeight = '36px';

                    let selectedAnswers = [];
                    if (leftItem.answer) {
                        if (Array.isArray(leftItem.answer)) {
                            selectedAnswers = leftItem.answer;
                        } else if (typeof leftItem.answer === 'string') {
                            selectedAnswers = leftItem.answer.split(',').filter(id => id);
                        } else {
                            selectedAnswers = [leftItem.answer];
                        }
                    }

                    const updateChips = () => {
                        chipContainer.innerHTML = '';
                        selectedAnswers.forEach(ansId => {
                            if (rightItemMap[ansId]) {
                                let chip = document.createElement('div');
                                chip.style.display = 'flex';
                                chip.style.alignItems = 'center';
                                chip.style.padding = '6px 12px';
                                chip.style.backgroundColor = '#eef2ff';
                                chip.style.border = '1px solid #e0e7ff';
                                chip.style.borderRadius = '8px';
                                chip.style.color = '#4f46e5';
                                chip.style.fontSize = '14px';
                                chip.style.fontWeight = '500';
                                chip.style.cursor = 'default';
                                chip.style.transition = 'all 0.2s ease';

                                let chipText = document.createElement('span');
                                let rightLetter = rightItemMap[ansId].letter;
                                chipText.innerHTML = `${rightLetter}. ${parseRichTextForDisplay(rightItemMap[ansId].content)}`;
                                chipText.style.marginRight = '8px';

                                let removeIcon = document.createElement('span');
                                removeIcon.innerHTML = `
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                `;
                                removeIcon.style.cursor = 'pointer';
                                removeIcon.style.display = 'flex';
                                removeIcon.style.alignItems = 'center';
                                removeIcon.style.padding = '2px';
                                removeIcon.style.borderRadius = '4px';
                                removeIcon.style.transition = 'all 0.2s ease';

                                removeIcon.onmouseover = () => {
                                    removeIcon.style.backgroundColor = '#e0e7ff';
                                };
                                removeIcon.onmouseout = () => {
                                    removeIcon.style.backgroundColor = 'transparent';
                                };

                                removeIcon.onclick = (e) => {
                                    e.stopPropagation();
                                    chip.style.opacity = '0';
                                    chip.style.transform = 'scale(0.8)';
                                    setTimeout(() => {
                                        selectedAnswers = selectedAnswers.filter(id => id !== ansId);
                                        updateChips();
                                        leftItem.answer = selectedAnswers.join(',');

                                        if (checkboxesMap[ansId]) {
                                            checkboxesMap[ansId].checked = false;
                                        }
                                    }, 200);
                                };

                                chip.appendChild(chipText);
                                chip.appendChild(removeIcon);
                                chipContainer.appendChild(chip);
                            }
                        });
                    };
                    updateChips();

                    let dropdownButton = document.createElement('button');
                    dropdownButton.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        添加匹配项
                    `;
                    dropdownButton.style.display = 'flex';
                    dropdownButton.style.alignItems = 'center';
                    dropdownButton.style.justifyContent = 'center';
                    dropdownButton.style.marginTop = '16px';
                    dropdownButton.style.padding = '10px 16px';
                    dropdownButton.style.backgroundColor = '#4f46e5';
                    dropdownButton.style.color = '#ffffff';
                    dropdownButton.style.border = 'none';
                    dropdownButton.style.borderRadius = '8px';
                    dropdownButton.style.cursor = 'pointer';
                    dropdownButton.style.transition = 'all 0.2s ease';
                    dropdownButton.style.fontSize = '14px';
                    dropdownButton.style.fontWeight = '500';
                    dropdownButton.style.width = '100%';

                    dropdownButton.onmouseover = () => {
                        dropdownButton.style.backgroundColor = '#4338ca';
                        dropdownButton.style.transform = 'translateY(-1px)';
                    };
                    dropdownButton.onmouseout = () => {
                        dropdownButton.style.backgroundColor = '#4f46e5';
                        dropdownButton.style.transform = 'translateY(0)';
                    };

                    let dropdownList = document.createElement('div');
                    dropdownList.style.position = 'absolute';
                    dropdownList.style.top = '100%';
                    dropdownList.style.left = '0';
                    dropdownList.style.width = '100%';
                    dropdownList.style.maxHeight = '300px';
                    dropdownList.style.overflowY = 'auto';
                    dropdownList.style.border = '1px solid #e2e8f0';
                    dropdownList.style.borderRadius = '12px';
                    dropdownList.style.backgroundColor = '#ffffff';
                    dropdownList.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                    dropdownList.style.zIndex = '1000';
                    dropdownList.style.marginTop = '8px';
                    dropdownList.style.display = 'none';
                    dropdownList.style.opacity = '0';
                    dropdownList.style.transform = 'scaleY(0.9) translateY(-10px)';
                    dropdownList.style.transformOrigin = 'top';
                    dropdownList.style.transition = 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)';

                    dropdownList.style.scrollbarWidth = 'thin';
                    dropdownList.style.scrollbarColor = '#cbd5e1 #f8fafc';

                    let checkboxesMap = {};
                    rightItems.forEach((rightItem, rIdx) => {
                        let dropdownOption = document.createElement('div');
                        dropdownOption.style.padding = '12px 16px';
                        dropdownOption.style.cursor = 'pointer';
                        dropdownOption.style.display = 'flex';
                        dropdownOption.style.alignItems = 'center';
                        dropdownOption.style.transition = 'all 0.2s ease';
                        dropdownOption.style.position = 'relative';
                        dropdownOption.style.borderBottom = rIdx < rightItems.length - 1 ? '1px solid #f1f5f9' : 'none';

                        dropdownOption.onmouseover = () => {
                            dropdownOption.style.backgroundColor = '#f8fafc';
                        };

                        dropdownOption.onmouseout = () => {
                            dropdownOption.style.backgroundColor = '#ffffff';
                        };

                        let rightLetter = rightLetters[rIdx];

                        let checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.style.marginRight = '12px';
                        checkbox.style.width = '16px';
                        checkbox.style.height = '16px';
                        checkbox.style.accentColor = '#4f46e5';
                        checkbox.checked = selectedAnswers.includes(rightItem.id.toString());
                        checkboxesMap[rightItem.id] = checkbox;

                        let optionContent = document.createElement('div');
                        optionContent.style.flex = '1';
                        optionContent.style.display = 'flex';
                        optionContent.style.alignItems = 'center';
                        optionContent.innerHTML = `
                            <span style="font-weight:600; color:#6366f1; margin-right:12px; font-size:14px;">
                                ${rightLetter}.
                            </span>
                            <span style="color:#1e293b; font-size:14px; font-weight:500;">
                                ${parseRichTextForDisplay(rightItem.value)}
                            </span>
                        `;

                        dropdownOption.appendChild(checkbox);
                        dropdownOption.appendChild(optionContent);
                        dropdownOption.title = parseRichTextForDisplay(rightItem.value);

                        checkbox.onchange = (e) => {
                            e.stopPropagation();
                            if (checkbox.checked) {
                                selectedAnswers.push(rightItem.id.toString());
                            } else {
                                selectedAnswers = selectedAnswers.filter(id => id !== rightItem.id.toString());
                            }
                            updateChips();
                            leftItem.answer = selectedAnswers.join(',');
                        };

                        dropdownOption.onclick = (e) => {
                            if (e.target !== checkbox) {
                                checkbox.checked = !checkbox.checked;
                                checkbox.dispatchEvent(new Event('change'));
                            }
                        };

                        dropdownList.appendChild(dropdownOption);
                    });

                    dropdownButton.onclick = (e) => {
                        e.stopPropagation();
                        if (dropdownList.style.display === 'none') {
                            dropdownList.style.display = 'block';
                            requestAnimationFrame(() => {
                                dropdownList.style.opacity = '1';
                                dropdownList.style.transform = 'scaleY(1) translateY(0)';
                            });
                        } else {
                            dropdownList.style.opacity = '0';
                            dropdownList.style.transform = 'scaleY(0.9) translateY(-10px)';
                            setTimeout(() => {
                                dropdownList.style.display = 'none';
                            }, 200);
                        }
                    };

                    document.addEventListener('click', (e) => {
                        if (!matchItem.contains(e.target)) {
                            dropdownList.style.opacity = '0';
                            dropdownList.style.transform = 'scaleY(0.9) translateY(-10px)';
                            setTimeout(() => {
                                dropdownList.style.display = 'none';
                            }, 200);
                        }
                    });

                    headerContainer.appendChild(leftLabel);
                    headerContainer.appendChild(leftContent);
                    matchItem.appendChild(headerContainer);
                    matchItem.appendChild(chipContainer);
                    matchItem.appendChild(dropdownButton);
                    matchItem.appendChild(dropdownList);
                    matchingContainer.appendChild(matchItem);
                });

                questionContainer.appendChild(questionTitle);
                questionContainer.appendChild(matchingContainer);
            } else {
                let notSupportedMessage = document.createElement('div');
                notSupportedMessage.style.padding = '20px';
                notSupportedMessage.style.backgroundColor = '#fff3cd';
                notSupportedMessage.style.border = '1px solid #ffeeba';
                notSupportedMessage.style.borderRadius = '8px';
                notSupportedMessage.style.color = '#856404';
                notSupportedMessage.style.fontSize = '15px';
                notSupportedMessage.style.marginTop = '16px';
                notSupportedMessage.style.textAlign = 'center';
                notSupportedMessage.innerHTML = `
                    <svg style="width: 24px; height: 24px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p style="margin: 0;">该题型暂不支持查看答案</p>
                `;
                questionContainer.appendChild(questionTitle);
                questionContainer.appendChild(notSupportedMessage);
            }

            if (question.description && question.description !== '{}') {
                let toggleDescriptionContainer = document.createElement('div');
                toggleDescriptionContainer.style.cssText = `
                    margin: 24px 0;
                    position: relative;
                `;

                let toggleDescriptionButton = document.createElement('button');
                toggleDescriptionButton.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    color: #2563eb;
                    background: #fff;
                    border: 1px solid #e5e7eb;
                    border-bottom: none;
                    border-radius: 8px;
                    border-bottom-left-radius: 0;
                    border-bottom-right-radius: 0;
                    cursor: pointer;
                    padding: 12px 16px;
                    width: 100%;
                    transition: background-color 0.3s, box-shadow 0.3s;
                    position: relative;
                `;
                toggleDescriptionButton.innerHTML = `
                    <span style="display: flex; align-items: center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" style="display: inline-block; margin-right: 8px; transition: transform 0.3s; transform-origin: center;" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M1.5 5.5l6 6 6-6H1.5z"/>
                        </svg>
                        <span>查看解析</span>
                    </span>
                `;

                let descriptionContainer = document.createElement('div');
                descriptionContainer.style.cssText = `
                    max-height: 0;
                    overflow: hidden;
                    transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                    background-color: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-top: none;
                    border-radius: 8px;
                    border-top-left-radius: 0;
                    border-top-right-radius: 0;
                    margin-top: 0;
                `;

                let descriptionContent = document.createElement('div');
                descriptionContent.style.cssText = `
                    padding: 24px;
                    color: #111827;
                    font-size: 16px;
                    line-height: 1.8;
                `;
                descriptionContent.innerHTML = parseRichTextForDisplay(question.description);

                descriptionContainer.appendChild(descriptionContent);

                let isDescriptionVisible = false;

                toggleDescriptionButton.onclick = () => {
                    isDescriptionVisible = !isDescriptionVisible;
                    let svgIcon = toggleDescriptionButton.querySelector('svg');
                    let textLabel = toggleDescriptionButton.querySelector('span > span');

                    if (isDescriptionVisible) {
                        descriptionContainer.style.maxHeight = descriptionContent.scrollHeight + 'px';
                        svgIcon.style.transform = 'rotate(180deg)';
                        textLabel.textContent = '收起解析';
                        toggleDescriptionButton.style.backgroundColor = '#ebf5ff';
                        toggleDescriptionButton.style.boxShadow = 'inset 0 3px 6px rgba(0,0,0,0.1)';
                    } else {
                        descriptionContainer.style.maxHeight = '0';
                        svgIcon.style.transform = 'rotate(0deg)';
                        textLabel.textContent = '查看解析';
                        toggleDescriptionButton.style.backgroundColor = '#fff';
                        toggleDescriptionButton.style.boxShadow = 'none';
                    }
                };

                toggleDescriptionContainer.appendChild(toggleDescriptionButton);
                toggleDescriptionContainer.appendChild(descriptionContainer);

                questionContainer.appendChild(toggleDescriptionContainer);
            }

            content.appendChild(questionContainer);
            questionContainers.push(questionContainer);
        });

        modalContentWrapper.appendChild(tocContainer);
        modalContentWrapper.appendChild(content);

        modalContainer.appendChild(closeButton);
        modalContainer.appendChild(title);
        modalContainer.appendChild(saveButton);
        modalContainer.appendChild(modalContentWrapper);

        document.body.appendChild(overlay);
        document.body.appendChild(modalContainer);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        });

        function updateCurrentQuestionHighlight() {
            let currentQuestionIndex = 0;
            let minDifference = Infinity;

            questionContainers.forEach((qc, index) => {
                let qcRect = qc.getBoundingClientRect();
                let containerRect = modalContentWrapper.getBoundingClientRect();
                let difference = Math.abs(qcRect.top - containerRect.top);
                if (difference < minDifference) {
                    minDifference = difference;
                    currentQuestionIndex = index;
                }
            });

            tocLinks.forEach((tocLink, idx) => {
                if (idx === currentQuestionIndex) {
                    tocLink.isActive = true;
                    tocLink.style.backgroundColor = '#6366f1';
                    tocLink.style.color = '#ffffff';
                } else {
                    tocLink.isActive = false;
                    tocLink.style.backgroundColor = '#f3f4f6';
                    tocLink.style.color = '#1f2937';
                }
            });
        }

        modalContentWrapper.addEventListener('scroll', updateCurrentQuestionHighlight);

        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            modalContainer.style.transform = 'translate(-50%, -50%) scale(1)';
            modalContainer.style.opacity = '1';
            updateCurrentQuestionHighlight();
        });
    }

    async function exportHomework() {
        console.log('exportHomework function called');

        let storedData = localStorage.getItem('answerData');
        if (!storedData) {
            console.error('未找到存储的答案数据，请先获取并存储答案。');
            showNotification('未找到存储的答案数据，请先点击“获取答案”按钮。', { type: 'error', keywords: ['存储', '答案', '获取'] });
            return;
        }

        const answerData = JSON.parse(storedData);

        let assignmentTitle = localStorage.getItem('assignmentTitle') || '作业答案';

        try {
            const docContent = [];

            showNotification('已开始导出，请稍后……', { type: 'info', keywords: ['导出', '开始'] });

            docContent.push(
                new Paragraph({
                    text: assignmentTitle,
                    heading: HeadingLevel.TITLE,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 },
                }),
                new Paragraph({
                    text: `导出时间：${new Date().toLocaleString()}`,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 },
                })
            );

            for (let index = 0; index < answerData.length; index++) {
                const question = answerData[index];

                const questionNumber = `${index + 1}、`;

                const titleRuns = await parseRichTextContent(question.title);
                const titleParagraph = new Paragraph({
                    children: [
                        new TextRun({
                            text: questionNumber,
                            bold: true,
                        }),
                        ...titleRuns,
                    ],
                });
                docContent.push(titleParagraph);

                switch (question.type) {
                    case 1:
                    case 2:
                        {
                            const options = question.answer_items.map((item, idx) => {
                                const optionLetter = String.fromCharCode(65 + idx);
                                return {
                                    letter: optionLetter,
                                    content: item.value,
                                };
                            });

                            for (const option of options) {
                                const optionRuns = await parseRichTextContent(option.content);
                                const optionParagraph = new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: `${option.letter}. `,
                                            bold: true,
                                        }),
                                        ...optionRuns,
                                    ],
                                });
                                docContent.push(optionParagraph);
                            }

                            const correctOptions = question.answer_items
                                .map((item, idx) => item.answer_checked === 2 ? String.fromCharCode(65 + idx) : null)
                                .filter(item => item !== null)
                                .join('');

                            docContent.push(
                                new Paragraph({
                                    text: `答案：${correctOptions}`,
                                    spacing: { before: 100, after: 100 },
                                })
                            );

                            if (question.description && question.description !== '{}') {
                                const descriptionRuns = await parseRichTextContent(question.description);
                                const descriptionParagraph = new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: '解析：',
                                            bold: true,
                                        }),
                                        ...descriptionRuns,
                                    ],
                                    spacing: { before: 100, after: 100 },
                                });
                                docContent.push(descriptionParagraph);
                            }

                            break;
                        }
                    case 5:
                        {
                            const isCorrect = question.answer_items.some(item => item.answer_checked === 2 && (item.value === '正确' || item.value.toLowerCase() === 'true'));
                            const answerText = isCorrect ? '对' : '错';

                            docContent.push(
                                new Paragraph({
                                    text: `答案：${answerText}`,
                                    spacing: { before: 100, after: 100 },
                                })
                            );

                            if (question.description && question.description !== '{}') {
                                const descriptionRuns = await parseRichTextContent(question.description);
                                const descriptionParagraph = new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: '解析：',
                                            bold: true,
                                        }),
                                        ...descriptionRuns,
                                    ],
                                    spacing: { before: 100, after: 100 },
                                });
                                docContent.push(descriptionParagraph);
                            }

                            break;
                        }
                    case 4:
                        {
                            const blankCount = question.answer_items.length;
                            let blanks = '';
                            for (let i = 0; i < blankCount; i++) {
                                blanks += '（____）';
                            }

                            docContent.push(
                                new Paragraph({
                                    text: blanks,
                                    spacing: { before: 100, after: 100 },
                                })
                            );

                            const answers = question.answer_items.map(item => parseRichTextToPlainText(item.answer)).join('|');
                            docContent.push(
                                new Paragraph({
                                    text: `答案：${answers}`,
                                    spacing: { before: 100, after: 100 },
                                })
                            );

                            if (question.description && question.description !== '{}') {
                                const descriptionRuns = await parseRichTextContent(question.description);
                                const descriptionParagraph = new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: '解析：',
                                            bold: true,
                                        }),
                                        ...descriptionRuns,
                                    ],
                                    spacing: { before: 100, after: 100 },
                                });
                                docContent.push(descriptionParagraph);
                            }

                            break;
                        }
                    case 6:
                        {
                            const answers = question.answer_items.map(item => parseRichTextToPlainText(item.answer)).join('；');
                            docContent.push(
                                new Paragraph({
                                    text: `答案：${answers}`,
                                    spacing: { before: 100, after: 100 },
                                })
                            );

                            if (question.description && question.description !== '{}') {
                                const descriptionRuns = await parseRichTextContent(question.description);
                                const descriptionParagraph = new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: '解析：',
                                            bold: true,
                                        }),
                                        ...descriptionRuns,
                                    ],
                                    spacing: { before: 100, after: 100 },
                                });
                                docContent.push(descriptionParagraph);
                            }

                            break;
                        }

                    case 9:
                        {
                            if (question.subQuestions && question.subQuestions.length > 0) {
                                for (let subIndex = 0; subIndex < question.subQuestions.length; subIndex++) {
                                    const subQuestion = question.subQuestions[subIndex];

                                    const subQuestionNumber = `${index + 1}.${subIndex + 1}、`;
                                    const subTitleRuns = await parseRichTextContent(subQuestion.title);
                                    docContent.push(
                                        new Paragraph({
                                            children: [
                                                new TextRun({
                                                    text: subQuestionNumber,
                                                    bold: true,
                                                }),
                                                ...subTitleRuns
                                            ],
                                            spacing: { before: 200 }
                                        })
                                    );

                                    switch (subQuestion.type) {
                                        case 1:
                                        case 2: {
                                            const options = subQuestion.answer_items.map((item, idx) => {
                                                const optionLetter = String.fromCharCode(65 + idx);
                                                return {
                                                    letter: optionLetter,
                                                    content: item.value
                                                };
                                            });

                                            for (const option of options) {
                                                const optionRuns = await parseRichTextContent(option.content);
                                                docContent.push(
                                                    new Paragraph({
                                                        children: [
                                                            new TextRun({
                                                                text: `${option.letter}. `,
                                                                bold: true
                                                            }),
                                                            ...optionRuns
                                                        ]
                                                    })
                                                );
                                            }

                                            const correctOptions = subQuestion.answer_items
                                                .map((item, idx) => item.answer_checked === 2 ? String.fromCharCode(65 + idx) : null)
                                                .filter(item => item !== null)
                                                .join('');

                                            docContent.push(
                                                new Paragraph({
                                                    text: `答案：${correctOptions}`,
                                                    spacing: { before: 100, after: 100 }
                                                })
                                            );
                                            break;
                                        }
                                        case 4: {
                                            const blankCount = subQuestion.answer_items.length;
                                            let blanks = '';
                                            for (let i = 0; i < blankCount; i++) {
                                                blanks += '（____）';
                                            }

                                            docContent.push(
                                                new Paragraph({
                                                    text: blanks,
                                                    spacing: { before: 100, after: 100 }
                                                })
                                            );

                                            const answers = subQuestion.answer_items
                                                .map(item => parseRichTextToPlainText(item.answer))
                                                .join('|');

                                            docContent.push(
                                                new Paragraph({
                                                    text: `答案：${answers}`,
                                                    spacing: { before: 100, after: 100 }
                                                })
                                            );
                                            break;
                                        }
                                        case 5: {
                                            const isCorrect = subQuestion.answer_items
                                                .some(item => item.answer_checked === 2 &&
                                                    (item.value === '正确' || item.value.toLowerCase() === 'true'));
                                            const answerText = isCorrect ? '对' : '错';

                                            docContent.push(
                                                new Paragraph({
                                                    text: `答案：${answerText}`,
                                                    spacing: { before: 100, after: 100 }
                                                })
                                            );
                                            break;
                                        }
                                        case 6: {
                                            const answers = subQuestion.answer_items
                                                .map(item => parseRichTextToPlainText(item.answer))
                                                .join('；');

                                            docContent.push(
                                                new Paragraph({
                                                    text: `答案：${answers}`,
                                                    spacing: { before: 100, after: 100 }
                                                })
                                            );
                                            break;
                                        }
                                    }

                                    if (subQuestion.description && subQuestion.description !== '{}') {
                                        const descriptionRuns = await parseRichTextContent(subQuestion.description);
                                        docContent.push(
                                            new Paragraph({
                                                children: [
                                                    new TextRun({
                                                        text: '解析：',
                                                        bold: true
                                                    }),
                                                    ...descriptionRuns
                                                ],
                                                spacing: { before: 100, after: 100 }
                                            })
                                        );
                                    }

                                    docContent.push(
                                        new Paragraph({
                                            text: '',
                                            spacing: { after: 200 }
                                        })
                                    );
                                }
                            }
                            break;
                        }
                    case 12:
                        {
                            const options = question.answer_items.map((item, idx) => {
                                const optionLetter = String.fromCharCode(65 + idx);
                                return {
                                    letter: optionLetter,
                                    content: item.value,
                                    originalIndex: idx,
                                };
                            });

                            for (const option of options) {
                                const optionRuns = await parseRichTextContent(option.content);
                                const optionParagraph = new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: `${option.letter}. `,
                                            bold: true,
                                        }),
                                        ...optionRuns,
                                    ],
                                });
                                docContent.push(optionParagraph);
                            }

                            const sortedItems = question.answer_items.slice().sort((a, b) => parseInt(a.answer) - parseInt(b.answer));

                            const answerLetters = sortedItems.map(item => {
                                const originalIndex = question.answer_items.indexOf(item);
                                return String.fromCharCode(65 + originalIndex);
                            }).join('');

                            docContent.push(
                                new Paragraph({
                                    text: `答案：${answerLetters}`,
                                    spacing: { before: 100, after: 100 },
                                })
                            );

                            if (question.description && question.description !== '{}') {
                                const descriptionRuns = await parseRichTextContent(question.description);
                                const descriptionParagraph = new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: '解析：',
                                            bold: true,
                                        }),
                                        ...descriptionRuns,
                                    ],
                                    spacing: { before: 100, after: 100 },
                                });
                                docContent.push(descriptionParagraph);
                            }

                            break;
                        }
                    case 13:
                        {
                            const leftItems = question.answer_items.filter(item => !item.is_target_opt);
                            const rightItems = question.answer_items.filter(item => item.is_target_opt);

                            docContent.push(new Paragraph({ text: "左侧选项：" }));
                            leftItems.forEach((leftItem, index) => {
                                const leftContent = parseRichTextToPlainText(leftItem.value);
                                docContent.push(new Paragraph({
                                    text: `左${index + 1}：${leftContent}`,
                                }));
                            });

                            docContent.push(new Paragraph({ text: "右侧选项：" }));
                            rightItems.forEach((rightItem, index) => {
                                const rightContent = parseRichTextToPlainText(rightItem.value);
                                docContent.push(new Paragraph({
                                    text: `右${index + 1}：${rightContent}`,
                                }));
                            });

                            const answerText = '答案：' + leftItems.map((leftItem, leftIndex) => {
                                const leftOptionNumber = `左${leftIndex + 1}`;
                                const matchedRightIds = leftItem.answer ? leftItem.answer.toString().split(',') : [];
                                const matchedRightNumbers = matchedRightIds.map((id) => {
                                    const rightIndex = rightItems.findIndex(item => item.id === id);
                                    return rightIndex >= 0 ? `右${rightIndex + 1}` : '';
                                }).join('、');
                                return `${leftOptionNumber} - ${matchedRightNumbers}`;
                            }).join('|');

                            docContent.push(
                                new Paragraph({
                                    text: answerText,
                                    spacing: { before: 100, after: 100 },
                                })
                            );

                            if (question.description && question.description !== '{}') {
                                const descriptionRuns = await parseRichTextContent(question.description);
                                const descriptionParagraph = new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: '解析：',
                                            bold: true,
                                        }),
                                        ...descriptionRuns,
                                    ],
                                    spacing: { before: 100, after: 100 },
                                });
                                docContent.push(descriptionParagraph);
                            }

                            break;
                        }

                    default:
                        {
                            docContent.push(new Paragraph({
                                text: "该题型暂不支持查看答案。",
                                spacing: { before: 100, after: 100 },
                            }));

                            if (question.description && question.description !== '{}') {
                                const descriptionRuns = await parseRichTextContent(question.description);
                                const descriptionParagraph = new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: '解析：',
                                            bold: true,
                                        }),
                                        ...descriptionRuns,
                                    ],
                                    spacing: { before: 100, after: 100 },
                                });
                                docContent.push(descriptionParagraph);
                            }

                            break;
                        }
                }

                docContent.push(new Paragraph({ text: "", spacing: { after: 200 } }));
            }

            const doc = new Document({
                creator: "小雅答答答",
                description: `导出的作业答案 - ${assignmentTitle}`,
                title: assignmentTitle,
                numbering: {
                    config: [
                        {
                            reference: "default",
                            levels: [
                                {
                                    level: 0,
                                    format: "decimal",
                                    text: "%1.",
                                    alignment: AlignmentType.START,
                                },
                            ],
                        },
                    ],
                },
                styles: {
                    default: {
                        document: {
                            run: {
                                font: "Microsoft YaHei",
                                size: 24,
                            },
                        },
                    },
                    paragraphStyles: [
                        {
                            id: "Normal",
                            name: "Normal",
                            run: {
                                font: "Microsoft YaHei",
                                size: 24,
                            },
                            paragraph: {
                                spacing: { line: 360, before: 0, after: 0 },
                            },
                        },
                        {
                            id: "Heading1",
                            name: "Heading 1",
                            basedOn: "Normal",
                            next: "Normal",
                            quickFormat: true,
                            run: {
                                font: "Microsoft YaHei",
                                size: 32,
                                bold: true,
                            },
                            paragraph: {
                                spacing: { before: 240, after: 120 },
                            },
                        },
                    ],
                },
                sections: [
                    {
                        properties: {
                            page: {
                                margin: { top: 720, right: 720, bottom: 720, left: 720 },
                                size: {
                                    width: 11906,
                                    height: 16838,
                                },
                            },
                        },
                        children: docContent,
                    },
                ],
                compatibility: {
                    doNotExpandShiftReturn: true,
                    useWord2013TrackBottomHyphenation: true,
                    compatibilityMode: 15,
                    useFELayout: true,
                },
                settings: {
                    compatibility: {
                        useFELayout: true,
                        useNormalStyleForList: true,
                        doNotUseIndentAsNumberingTabStop: true,
                        balanceSingleByteDoubleByteWidth: true
                    }
                }
            });

            Packer.toBlob(doc).then((blob) => {
                let safeTitle = assignmentTitle.replace(/[\\/:*?"<>|]/g, '_');
                window.saveAs(blob, `${safeTitle}.docx`);
                showNotification('已成功导出，如需导入其他题库，请手动编辑保存一次以确保被准确识别。', { type: 'success', keywords: ['导出', '成功', '题库'] });
            }).catch((error) => {
                console.error('导出失败：', error);
                showNotification('导出失败，请查看控制台日志。', { type: 'error', keywords: ['导出', '失败', '日志'] });
            });

        } catch (error) {
            console.error('An error occurred in exportHomework:', error);
            showNotification('导出失败，请查看控制台日志。', { type: 'error', keywords: ['导出', '失败', '日志'] });
        }
    }

    async function parseRichTextContent(content) {
        let result = [];
        try {
            let jsonContent = JSON.parse(content);

            for (const block of jsonContent.blocks) {
                if (block.type === 'atomic' && block.data && block.data.type === 'IMAGE') {
                    let imageSrc = block.data.src;
                    let fileIdMatch = imageSrc.match(/\/cloud\/file_access\/(\d+)/);
                    if (fileIdMatch && fileIdMatch[1]) {
                        let fileId = fileIdMatch[1];
                        let randomParam = Date.now();
                        let imageUrl = `${window.location.origin}/api/jx-oresource/cloud/file_access/${fileId}?random=${randomParam}`;
                        const imageData = await fetchImageData(imageUrl);
                        if (imageData) {
                            const imageSize = await getImageSize(imageData);
                            if (imageSize) {
                                let { width, height } = imageSize;
                                const maxWidth = 500;
                                if (width > maxWidth) {
                                    const ratio = maxWidth / width;
                                    width = maxWidth;
                                    height = height * ratio;
                                }
                                result.push(
                                    new ImageRun({
                                        data: imageData,
                                        transformation: {
                                            width: width,
                                            height: height,
                                        },
                                    })
                                );
                            } else {
                                result.push(new TextRun('[无法加载图片]'));
                            }
                        } else {
                            result.push(new TextRun('[无法加载图片]'));
                        }
                    } else {
                        result.push(new TextRun('[无法解析图片链接]'));
                    }
                } else if (block.text) {
                    result.push(new TextRun({
                        text: block.text,
                        font: "Microsoft YaHei",
                        eastAsia: "Microsoft YaHei"
                    }));
                }
            }

        } catch (e) {
            const sanitizedContent = content.replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '');
            if (sanitizedContent) {
                result.push(new TextRun({
                    text: sanitizedContent,
                    font: "Microsoft YaHei"
                }));
            }
        }
        return result;
    }

    function parseRichTextToPlainText(content) {
        try {
            let jsonContent = JSON.parse(content);
            let result = '';
            jsonContent.blocks.forEach((block) => {
                result += block.text + '\n';
            });
            return result.trim();
        } catch (e) {
            return content;
        }
    }

    async function getImageSize(imageData) {
        return new Promise((resolve, reject) => {
            const blob = new Blob([imageData]);
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = function () {
                const width = img.width;
                const height = img.height;
                URL.revokeObjectURL(url);
                resolve({ width, height });
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('Cannot load image'));
            };
            img.src = url;
        });
    }

    async function fetchImageData(url) {
        try {
            const response = await fetch(url, {
                method: 'GET'
            });

            if (response.ok) {
                const blob = await response.blob();
                return await blob.arrayBuffer();
            } else {
                console.error('获取图片失败：', response.statusText);
                return null;
            }
        } catch (error) {
            console.error('fetchImageData Error:', error);
            return null;
        }
    }

    function checkAndExecuteAuto() {
        const taskElement = document.querySelector('#xy_app_content > div.ta-frame > div.ta_panel.ta_panel_group.ta_group > section > section > main > div > div.group-resource-header.flex_panel.hor > div.flex_align_center > div.entry_task_btn');

        if (taskElement && autoFetchEnabled) {
            if (!isActivated) {
                showNotification('请先激活后再使用自动功能', {
                    type: 'warning',
                    keywords: ['激活', '自动功能']
                });
                return;
            }

            showNotification('正在自动获取答案...', {
                type: 'info',
                keywords: ['自动', '获取', '答案']
            });

            getAndStoreAnswers().then(() => {
                if (autoFillEnabled) {
                    setTimeout(fillAnswers, 1000);
                }
            });
        }
    }

    function detectPageChange() {
        let lastUrl = location.href;
        const observer = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(checkAndExecuteAuto, 1000);
            }
        });
        observer.observe(document, { subtree: true, childList: true });
    }

    detectPageChange();

})();