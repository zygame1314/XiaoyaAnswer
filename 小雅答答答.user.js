// ==UserScript==
// @name         小雅答答答
// @license      MIT
// @version      2.10.5
// @description  小雅平台学习助手 📖，智能整理归纳学习资料 📚，辅助完成练习 💪，并提供便捷的查阅和修改功能 📝！
// @author       Yi
// @match        https://*.ai-augmented.com/*
// @icon         https://www.ai-augmented.com/static/logo3.1dbbea8f.png
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @run-at       document-start
// @connect      *
// @require      https://cdn.jsdmirror.com/npm/katex@0.16.9/dist/katex.min.js
// @require      https://cdn.jsdmirror.com/npm/docx@7.1.0/build/index.min.js
// @require      https://cdn.jsdmirror.com/npm/file-saver@2.0.5/dist/FileSaver.min.js
// @require      https://cdn.jsdmirror.com/npm/js-md5@0.8.3/src/md5.min.js
// @require      https://cdn.jsdmirror.com/npm/crypto-js@4.2.0/crypto-js.js
// @require      https://cdn.jsdmirror.com/npm/crypto-js@4.2.0/hmac-sha1.js
// @require      https://cdn.jsdmirror.com/npm/dom-to-image-more@3.2.0/dist/dom-to-image-more.min.js
// @require      https://cdn.jsdmirror.com/npm/katex@0.16.9/dist/contrib/auto-render.min.js
// @homepageURL  https://xiaoya.zygame1314.site
// ==/UserScript==

(function () {
    'use strict';
    const localStorage = {
        getItem: (key) => GM_getValue(key, null),
        setItem: (key, value) => GM_setValue(key, value),
        removeItem: (key) => GM_deleteValue(key)
    };
    const RuntimePatcher = {
        _nativeRefs: {
            dispatchEvent: window.dispatchEvent,
            removeItem: Storage.prototype.removeItem,
            register: navigator.serviceWorker.register,
            fetch: window.fetch,
            xhrOpen: XMLHttpRequest.prototype.open,
            xhrSend: XMLHttpRequest.prototype.send,
            sendBeacon: navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null
        },
        _decode: (str) => decodeURIComponent(escape(atob(str))),
        _clearStaleWorkers: function () {
            if ('serviceWorker' in navigator) {
                const swTargetName = this._decode('Z2xvYmFsLXNlcnZpY2Utd29ya2VyLmpz');
                navigator.serviceWorker.getRegistrations().then(registrations => {
                    for (let registration of registrations) {
                        if (registration.active && registration.active.scriptURL.includes(swTargetName)) {
                            registration.unregister().then(success => {
                                if (success) {
                                    console.log('[运行时] 已注销过期的 service worker，正在刷新页面以生效。');
                                    location.reload();
                                }
                            });
                        }
                    }
                });
            }
        },
        _applyEventShim: function () {
            const nativeDispatch = this._nativeRefs.dispatchEvent;
            const patchedDispatch = function (...args) {
                return nativeDispatch.apply(window, args);
            };
            Object.defineProperty(patchedDispatch, 'toString', {
                value: () => 'function dispatchEvent() { [native code] }',
                configurable: true,
            });
            window.dispatchEvent = patchedDispatch;
        },
        _manageWorkerLifecycle: function () {
            const nativeRegister = this._nativeRefs.register;
            const swTargetName = this._decode('Z2xvYmFsLXNlcnZpY2Utd29ya2VyLmpz');
            navigator.serviceWorker.register = function (scriptURL, options) {
                if (typeof scriptURL === 'string' && scriptURL.includes(swTargetName)) {
                    console.error(`[运行时] 阻止了受限的 service worker 注册:`, scriptURL);
                    return Promise.reject(new DOMException('当前运行时策略不允许注册。', 'SecurityError'));
                }
                return nativeRegister.apply(navigator.serviceWorker, arguments);
            };
            Object.defineProperty(navigator.serviceWorker.register, 'toString', {
                value: () => 'function register() { [native code] }',
                configurable: true,
            });
        },
        _setupUIMonitor: function () {
            const modalSignature = this._decode('5qGI5rWL5Yiw5q2j5Zyo5L2/55So5by655S15bel5YW3');
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE && node.textContent.includes(modalSignature)) {
                            const modalRoot = node.closest('div[style*="z-index"]');
                            if (modalRoot) {
                                console.warn('[运行时] 检测到并移除了侵入式 UI 弹窗。');
                                modalRoot.remove();
                            }
                        }
                    }
                }
            });
            const startObserver = () => {
                if (document.body) {
                    observer.observe(document.body, { childList: true, subtree: true });
                } else {
                    setTimeout(startObserver, 50);
                }
            };
            startObserver();
        },
        _initNetworkInterceptor: function () {
            const self = this;
            const blockedHostname = 'log.aliyuncs.com';
            const SUBMIT_URL_SIGNATURE = '/api/jx-iresource/survey/submit';
            const SUBMISSION_CONTRIBUTION_DELAY = 5000;
            const makeNative = (func, name) => {
                try {
                    Object.defineProperty(func, 'toString', {
                        value: () => `function ${name}() { [native code] }`,
                        configurable: true,
                        writable: true
                    });
                } catch (e) {
                    console.warn(`[运行时] 无法伪装 ${name}:`, e);
                }
            };
            const protectProperty = (target, key, initialValue) => {
                let internalValue = initialValue;
                makeNative(internalValue, key);
                try {
                    Object.defineProperty(target, key, {
                        get: () => internalValue,
                        set: (newValue) => {
                            console.log(`[反检测] 拦截到对 ${key} 的重写，正在重新应用伪装...`);
                            internalValue = newValue;
                            makeNative(internalValue, key);
                        },
                        configurable: true
                    });
                } catch (e) {
                    console.warn(`[运行时] 无法保护属性 ${key}:`, e);
                    target[key] = internalValue;
                }
            };
            async function triggerImmediateContribution(groupId, nodeId) {
                if (!autoContributeEnabled) {
                    console.log('[自动贡献] 检测到作业提交，但自动贡献功能已关闭，跳过。');
                    return;
                }
                if (!groupId || !nodeId) {
                    console.warn('[自动贡献] 无法从当前页面URL获取 groupId 或 nodeId，贡献中止。');
                    return;
                }
                const sessionKey = `submitted_and_contributed_${groupId}_${nodeId}`;
                if (sessionStorage.getItem(sessionKey)) {
                    console.log(`[自动贡献] 作业 (G:${groupId}, N:${nodeId}) 在本次会话中已提交并贡献过，跳过重复触发。`);
                    return;
                }
                const NOTIFICATION_ID = `contribution-after-submit-${groupId}-${nodeId}`;
                showNotification(
                    '作业提交成功！请不要关闭页面，后台正在为你准备并贡献答案...',
                    {
                        type: 'info',
                        duration: 0,
                        id: NOTIFICATION_ID,
                        animation: 'scale'
                    }
                );
                for (let i = SUBMISSION_CONTRIBUTION_DELAY / 1000; i > 0; i--) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    showNotification(
                        `请勿关闭页面... 正在等待服务器批改 (剩余 ${i} 秒)`,
                        { type: 'info', duration: 0, id: NOTIFICATION_ID }
                    );
                }
                showNotification('服务器已批改，正在贡献答案...', { type: 'info', duration: 0, id: NOTIFICATION_ID });
                try {
                    const result = await contributeSingleAssignment(groupId, nodeId);
                    if (result.success) {
                        showNotification(`✅ 答案已成功贡献。现在可以安全关闭页面了。`, {
                            type: 'success',
                            duration: 10000,
                            id: NOTIFICATION_ID
                        });
                        sessionStorage.setItem(sessionKey, 'true');
                    } else {
                        showNotification(`⚠️ 答案贡献失败: ${result.error}。现在可以关闭页面了。`, {
                            type: 'warning',
                            duration: 10000,
                            id: NOTIFICATION_ID
                        });
                        console.warn(`[自动贡献] 提交后贡献失败: ${result.error}`);
                    }
                } catch (error) {
                    showNotification(`💥 答案贡献时发生严重错误。现在可以关闭页面了。`, {
                        type: 'error',
                        duration: 10000,
                        id: NOTIFICATION_ID
                    });
                    console.error(`[自动贡献] 提交后贡献时发生严重错误:`, error);
                }
            }
            const hookedFetch = function (input, init) {
                const nativeFetch = self._nativeRefs.fetch;
                let urlStr;
                if (typeof input === 'string') { urlStr = input; }
                else if (input instanceof Request) { urlStr = input.url; }
                else { urlStr = String(input); }
                try {
                    const urlObj = new URL(urlStr, window.location.origin);
                    if (urlObj.hostname.endsWith(blockedHostname)) {
                        console.warn(`[运行时] 阻止了向日志服务器的 fetch 请求:`, urlStr);
                        return Promise.resolve(new Response('{"success":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
                    }
                    if (urlObj.hostname === 'static-publication.ai-augmented.com' && /\.(woff|woff2|ttf|eot)$/i.test(urlObj.pathname)) {
                        console.warn(`[运行时] 阻止了跨域字体请求 (fetch) 以避免 CORS 错误:`, urlStr);
                        return Promise.resolve(new Response(new Blob([], { type: 'font/woff' }), { status: 200 }));
                    }
                    if (urlStr.includes(SUBMIT_URL_SIGNATURE) && init && (init.method || '').toUpperCase() === 'POST') {
                        console.log('[自动贡献] 检测到作业提交请求 (fetch)，将在其成功后触发贡献。');
                        const originalFetchPromise = nativeFetch.apply(window, arguments);
                        originalFetchPromise.then(response => {
                            const clonedResponse = response.clone();
                            if (clonedResponse.ok) {
                                clonedResponse.json().then(data => {
                                    if (data.success) {
                                        const groupId = getGroupIDFromUrl(window.location.href);
                                        const nodeId = getNodeIDFromUrl(window.location.href);
                                        triggerImmediateContribution(groupId, nodeId);
                                    }
                                });
                            }
                        }).catch(err => {
                            console.warn('[自动贡献] 作业提交请求 (fetch) 失败，不触发贡献。', err);
                        });
                        return originalFetchPromise;
                    }
                } catch (e) {
                    console.warn('[运行时] 解析 fetch 目标 URL 时发生异常，回退至原生 fetch：', e);
                }
                return nativeFetch.apply(window, arguments);
            };
            protectProperty(window, 'fetch', hookedFetch);
            const hookedXhrOpen = function (method, url, ...rest) {
                this._requestURL = url;
                return self._nativeRefs.xhrOpen.apply(this, arguments);
            };
            protectProperty(XMLHttpRequest.prototype, 'open', hookedXhrOpen);
            const hookedXhrSend = function (body) {
                if (this._requestURL) {
                    try {
                        const urlObj = new URL(this._requestURL, window.location.origin);
                        if (urlObj.hostname.endsWith(blockedHostname)) {
                            console.warn(`[运行时] 阻止了向日志服务器的 XMLHttpRequest 请求:`, this._requestURL);
                            Object.defineProperties(this, { 'readyState': { value: 4, writable: true }, 'status': { value: 200, writable: true }, 'responseText': { value: '{"success":true}', writable: true }, 'response': { value: '{"success":true}', writable: true } });
                            this.dispatchEvent(new Event('readystatechange'));
                            this.dispatchEvent(new Event('load'));
                            return;
                        }
                        if (urlObj.hostname === 'static-publication.ai-augmented.com' && /\.(woff|woff2|ttf|eot)$/i.test(urlObj.pathname)) {
                            console.warn(`[运行时] 阻止了跨域字体请求以避免 CORS 错误:`, this._requestURL);
                            Object.defineProperties(this, {
                                'readyState': { value: 4, writable: true },
                                'status': { value: 200, writable: true },
                                'responseText': { value: '', writable: true },
                                'response': { value: new Blob([], { type: 'font/woff' }), writable: true }
                            });
                            this.dispatchEvent(new Event('readystatechange'));
                            this.dispatchEvent(new Event('load'));
                            return;
                        }
                        if (this._requestURL.includes(SUBMIT_URL_SIGNATURE)) {
                            console.log('[自动贡献] 检测到作业提交请求 (XHR)，将在其成功后触发贡献。');
                            this.addEventListener('load', async function () {
                                if (this.status >= 200 && this.status < 300) {
                                    let responseText;
                                    if (this.responseType === '' || this.responseType === 'text') {
                                        responseText = this.responseText;
                                    } else if (this.responseType === 'blob') {
                                        try {
                                            responseText = await this.response.text();
                                        } catch (blobError) {
                                            console.warn('[自动贡献] 读取Blob响应时出错', blobError);
                                            return;
                                        }
                                    } else {
                                        console.warn(`[自动贡献] 无法处理响应类型 '${this.responseType}'，跳过。`);
                                        return;
                                    }
                                    try {
                                        const data = JSON.parse(responseText);
                                        if (data.success) {
                                            const groupId = getGroupIDFromUrl(window.location.href);
                                            const nodeId = getNodeIDFromUrl(window.location.href);
                                            triggerImmediateContribution(groupId, nodeId);
                                        }
                                    } catch (e) {
                                        console.warn('[自动贡献] 解析XHR提交响应失败，不触发贡献。', e);
                                    }
                                }
                            }, { once: true });
                        }
                    } catch (e) {
                        console.error('[运行时] 处理 XMLHttpRequest URL 时发生异常，回退至原始 send：', e);
                    }
                }
                return self._nativeRefs.xhrSend.apply(this, arguments);
            };
            protectProperty(XMLHttpRequest.prototype, 'send', hookedXhrSend);
            if (self._nativeRefs.sendBeacon) {
                const hookedSendBeacon = function (url, data) {
                    try {
                        const urlObj = new URL(url, window.location.origin);
                        if (urlObj.hostname.endsWith(blockedHostname)) {
                            console.warn(`[运行时] 阻止了向日志服务器的 sendBeacon 请求:`, url);
                            return true;
                        }
                    } catch (e) {
                        console.warn('[运行时] sendBeacon URL 解析失败，回退至原生实现：', e);
                    }
                    try {
                        return self._nativeRefs.sendBeacon.call(navigator, url, data);
                    } catch (err) {
                        console.error('[运行时] 调用原生 sendBeacon 失败：', err);
                        return false;
                    }
                };
                protectProperty(navigator, 'sendBeacon', hookedSendBeacon);
            }
            console.log('[运行时] 网络请求拦截器已部署。');
        },
        run: function () {
            console.log('[运行时] 正在初始化运行时补丁...');
            this._clearStaleWorkers();
            this._applyEventShim();
            this._manageWorkerLifecycle();
            this._setupUIMonitor();
            this._initNetworkInterceptor();
            console.log('[运行时] 补丁已成功应用。');
        }
    };
    RuntimePatcher.run();
    const KATEX_RENDER_OPTIONS = {
        delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false },
            { left: '$', right: '$', display: false }
        ],
        throwOnError: false,
        trust: true,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
        ignoredClasses: ['katex']
    };
    const MATH_CONTENT_REGEX = /(?:\$\$|\\\[|\\\(|\\begin\{|\\frac|\\sqrt|\\sum|\\int|\\alpha|\\beta|\\gamma|_{|\\mathrm|\\left|\\right|\\pi|\\theta)/;
    const LATEX_IMAGE_ENDPOINT = 'https://latex.codecogs.com/png.image?';
    function applyMathRendering(rootElement) {
        if (!rootElement) return;
        if (typeof window.renderMathInElement !== 'function') return;
        try {
            window.renderMathInElement(rootElement, KATEX_RENDER_OPTIONS);
        } catch (error) {
            console.warn('[KaTeX] 渲染公式时出现问题:', error);
        }
    }
    const defaultPrompts = {
        '1': `
            你是一个用于解答单选题的 AI 助手。请根据以下题目和选项，选择唯一的正确答案。
            【题目类型】: {questionType}
            【题目内容】:
            {questionTitle}
            【选项】:
            {optionsText}
            ---
            【输出要求】:
            1. 你的回答必须严格遵守以下格式：仅包含唯一正确选项的字母（例如："A"）。
            2. 不要包含任何其他文字、解释、标点符号或空格。
            3. 在回答结束后，必须在新的一行输出一个JSON对象来提供你的置信度评分（1-5），格式为：{"confidence": 5}
            【示例】:
            A
            {"confidence": 5}
    `.trim(),
        '2': `
            你是一个用于解答多选题的 AI 助手。请根据以下题目和选项，选择所有正确的答案。
            【题目类型】: {questionType}
            【题目内容】:
            {questionTitle}
            【选项】:
            {optionsText}
            ---
            【输出要求】:
            1. 你的回答必须严格遵守以下格式：仅包含所有正确选项的字母，并用英文逗号分隔（例如："A,C"）。
            2. 不要包含任何其他文字、解释、标点符号或空格。
            3. 在回答结束后，必须在新的一行输出一个JSON对象来提供你的置信度评分（1-5），格式为：{"confidence": 4}
    `.trim(),
        '5': `
            你是一个用于解答判断题的 AI 助手。请根据以下题目，判断其表述是否正确。
            【题目类型】: {questionType}
            【题目内容】:
            {questionTitle}
            【选项】:
            A. 正确
            B. 错误
            ---
            【输出要求】:
            1. 你的回答必须严格遵守以下格式：仅包含唯一正确选项的字母（例如："A"）。
            2. 不要包含任何其他文字、解释、标点符号或空格。
            3. 在回答结束后，必须在新的一行输出一个JSON对象来提供你的置信度评分（1-5），格式为：{"confidence": 5}
    `.trim(),
        '4': `
            你是一个用于解答填空题的 AI 助手。请根据题目内容，为每一个空白处生成最合适的答案。
            【题目类型】: {questionType}
            【题目内容】:
            {questionTitle}
            ---
            【输出要求】:
            1. 你的回答必须是一个 JSON 数组，数组中的每个字符串元素按顺序对应题目中的每一个空白处。
            2. 不要包含任何其他文字、解释、标点符号或空格。
            3. 在 JSON 数组之后，必须在全新的一行输出另一个JSON对象来提供你的置信度评分（1-5），格式为：{"confidence": 3}
            【示例】:
            ["答案一", "答案二"]
            {"confidence": 3}
    `.trim(),
        '6': `
            你是一位精通各大学科的答题助手。请根据以下【{questionType}】的题目要求，生成一份简洁、准确、专业的答案。
            【题目】:
            {questionTitle}
            【我已有的答案草稿】(可参考或忽略):
            {answerContent}
            ---
            【生成要求】:
            1. 直接输出纯文本，不要包含任何额外的解释文字或 Markdown 格式化标记。
            2. 在所有答案内容结束后，必须在全新的一行输出一个JSON对象来提供你的置信度评分（1-5），格式为：{"confidence": 4}
            3. 不要在评分后添加任何额外内容。
    `.trim(),
        '10': `
            你是一位专业的编程助手。请根据以下【编程题】的要求，使用指定的编程语言生成完整的代码解决方案。
            【题目描述】:
            {questionTitle}
            【要求语言】: {language}
            【时间限制】: {max_time} ms
            【内存限制】: {max_memory} KB
            【我已有的代码】(可参考或忽略):
            {answerContent}
            ---
            【生成要求】:
            1. 直接输出纯代码文本，不要包含任何额外的解释文字或 Markdown 格式化标记。
            2. 在所有代码结束后，必须在全新的一行输出一个JSON对象来提供你的置信度评分（1-5），格式为：{"confidence": 5}
            3. 不要在评分后添加任何额外内容。
    `.trim(),
        '12': `
            你是一个用于解答排序题的 AI 助手。请根据题目要求，将给出的选项排列成正确的顺序。
            【题目类型】: {questionType}
            【题目内容】:
            {questionTitle}
            【需要排序的选项】:
            {optionsText}
            ---
            【输出要求】:
            1. 你的回答必须是一个 JSON 数组，其中包含表示正确顺序的选项字母。例如：["C", "A", "B"]
            2. 不要包含任何其他文字、解释、标点符号或空格。
            3. 在 JSON 数组之后，必须在全新的一行输出另一个JSON对象来提供你的置信度评分（1-5），格式为：{"confidence": 5}
    `.trim(),
        '13': `
            你是一个用于解答匹配题的 AI 助手。请为左侧列表的每一项，从右侧列表中选择最合适的匹配项。
            【题目类型】: {questionType}
            【题目内容】:
            {questionTitle}
            【左侧列表 (需要匹配的项)】:
            {stemsText}
            【右侧列表 (可用的选项)】:
            {optionsText}
            ---
            【输出要求】:
            1. 你的回答必须是一个 JSON 对象。例如: {"A": "b", "B": "a", "C": "d"}
            2. 不要包含任何其他文字、解释、标点符号或空格。
            3. 在 JSON 对象之后，必须在全新的一行输出另一个JSON对象来提供你的置信度评分（1-5），格式为：{"confidence": 4}
    `.trim()
    };
    const SCRIPT_CONFIG = {
        priorityApiBaseUrl: 'https://xiaoya-get-cdn.zygame1314.site',
        remoteConfigUrls: [
            'https://gist.githubusercontent.com/zygame1314/5e8a64928374c3fcc88a235f8f75d6e7/raw/xiaoya-config.json',
            'https://gh-proxy.com/gist.githubusercontent.com/zygame1314/5e8a64928374c3fcc88a235f8f75d6e7/raw/xiaoya-config.json',
            'https://ghfast.top/gist.githubusercontent.com/zygame1314/5e8a64928374c3fcc88a235f8f75d6e7/raw/xiaoya-config.json'
        ],
        defaultApiBaseUrl: 'https://xiaoya-manage.zygame1314-666.top',
        cachedApiBaseUrl: null,
        lastFetchTimestamp: 0,
        cacheDuration: 300000
    };
    const HealthCheckVisualizer = {
        container: null,
        groups: {},
        _createContainer() {
            if (this.container) return;
            this.container = document.createElement('div');
            this.container.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(0, 0, 0, 0.75);
                padding: 12px 20px;
                border-radius: 20px;
                z-index: 100001;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.25);
                backdrop-filter: blur(6px);
                transition: opacity 0.4s ease, transform 0.4s ease;
                opacity: 0;
                transform: translateX(-50%) translateY(20px);
                font-family: Microsoft YaHei;
            `;
            document.body.appendChild(this.container);
            requestAnimationFrame(() => {
                this.container.style.opacity = '1';
                this.container.style.transform = 'translateX(-50%) translateY(0)';
            });
        },
        addGroup(groupId, label, urls, isPriority = false) {
            this._createContainer();
            if (this.groups[groupId]) return;
            const groupDiv = document.createElement('div');
            groupDiv.style.cssText = `display: flex; align-items: center; gap: 12px;`;
            const labelSpan = document.createElement('span');
            labelSpan.textContent = label;
            labelSpan.style.color = '#fff';
            labelSpan.style.fontSize = '13px';
            labelSpan.style.fontWeight = 'bold';
            groupDiv.appendChild(labelSpan);
            const dotsContainer = document.createElement('div');
            dotsContainer.style.cssText = `display: flex; align-items: center; gap: 8px;`;
            groupDiv.appendChild(dotsContainer);
            const dots = urls.map(() => {
                const dot = document.createElement('div');
                dot.style.cssText = `
                    width: ${isPriority ? '14px' : '12px'};
                    height: ${isPriority ? '14px' : '12px'};
                    border-radius: 50%;
                    background-color: #9ca3af;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    ${isPriority ? 'border: 2px solid rgba(251, 191, 36, 0.5);' : ''}
                `;
                dotsContainer.appendChild(dot);
                return dot;
            });
            this.container.appendChild(groupDiv);
            this.groups[groupId] = { groupDiv, labelSpan, dots };
        },
        updateDot(groupId, index, status) {
            if (!this.groups[groupId] || !this.groups[groupId].dots[index]) return;
            const group = this.groups[groupId];
            const dot = group.dots[index];
            dot.getAnimations().forEach(anim => anim.cancel());
            const colors = {
                testing: '#f59e0b',
                success: '#22c55e',
                failure: '#ef4444'
            };
            dot.style.backgroundColor = colors[status];
            dot.style.transform = 'scale(1)';
            switch (status) {
                case 'testing':
                    group.labelSpan.textContent = group.labelSpan.textContent.replace('...', '中...');
                    dot.animate([
                        { transform: 'scale(1.0)', opacity: 0.7 },
                        { transform: 'scale(1.3)', opacity: 1 },
                        { transform: 'scale(1.0)', opacity: 0.7 }
                    ], {
                        duration: 1200,
                        iterations: Infinity,
                        easing: 'ease-in-out'
                    });
                    break;
                case 'success':
                    dot.animate([
                        { transform: 'scale(1.4)', backgroundColor: '#a7f3d0' },
                        { transform: 'scale(1)' }
                    ], {
                        duration: 400,
                        easing: 'ease-out'
                    });
                    break;
                case 'failure':
                    dot.animate([
                        { transform: 'translateX(-3px)' },
                        { transform: 'translateX(3px)' },
                        { transform: 'translateX(-2px)' },
                        { transform: 'translateX(2px)' },
                        { transform: 'translateX(0)' }
                    ], {
                        duration: 300,
                        easing: 'ease-in-out'
                    });
                    break;
            }
        },
        updateGroupLabel(groupId, newLabel) {
            if (this.groups[groupId]) {
                this.groups[groupId].labelSpan.textContent = newLabel;
            }
        },
        destroy() {
            if (this.container) {
                this.container.style.opacity = '0';
                this.container.style.transform = 'translateX(-50%) translateY(20px)';
                setTimeout(() => {
                    if (this.container && this.container.parentNode) {
                        this.container.parentNode.removeChild(this.container);
                    }
                    this.container = null;
                    this.groups = {};
                }, 400);
            }
        }
    };
    const ContributionProgressUI = {
        ring: null,
        progressCircle: null,
        radius: 36,
        circumference: 0,
        container: null,
        mainBall: null,
        originalTitle: '',
        init(menuContainer) {
            if (this.ring) return;
            this.container = menuContainer;
            this.mainBall = menuContainer.querySelector('.xiaoya-main-ball');
            this.originalTitle = this.mainBall.title || '小雅答答答';
            this.circumference = 2 * Math.PI * this.radius;
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '80');
            svg.setAttribute('height', '80');
            svg.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-90deg);
                z-index: -1;
                display: none;
                opacity: 0;
                transition: opacity 0.4s ease;
            `;
            this.ring = svg;
            const trackCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            trackCircle.setAttribute('cx', '40');
            trackCircle.setAttribute('cy', '40');
            trackCircle.setAttribute('r', this.radius);
            trackCircle.setAttribute('stroke', 'rgba(0, 0, 0, 0.1)');
            trackCircle.setAttribute('stroke-width', '5');
            trackCircle.setAttribute('fill', 'transparent');
            svg.appendChild(trackCircle);
            this.progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            this.progressCircle.setAttribute('cx', '40');
            this.progressCircle.setAttribute('cy', '40');
            this.progressCircle.setAttribute('r', this.radius);
            this.progressCircle.setAttribute('stroke', '#4F46E5');
            this.progressCircle.setAttribute('stroke-width', '5');
            this.progressCircle.setAttribute('fill', 'transparent');
            this.progressCircle.setAttribute('stroke-linecap', 'round');
            this.progressCircle.style.strokeDasharray = `${this.circumference} ${this.circumference}`;
            this.progressCircle.style.strokeDashoffset = this.circumference;
            this.progressCircle.style.transition = 'stroke-dashoffset 0.5s ease-out, stroke 0.5s ease';
            svg.appendChild(this.progressCircle);
            this.container.appendChild(svg);
        },
        show(message = '开始后台扫描...') {
            if (!this.ring) return;
            this.ring.style.display = 'block';
            requestAnimationFrame(() => this.ring.style.opacity = '1');
            this.mainBall.style.animation = 'contribution-pulse 1.5s infinite';
            this.mainBall.title = message;
            this.update(0, 1);
        },
        update(current, total, courseName = '') {
            if (!this.ring) return;
            const percent = (current / total) * 100;
            const offset = this.circumference - (percent / 100) * this.circumference;
            this.progressCircle.style.strokeDashoffset = offset;
            this.mainBall.title = `[${current}/${total}] 正在扫描: ${courseName}`;
        },
        complete(message) {
            if (!this.ring) return;
            this.progressCircle.style.stroke = '#22c55e';
            this.mainBall.title = message;
            this._fadeOut();
        },
        error(message) {
            if (!this.ring) return;
            this.progressCircle.style.stroke = '#ef4444';
            this.mainBall.title = `错误: ${message}`;
            this._fadeOut(3000);
        },
        hide() {
            if (!this.ring) return;
            this._fadeOut();
        },
        _fadeOut(delay = 1500) {
            setTimeout(() => {
                this.ring.style.opacity = '0';
                this.mainBall.style.animation = '';
                setTimeout(() => {
                    this.ring.style.display = 'none';
                    this.progressCircle.style.stroke = '#4F46E5';
                    this.mainBall.title = this.originalTitle;
                }, 400);
            }, delay);
        }
    };
    const style = document.createElement('style');
    style.textContent = `
        @keyframes contribution-pulse {
            0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.5); }
            70% { box-shadow: 0 0 0 10px rgba(79, 70, 229, 0); }
            100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
        }
    `;
    document.head.appendChild(style);
    const {
        Document,
        Packer,
        Paragraph,
        HeadingLevel,
        AlignmentType,
        ImageRun,
        TextRun
    } = window.docx;
    function createDocxHyperlink(url, label) {
        try {
            const linkText = label || url;
            const d = window.docx || {};
            if (d.ExternalHyperlink) {
                return new d.ExternalHyperlink({
                    link: url,
                    children: [new TextRun({ text: linkText, style: 'Hyperlink' })],
                });
            }
            if (d.Hyperlink) {
                return new d.Hyperlink({ link: url, children: [new TextRun({ text: linkText, style: 'Hyperlink' })] });
            }
        } catch (e) {
            console.warn('创建超链接组件失败，回退为普通文本。', e);
        }
        return new TextRun({ text: label || url, color: '0000EE', underline: {} });
    }
    let autoFetchEnabled = String(localStorage.getItem('autoFetchEnabled')) === 'true';
    let autoFillEnabled = String(localStorage.getItem('autoFillEnabled')) === 'true';
    let autoContributeEnabled = String(localStorage.getItem('autoContributeEnabled')) !== 'false';
    let isProcessing = false;
    let currentBatchAbortController = null;
    const activeAIControllers = new Set();
    let debounceTimer = null;
    let sttCache = {};
    const latexImageCache = new Map();
    const mediaProcessingLocks = {};
    let videoCache = {};
    const videoProcessingLocks = {};
    const backgroundTaskManager = {
        isTaskRunning: false,
        isTaskScheduled: false,
        schedule() {
            if (sessionStorage.getItem('xiaoya_full_scan_done') === 'true') {
                console.log('[后台任务调度器] 本次会话已完成全量扫描，不再调度新任务。');
                return;
            }
            if (this.isTaskRunning || this.isTaskScheduled) {
                console.log('[后台任务调度器] 任务已在运行或计划中，忽略新的调度请求。');
                return;
            }
            console.log('[后台任务调度器] 收到新的后台任务请求，将在3秒后执行...');
            this.isTaskScheduled = true;
            setTimeout(async () => {
                if (this.isTaskRunning || sessionStorage.getItem('xiaoya_full_scan_done') === 'true') {
                    console.log('[后台任务调度器] 延迟后发现任务已运行或已完成，取消本次执行。');
                    this.isTaskScheduled = false;
                    return;
                }
                this.isTaskRunning = true;
                this.isTaskScheduled = false;
                try {
                    const scanCompleted = await backgroundContributeAllCourses();
                    if (scanCompleted) {
                        this.markAsCompleted();
                    }
                } catch (error) {
                    console.error('[后台任务调度器] 后台任务执行时发生未捕获的错误:', error);
                } finally {
                    this.isTaskRunning = false;
                    console.log('[后台任务调度器] 后台任务执行完毕，状态重置为空闲。');
                }
            }, 3000);
        },
        markAsCompleted() {
            console.log('[后台任务调度器] 全量扫描已成功完成，本次会话将不再触发。');
            sessionStorage.setItem('xiaoya_full_scan_done', 'true');
        }
    };
    function registerAIController(controller) {
        if (!controller) return;
        activeAIControllers.add(controller);
        console.log(`注册了一个新的AI AbortController，当前总数: ${activeAIControllers.size}`);
        controller.signal.addEventListener('abort', () => {
            activeAIControllers.delete(controller);
            console.log(`一个AI AbortController已中止并移除，剩余总数: ${activeAIControllers.size}`);
        }, { once: true });
    }
    function cancelAllAITasks() {
        console.log(`正在取消 ${activeAIControllers.size} 个活动的AI任务...`);
        activeAIControllers.forEach(controller => {
            if (!controller.signal.aborted) {
                controller.abort();
            }
        });
        activeAIControllers.clear();
        if (currentBatchAbortController) {
            currentBatchAbortController = null;
        }
    }
    function areAITasksRunning() {
        return Array.from(activeAIControllers).some(c => !c.signal.aborted);
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
    async function isUrlHealthy(url) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(url, { method: 'HEAD', mode: 'cors', signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.status < 500) {
                console.log(`[健康检查] ✅ ${url} - 状态: ${response.status} (可用)`);
                return true;
            } else {
                console.warn(`[健康检查] ❌ ${url} - 状态: ${response.status} (服务器错误)`);
                return false;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`[健康检查] ❌ ${url} - 请求超时`);
            } else {
                console.warn(`[健康检查] ❌ ${url} - 连接失败: ${error.message}`);
            }
            return false;
        }
    }
    async function getApiBaseUrl() {
        const now = Date.now();
        if (SCRIPT_CONFIG.cachedApiBaseUrl && (now - SCRIPT_CONFIG.lastFetchTimestamp < SCRIPT_CONFIG.cacheDuration)) {
            return SCRIPT_CONFIG.cachedApiBaseUrl;
        }
        if (SCRIPT_CONFIG.priorityApiBaseUrl) {
            HealthCheckVisualizer.addGroup('priority', '⚡️ 优先线路检测...', [SCRIPT_CONFIG.priorityApiBaseUrl], true);
            HealthCheckVisualizer.updateDot('priority', 0, 'testing');
            if (await isUrlHealthy(SCRIPT_CONFIG.priorityApiBaseUrl)) {
                HealthCheckVisualizer.updateDot('priority', 0, 'success');
                HealthCheckVisualizer.updateGroupLabel('priority', '✅ 优先线路连接成功！');
                console.log(`[优先线路] ${SCRIPT_CONFIG.priorityApiBaseUrl} 已选定！`);
                SCRIPT_CONFIG.cachedApiBaseUrl = SCRIPT_CONFIG.priorityApiBaseUrl;
                SCRIPT_CONFIG.lastFetchTimestamp = now;
                setTimeout(() => HealthCheckVisualizer.destroy(), 1200);
                return SCRIPT_CONFIG.priorityApiBaseUrl;
            } else {
                HealthCheckVisualizer.updateDot('priority', 0, 'failure');
                HealthCheckVisualizer.updateGroupLabel('priority', '❌ 优先线路不可用');
                console.warn(`[优先线路] ${SCRIPT_CONFIG.priorityApiBaseUrl} 不可用，回退至动态获取...`);
            }
        }
        for (const url of SCRIPT_CONFIG.remoteConfigUrls) {
            try {
                const response = await fetch(url, { cache: 'no-cache' });
                if (!response.ok) throw new Error(`状态: ${response.status}`);
                const config = await response.json();
                if (config && Array.isArray(config.baseUrls) && config.baseUrls.length > 0) {
                    HealthCheckVisualizer.addGroup('dynamic', '🌐 动态节点扫描...', config.baseUrls);
                    for (let i = 0; i < config.baseUrls.length; i++) {
                        const baseUrl = config.baseUrls[i];
                        HealthCheckVisualizer.updateDot('dynamic', i, 'testing');
                        if (await isUrlHealthy(baseUrl)) {
                            HealthCheckVisualizer.updateDot('dynamic', i, 'success');
                            HealthCheckVisualizer.updateGroupLabel('dynamic', '✅ 动态节点连接成功！');
                            console.log(`[动态配置] 域名 ${baseUrl} 健康检查通过，选定此地址！`);
                            SCRIPT_CONFIG.cachedApiBaseUrl = baseUrl;
                            SCRIPT_CONFIG.lastFetchTimestamp = now;
                            setTimeout(() => HealthCheckVisualizer.destroy(), 1200);
                            return baseUrl;
                        } else {
                            HealthCheckVisualizer.updateDot('dynamic', i, 'failure');
                        }
                    }
                    HealthCheckVisualizer.updateGroupLabel('dynamic', '❌ 所有动态节点均不可用');
                    throw new Error("域名池中的所有地址都无法连接。");
                } else {
                    throw new Error("远程配置文件格式不正确或域名池为空。");
                }
            } catch (error) {
                console.warn(`[动态配置] 路标 ${url} 尝试失败:`, error.message);
            }
        }
        console.error('[动态配置] 所有远程路标均获取失败！');
        if (SCRIPT_CONFIG.cachedApiBaseUrl) {
            console.log(`[动态配置] 回退至上次成功的缓存地址: ${SCRIPT_CONFIG.cachedApiBaseUrl}`);
            HealthCheckVisualizer.addGroup('fallback', `🔄 回退至缓存: ${SCRIPT_CONFIG.cachedApiBaseUrl}`, []);
            SCRIPT_CONFIG.lastFetchTimestamp = now;
            setTimeout(() => HealthCheckVisualizer.destroy(), 2000);
            return SCRIPT_CONFIG.cachedApiBaseUrl;
        }
        console.log(`[动态配置] 回退至最终的默认备用地址: ${SCRIPT_CONFIG.defaultApiBaseUrl}`);
        HealthCheckVisualizer.addGroup('default', `‼️ 启用最终备用线路，功能可能受限`, []);
        showNotification('无法连接到更新服务器，脚本将使用备用线路，功能可能受限。', { type: 'warning' });
        setTimeout(() => HealthCheckVisualizer.destroy(), 3000);
        return SCRIPT_CONFIG.defaultApiBaseUrl;
    }
    async function getCurrentUserInfo(token) {
        if (!token) {
            return null;
        }
        try {
            const cachedUserInfo = sessionStorage.getItem(`userInfo_${token}`);
            if (cachedUserInfo) {
                try {
                    const parsedInfo = JSON.parse(cachedUserInfo);
                    if (parsedInfo && parsedInfo.cacheTimestamp && (Date.now() - parsedInfo.cacheTimestamp < 5 * 60 * 1000)) {
                        return parsedInfo.data;
                    }
                } catch (e) {
                    sessionStorage.removeItem(`userInfo_${token}`);
                }
            }
            const response = await fetch(`${window.location.origin}/api/jw-starcmooc/user/currentUserInfo`, {
                headers: {
                    "authorization": `Bearer ${token}`,
                    "content-type": "application/json; charset=utf-8"
                },
                method: "GET",
                credentials: "include"
            });
            if (!response.ok) {
                console.error(`获取用户信息失败，状态码: ${response.status}`);
                return null;
            }
            const data = await response.json();
            if (data.code === 200 && data.result) {
                try {
                    sessionStorage.setItem(`userInfo_${token}`, JSON.stringify({ data: data.result, cacheTimestamp: Date.now() }));
                } catch (e) {
                    console.warn('缓存用户信息到 sessionStorage 失败:', e);
                }
                return data.result;
            } else {
                console.warn('获取用户信息API返回非成功状态:', data);
                return null;
            }
        } catch (error) {
            console.error('获取用户信息时发生网络错误:', error);
            return null;
        }
    }
    function addButtons() {
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --menu-bg: rgba(248, 249, 252, 0.85);
                --menu-border: rgba(0, 0, 0, 0.08);
                --menu-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
                --primary-color: #4F46E5;
                --primary-color-hover: #4338CA;
                --text-color: #1f2937;
                --text-color-secondary: #4b5569;
                --separator-color: #e5e7eb;
                --button-hover-bg: rgba(79, 70, 229, 0.05);
            }
            .xiaoya-menu-container {
                position: fixed;
                top: 150px;
                left: 150px;
                z-index: 9999;
                user-select: none;
            }
            .xiaoya-main-ball {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: linear-gradient(145deg, #6366F1, #4F46E5);
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                cursor: move;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 24px;
                transition: transform 0.4s cubic-bezier(0.19, 1, 0.22, 1), box-shadow 0.3s;
            }
            .xiaoya-main-ball:not(.menu-open):hover {
                transform: scale(1.1);
                box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
            }
            .xiaoya-main-ball.menu-open {
                transform: rotate(90deg) scale(0.9);
            }
            .xiaoya-menu-panel {
                position: absolute;
                top: 80px;
                left: -15px;
                width: 300px;
                background: var(--menu-bg);
                backdrop-filter: blur(12px) saturate(180%);
                -webkit-backdrop-filter: blur(12px) saturate(180%);
                border-radius: 16px;
                box-shadow: var(--menu-shadow);
                border: 1px solid var(--menu-border);
                transform-origin: top left;
                transition: transform 0.4s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.3s;
                opacity: 0;
                transform: scale(0.9) translateY(-10px);
                pointer-events: none;
                display: flex;
                flex-direction: column;
                max-height: 70vh;
            }
            .xiaoya-menu-panel.visible {
                opacity: 1;
                transform: scale(1) translateY(0);
                pointer-events: auto;
            }
            .xiaoya-menu-header {
                padding: 12px 16px;
                border-bottom: 1px solid var(--separator-color);
                cursor: move;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .xiaoya-menu-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: var(--text-color);
            }
            .xiaoya-menu-body {
                padding: 12px;
                overflow-y: auto;
                flex-grow: 1;
            }
            .xiaoya-menu-body::-webkit-scrollbar { width: 5px; }
            .xiaoya-menu-body::-webkit-scrollbar-track { background: transparent; }
            .xiaoya-menu-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
            .xiaoya-menu-button, .xiaoya-menu-toggle {
                display: flex;
                align-items: center;
                width: 100%;
                padding: 10px 12px;
                border: none;
                background: none;
                text-align: left;
                border-radius: 8px;
                cursor: pointer;
                transition: background-color 0.2s, color 0.2s;
                font-size: 14px;
                color: var(--text-color-secondary);
            }
            .xiaoya-menu-button:hover, .xiaoya-menu-toggle:hover {
                background-color: var(--button-hover-bg);
                color: var(--primary-color);
            }
            .xiaoya-menu-icon {
                font-size: 18px;
                width: 28px;
                text-align: center;
                margin-right: 12px;
            }
            .xiaoya-menu-separator {
                border: none;
                border-top: 1px solid var(--separator-color);
                margin: 8px 0;
            }
            .xiaoya-menu-toggle-switch {
                margin-left: auto;
                width: 42px;
                height: 24px;
                background-color: #e5e7eb;
                border-radius: 12px;
                position: relative;
                transition: background-color 0.3s;
            }
            .xiaoya-menu-toggle-switch::before {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 20px;
                height: 20px;
                background-color: white;
                border-radius: 50%;
                transition: transform 0.3s cubic-bezier(0.19, 1, 0.22, 1);
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .xiaoya-menu-toggle input:checked + .xiaoya-menu-toggle-switch {
                background-color: var(--primary-color);
            }
            .xiaoya-menu-toggle input:checked + .xiaoya-menu-toggle-switch::before {
                transform: translateX(18px);
            }
            .xiaoya-menu-toggle input { display: none; }
            .xiaoya-menu-button.special-action {
                background: linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
                color: var(--primary-color);
                font-weight: 500;
            }
            .xiaoya-menu-button.special-action:hover {
                background: linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
            }
        `;
        document.head.appendChild(style);
        const container = document.createElement('div');
        container.className = 'xiaoya-menu-container';
        const mainBall = document.createElement('div');
        mainBall.className = 'xiaoya-main-ball';
        mainBall.innerHTML = '✨';
        const panel = document.createElement('div');
        panel.className = 'xiaoya-menu-panel';
        const header = document.createElement('div');
        header.className = 'xiaoya-menu-header';
        header.innerHTML = '<h3>小雅答答答</h3>';
        const body = document.createElement('div');
        body.className = 'xiaoya-menu-body';
        panel.appendChild(header);
        panel.appendChild(body);
        container.appendChild(mainBall);
        container.appendChild(panel);
        document.body.appendChild(container);
        ContributionProgressUI.init(container);
        const buttonsConfig = [
            {
                id: 'get-answers',
                icon: '🕷️',
                text: '获取答案 / 激活',
                onClick: () => getAndStoreAnswers(true),
                type: 'button',
                special: true
            },
            {
                id: 'get-submitted',
                icon: '📜',
                text: '获取已提交作业',
                onClick: () => getSubmittedAnswers(),
                type: 'button'
            },
            {
                id: 'fill-answers',
                icon: '✍️',
                text: '填写答案',
                onClick: () => fillAnswers(),
                type: 'button',
                special: true
            },
            {
                id: 'view-edit',
                icon: '🖋️',
                text: '查看 / 编辑答案',
                onClick: () => showAnswerEditor(),
                type: 'button',
                special: true
            },
            {
                id: 'export-hw',
                icon: '📄',
                text: '导出作业为 Word',
                onClick: () => exportHomework(),
                type: 'button'
            },
            {
                id: 'export-hw-md',
                icon: 'Ⓜ️',
                text: '导出作业为 Markdown',
                onClick: () => exportHomeworkMarkdown(),
                type: 'button'
            },
            { type: 'separator' },
            {
                id: 'auto-fetch',
                icon: { enabled: '🔄', disabled: '⭕' },
                text: '自动获取答案',
                state: () => autoFetchEnabled,
                onClick: (el, iconEl) => {
                    autoFetchEnabled = !autoFetchEnabled;
                    localStorage.setItem('autoFetchEnabled', autoFetchEnabled);
                    el.querySelector('input').checked = autoFetchEnabled;
                    iconEl.textContent = autoFetchEnabled ? '🔄' : '⭕';
                },
                type: 'toggle'
            },
            {
                id: 'auto-fill',
                icon: { enabled: '🔄', disabled: '⭕' },
                text: '自动填写答案',
                state: () => autoFillEnabled,
                onClick: (el, iconEl) => {
                    autoFillEnabled = !autoFillEnabled;
                    localStorage.setItem('autoFillEnabled', autoFillEnabled);
                    el.querySelector('input').checked = autoFillEnabled;
                    iconEl.textContent = autoFillEnabled ? '🔄' : '⭕';
                },
                type: 'toggle'
            },
            { type: 'separator' },
            {
                id: 'ai-settings',
                icon: '⚙️',
                text: 'AI 设置',
                onClick: () => showAISettingsPanel(),
                type: 'button',
                special: true
            },
            {
                id: 'check-usage',
                icon: '📊',
                text: '检查用量',
                onClick: () => checkUsage(),
                type: 'button'
            },
            {
                id: 'show-guide',
                icon: '🧭',
                text: '使用指南',
                onClick: () => showTutorial(),
                type: 'button',
                special: true
            },
            { type: 'separator' },
            {
                id: 'contribute-current',
                icon: '💝',
                text: '贡献当前作业',
                onClick: async () => {
                    if (!(await checkAccountConsistency())) {
                        showNotification('操作中止：当前登录账号与脚本激活账号不一致。', { type: 'error', duration: 5000 });
                        return;
                    }
                    if (!(await isTaskPage())) {
                        showNotification('当前不是有效的作业/测验页面，无法进行贡献。', { type: 'warning' });
                        return;
                    }
                    const groupId = getGroupIDFromUrl(window.location.href);
                    const nodeId = getNodeIDFromUrl(window.location.href);
                    if (!groupId || !nodeId) {
                        showNotification('无法获取页面参数，操作中止。', { type: 'error' });
                        return;
                    }
                    showNotification('正在贡献答案到题库...', { type: 'info', duration: 5000 });
                    try {
                        const result = await contributeSingleAssignment(groupId, nodeId);
                        if (result.success) {
                            showNotification(`✅ 贡献成功: ${result.message}`, { type: 'success', duration: 8000 });
                        } else {
                            showNotification(`❌ 贡献失败: ${result.error}`, { type: 'error', duration: 8000 });
                        }
                    } catch (error) {
                        showNotification(`💥 贡献答案时发生严重错误: ${error.message}`, { type: 'error' });
                    }
                },
                type: 'button'
            },
            {
                id: 'auto-contribute',
                icon: { enabled: '💖', disabled: '🤍' },
                text: '自动贡献答案',
                state: () => autoContributeEnabled,
                onClick: async (el, iconEl) => {
                    if (autoContributeEnabled) {
                        const confirmedToKeep = await showConfirmNotification('感谢你一直以来的贡献！💖', { animation: 'scale', confirmText: '继续贡献', cancelText: '仍要关闭', title: '请留步，有几句话想对你说', description: `<p style="margin-bottom: 12px; line-height: 1.6;">你开启的“自动贡献”功能是我们答案库成长的基石。每一次贡献，都在帮助更多和你一样的同学。</p><p style="margin-bottom: 12px; line-height: 1.6;">郑重承诺：</p><ul style="text-align: left; padding-left: 20px; margin: 0; font-size: 14px; color: #555;"><li style="margin-bottom: 8px;"><b>只上传题目和标准答案</b>，不包含你的作答记录或分数。</li><li style="margin-bottom: 8px;">所有上传都是<b>完全匿名的</b>，不涉及任何个人身份信息。</li><li style="margin-bottom: 8px;">为保证题库质量，系统<b>只会收录已完成且有答案的作业</b>。</li><li>你举手之劳将汇聚成强大的力量，感谢你的信任与支持！</li></ul>` });
                        if (confirmedToKeep) {
                            showNotification('非常感谢！自动贡献功能将保持开启。', { type: 'success', animation: 'scale' });
                            el.querySelector('input').checked = true;
                            iconEl.textContent = '💖';
                            return;
                        }
                    }
                    autoContributeEnabled = !autoContributeEnabled;
                    localStorage.setItem('autoContributeEnabled', autoContributeEnabled);
                    el.querySelector('input').checked = autoContributeEnabled;
                    iconEl.textContent = autoContributeEnabled ? '💖' : '🤍';
                    if (autoContributeEnabled) {
                        showNotification('后台自动贡献功能已开启。脚本将在后台为你扫描并贡献所有课程的答案。', { type: 'info' });
                        sessionStorage.removeItem('xiaoya_full_scan_done');
                        backgroundTaskManager.schedule();
                    } else {
                        showNotification('自动贡献功能已关闭。感谢你曾经的付出！', { type: 'info' });
                    }
                },
                type: 'toggle'
            },
        ];
        buttonsConfig.forEach(config => {
            if (config.type === 'separator') {
                body.appendChild(document.createElement('hr')).className = 'xiaoya-menu-separator';
                return;
            }
            if (config.type === 'button') {
                const button = document.createElement('button');
                button.className = 'xiaoya-menu-button';
                if (config.special) button.classList.add('special-action');
                button.innerHTML = `
                    <span class="xiaoya-menu-icon">${config.icon}</span>
                    <span>${config.text}</span>
                `;
                button.onclick = config.onClick;
                body.appendChild(button);
            } else if (config.type === 'toggle') {
                const label = document.createElement('label');
                label.className = 'xiaoya-menu-toggle';
                const isEnabled = config.state();
                label.innerHTML = `
                    <span class="xiaoya-menu-icon">${isEnabled ? config.icon.enabled : config.icon.disabled}</span>
                    <span>${config.text}</span>
                    <input type="checkbox" ${isEnabled ? 'checked' : ''}>
                    <div class="xiaoya-menu-toggle-switch"></div>
                `;
                const iconSpan = label.querySelector('.xiaoya-menu-icon');
                label.onclick = (e) => {
                    e.preventDefault();
                    config.onClick(label, iconSpan);
                };
                body.appendChild(label);
            }
        });
        let isPanelVisible = false;
        function togglePanel() {
            isPanelVisible = !isPanelVisible;
            panel.classList.toggle('visible', isPanelVisible);
            mainBall.classList.toggle('menu-open', isPanelVisible);
        }
        mainBall.addEventListener('click', (e) => {
            if (!hasDragged) {
                togglePanel();
            }
        });
        let isDragging = false, hasDragged = false;
        let initialX, initialY, xOffset = 0, yOffset = 0;
        const dragThreshold = 5;
        function dragStart(e) {
            hasDragged = false;
            const target = e.target;
            if (target === mainBall || target === header || header.contains(target)) {
                isDragging = true;
                const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
                const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
                xOffset = clientX - container.offsetLeft;
                yOffset = clientY - container.offsetTop;
                initialX = clientX;
                initialY = clientY;
            }
        }
        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
                const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
                if (!hasDragged) {
                    const dx = clientX - initialX;
                    const dy = clientY - initialY;
                    if (Math.sqrt(dx * dx + dy * dy) > dragThreshold) {
                        hasDragged = true;
                    }
                }
                let newX = clientX - xOffset;
                let newY = clientY - yOffset;
                const containerRect = container.getBoundingClientRect();
                newX = Math.max(0, Math.min(newX, window.innerWidth - containerRect.width));
                newY = Math.max(0, Math.min(newY, window.innerHeight - containerRect.height));
                container.style.left = newX + 'px';
                container.style.top = newY + 'px';
            }
        }
        function dragEnd() {
            isDragging = false;
            setTimeout(() => {
                hasDragged = false;
            }, 0);
        }
        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        header.addEventListener('touchstart', dragStart, { passive: true });
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', dragEnd);
        mainBall.addEventListener('mousedown', dragStart);
        mainBall.addEventListener('touchstart', dragStart, { passive: true });
    }
    function createProgressBar() {
        const style = document.createElement('style');
        style.textContent = `
            .answer-progress {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 6px;
                background: rgba(0, 0, 0, 0.05);
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.4s ease;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                pointer-events: none;
            }
            .answer-progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #60a5fa, #818cf8);
                width: 0%;
                transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                border-radius: 0 3px 3px 0;
                box-shadow: 0 0 8px rgba(96, 165, 250, 0.5);
            }
            .answer-progress-text {
                position: fixed;
                top: 12px;
                right: 20px;
                transform: translateY(-10px);
                background: #4f46e5;
                color: white;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 13px;
                opacity: 0;
                transition: all 0.4s ease;
                box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);
                font-weight: bold;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
        const progressContainer = document.createElement('div');
        progressContainer.className = 'answer-progress';
        const progressBar = document.createElement('div');
        progressBar.className = 'answer-progress-bar';
        const progressText = document.createElement('div');
        progressText.className = 'answer-progress-text';
        progressContainer.appendChild(progressBar);
        document.body.appendChild(progressContainer);
        document.body.appendChild(progressText);
        return {
            show: () => {
                progressContainer.style.opacity = '1';
                progressText.style.opacity = '1';
                progressText.style.transform = 'translateY(0)';
            },
            hide: () => {
                progressContainer.style.opacity = '0';
                progressText.style.opacity = '0';
                progressText.style.transform = 'translateY(-10px)';
                setTimeout(() => {
                    progressContainer.remove();
                    progressText.remove();
                }, 300);
            },
            update: (current, total, action = '正在填写', unit = '题') => {
                const percent = total > 0 ? (current / total) * 100 : 0;
                progressBar.style.width = percent + '%';
                const displayCurrent = Math.round(current);
                const unitString = unit ? ` ${unit}` : '';
                progressText.textContent = `${action}: ${displayCurrent}/${total}${unitString}`;
            },
        };
    }
    addButtons();
    function addGlobalStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .code-editor-wrapper {
                position: relative;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            }
            .code-editor-wrapper textarea {
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
                letter-spacing: 0.3px;
            }
            .code-editor-wrapper textarea::-webkit-scrollbar {
                width: 12px;
                height: 12px;
            }
            .code-editor-wrapper textarea::-webkit-scrollbar-track {
                background: #1e1e1e;
            }
            .code-editor-wrapper textarea::-webkit-scrollbar-thumb {
                background: #424242;
                border-radius: 6px;
            }
            .code-editor-wrapper textarea::-webkit-scrollbar-thumb:hover {
                background: #4e4e4e;
            }
            .code-line-numbers::-webkit-scrollbar {
                display: none;
            }
            .code-editor-wrapper::before {
                content: attr(data-language);
                position: absolute;
                top: 8px;
                right: 12px;
                background: rgba(99, 102, 241, 0.9);
                color: white;
                padding: 4px 12px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                z-index: 10;
                pointer-events: none;
                text-transform: uppercase;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            }
            .image-upload-btn, .ai-assist-btn, .quark-search-btn{
                padding: 8px 16px;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: all 0.2s ease;
                height: 36px;
            }
            .image-upload-btn {
                background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                box-shadow: 0 2px 4px rgba(22, 163, 74, 0.3);
            }
            .image-upload-btn:hover {
                transform: translateY(-1px);
                background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
                box-shadow: 0 4px 8px rgba(22, 163, 74, 0.4);
            }
            .image-upload-btn:active {
                transform: translateY(1px);
            }
            .image-upload-btn.xiaoya-loading, .ai-assist-btn.xiaoya-loading, .quark-search-btn.xiaoya-loading {
                background: #9ca3af;
                cursor: not-allowed;
                opacity: 0.8;
            }
            .image-upload-btn .icon, .ai-assist-btn .icon, .quark-search-btn .icon {
                font-size: 16px;
            }
            .image-upload-btn.xiaoya-loading .icon, .ai-assist-btn.xiaoya-loading .icon, .quark-search-btn.xiaoya-loading .icon {
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            .ai-assist-btn {
                background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
                box-shadow: 0 2px 4px rgba(79, 70, 229, 0.1);
            }
            .ai-assist-btn:hover {
                transform: translateY(-1px);
                background: linear-gradient(135deg, #4338ca 0%, #4f46e5 100%);
                box-shadow: 0 4px 8px rgba(79, 70, 229, 0.2);
            }
            .ai-assist-btn:active {
                transform: translateY(1px);
            }
            .quark-search-btn {
                background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
                box-shadow: 0 2px 4px rgba(14, 165, 233, 0.1);
            }
            .quark-search-btn:hover {
                transform: translateY(-1px);
                background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
                box-shadow: 0 4px 8px rgba(14, 165, 233, 0.2);
            }
            .quark-search-btn:active {
                transform: translateY(1px);
            }
            .char-count {
                font-size: 12px;
                color: #6b7280;
                margin-left: auto;
                padding: 4px 8px;
                background-color: #f9fafb;
                border-radius: 6px;
                border: 1px solid #e5e7eb;
                transition: all 0.2s ease;
            }
            .char-count.active {
                color: #4f46e5;
                border-color: #c7d2fe;
                background-color: #eef2ff;
            }
            .ai-thinking-process details {
                border: none !important;
                background: none !important;
            }
            .ai-thinking-process summary {
                padding: 8px 0px !important;
            }
            .ai-thinking-process .timeline-container {
                padding: 10px 10px;
                max-height: 300px;
                overflow-y: auto;
                scrollbar-width: thin;
            }
            .ai-thinking-process .timeline-container::-webkit-scrollbar { width: 5px; }
            .ai-thinking-process .timeline-container::-webkit-scrollbar-track { background: transparent; }
            .ai-thinking-process .timeline-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
            .ai-thinking-process .timeline-step {
                position: relative;
                padding-left: 30px;
                padding-bottom: 20px;
            }
            .ai-thinking-process .timeline-step:last-child {
                padding-bottom: 5px;
            }
            .ai-thinking-process .timeline-step.completed::before {
                content: '';
                position: absolute;
                left: 7px;
                top: 8px;
                width: 2px;
                height: 100%;
                background-color: #6366f1;
                z-index: 1;
                transition: background-color 0.3s ease;
            }
            .ai-thinking-process .timeline-marker {
                position: absolute;
                left: 0;
                top: 0;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background-color: #e5e7eb;
                border: 3px solid #f9fafb;
                transition: all 0.3s ease;
                z-index: 1;
            }
            .ai-thinking-process .timeline-content h4 {
                margin: 0 0 5px 0;
                font-size: 14px;
                font-weight: 600;
                color: #4b5569;
                transition: color 0.3s ease;
            }
            .ai-thinking-process .timeline-content p {
                margin: 0;
                font-size: 13px;
                color: #6b7280;
                line-height: 1.6;
                transition: all 0.3s ease;
                max-height: 0;
                opacity: 0.5;
            }
            .ai-thinking-process .timeline-content ul,
            .ai-thinking-process .timeline-content ol {
                padding-left: 20px;
                margin: 8px 0;
            }
            .ai-thinking-process .timeline-content li {
                margin-bottom: 4px;
            }
            .ai-thinking-process .timeline-content h2,
            .ai-thinking-process .timeline-content h3,
            .ai-thinking-process .timeline-content h4 {
                margin: 12px 0 6px 0;
                color: #1f2937;
                font-weight: 600;
            }
            .ai-thinking-process .timeline-content strong {
                font-weight: 600;
                color: #374151;
            }
            .ai-thinking-process .timeline-step.completed .timeline-marker {
                background-color: #6366f1;
                border-color: #eef2ff;
            }
            .ai-thinking-process .timeline-step.completed .timeline-content p {
                max-height: 300px;
                opacity: 0.7;
            }
            .ai-thinking-process .timeline-step.active .timeline-marker {
                background-color: #4f46e5;
                transform: scale(1.2);
                border-color: #e0e7ff;
                animation: ai-thinking-pulse 1.5s infinite;
            }
            .ai-thinking-process .timeline-step.active .timeline-content h4 {
                color: #1f2937;
            }
            .ai-thinking-process .timeline-step.active .timeline-content p {
                max-height: 500px;
                opacity: 1;
            }
            @keyframes ai-thinking-pulse {
                0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); }
                70% { box-shadow: 0 0 0 8px rgba(79, 70, 229, 0); }
                100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
            }
            @keyframes contentFadeIn {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }
    addGlobalStyles();
    class NotificationAnimator {
        static animations = {
            fadeSlide: {
                enter: {
                    initial: {
                        opacity: '0',
                        transform: 'translateY(-20px)'
                    },
                    final: {
                        opacity: '1',
                        transform: 'translateY(0)'
                    }
                },
                exit: {
                    initial: {
                        opacity: '1',
                        transform: 'translateY(0)'
                    },
                    final: {
                        opacity: '0',
                        transform: 'translateY(-20px)'
                    }
                }
            },
            scale: {
                enter: {
                    initial: {
                        opacity: '0',
                        transform: 'scale(0.8)'
                    },
                    final: {
                        opacity: '1',
                        transform: 'scale(1)'
                    }
                },
                exit: {
                    initial: {
                        opacity: '1',
                        transform: 'scale(1)'
                    },
                    final: {
                        opacity: '0',
                        transform: 'scale(0.8)'
                    }
                }
            },
            slideRight: {
                enter: {
                    initial: {
                        opacity: '0',
                        transform: 'translateX(-100%)'
                    },
                    final: {
                        opacity: '1',
                        transform: 'translateX(0)'
                    }
                },
                exit: {
                    initial: {
                        opacity: '1',
                        transform: 'translateX(0)'
                    },
                    final: {
                        opacity: '0',
                        transform: 'translateX(100%)'
                    }
                }
            }
        };
        static applyAnimation(element, animationType, isEnter) {
            const animation = this.animations[animationType];
            if (!animation) return;
            const { initial, final } = isEnter ? animation.enter : animation.exit;
            Object.assign(element.style, {
                transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                ...initial
            });
            requestAnimationFrame(() => {
                Object.assign(element.style, final);
            });
        }
    }
    function getNotificationContainer() {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 100000;
                max-height: calc(100vh - 40px);
                overflow-y: auto;
                overflow-x: hidden;
                pointer-events: none;
                display: flex;
                flex-direction: column;
                align-items: center;
                opacity: 0;
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(container);
            container.offsetHeight;
            container.style.opacity = '1';
        }
        return container;
    }
    function showNotification(message, options = {}) {
        const {
            type = 'info',
            duration = 3000,
            keywords = [],
            animation = 'fadeSlide',
            id = null
        } = options;
        const container = getNotificationContainer();
        const existingNotifications = container.querySelectorAll('.message-container');
        for (let i = 0; i < existingNotifications.length; i++) {
            if (existingNotifications[i].textContent === message) {
                return;
            }
        }
        if (id) {
            let existingNotification = container.querySelector(`[data-notification-id="${id}"]`);
            if (existingNotification) {
                const messageContainer = existingNotification.querySelector('.message-container');
                const icon = existingNotification.querySelector('.notification-icon');
                const typeStyles = {
                    success: { icon: '🎉' },
                    error: { icon: '❌' },
                    warning: { icon: '⚠️' },
                    info: { icon: 'ℹ️' }
                };
                const currentType = typeStyles[type] || typeStyles.info;
                if (icon) icon.textContent = currentType.icon;
                if (messageContainer) messageContainer.innerHTML = message;
                if (duration > 0) {
                    if (existingNotification.hideTimeout) clearTimeout(existingNotification.hideTimeout);
                    existingNotification.hideTimeout = setTimeout(() => {
                        hideNotification(existingNotification);
                    }, duration);
                }
                return;
            }
        }
        const highlightColors = {
            success: '#ffba08', error: '#14b8a6', warning: '#8b5cf6', info: '#f472b6'
        };
        const highlightColor = highlightColors[type] || highlightColors.info;
        const highlightStyle = `
            color: ${highlightColor}; font-weight: bold; border-bottom: 2px solid ${highlightColor}50;
            transition: all 0.3s ease; border-radius: 3px;
        `;
        let highlightedMessage = message;
        if (keywords && keywords.length > 0) {
            const uniqueKeywords = [...new Set(keywords)].map(k => String(k).trim()).filter(Boolean);
            if (uniqueKeywords.length > 0) {
                uniqueKeywords.sort((a, b) => b.length - a.length);
                const escapedKeywords = uniqueKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                const regex = new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'g');
                highlightedMessage = message.replace(regex, (match) =>
                    `<span style="${highlightStyle}"
                    onmouseover="this.style.backgroundColor='${highlightColor}15'; this.style.borderBottomColor='${highlightColor}'"
                    onmouseout="this.style.backgroundColor='transparent'; this.style.borderBottomColor='${highlightColor}50'"
                >${match}</span>`
                );
            }
        }
        const notification = document.createElement('div');
        if (id) notification.dataset.notificationId = id;
        notification.style.cssText = `
            position: relative; margin-bottom: 10px; padding: 15px 20px; border-radius: 12px;
            color: #333; font-size: 16px; font-weight: bold;
            box-shadow: 0 8px 16px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.06);
            pointer-events: auto; opacity: 0; transform: translateY(-20px);
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            display: flex; align-items: center; backdrop-filter: blur(8px);
        `;
        const typeStyles = {
            success: { background: 'linear-gradient(145deg, rgba(104, 214, 156, 0.95), rgba(89, 186, 134, 0.95))', icon: '🎉' },
            error: { background: 'linear-gradient(145deg, rgba(248, 113, 113, 0.95), rgba(220, 38, 38, 0.95))', icon: '❌' },
            warning: { background: 'linear-gradient(145deg, rgba(251, 191, 36, 0.95), rgba(245, 158, 11, 0.95))', icon: '⚠️' },
            info: { background: 'linear-gradient(145deg, rgba(96, 165, 250, 0.95), rgba(59, 130, 246, 0.95))', icon: 'ℹ️' }
        };
        const currentType = typeStyles[type] || typeStyles.info;
        notification.style.background = currentType.background;
        notification.style.color = type === 'info' || type === 'success' ? '#fff' : '#000';
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            position: absolute; bottom: 0; left: 0; height: 4px; width: 100%;
            background: rgba(255, 255, 255, 0.3); border-radius: 0 0 12px 12px;
            transition: width ${duration}ms cubic-bezier(0.4, 0, 0.2, 1);
        `;
        const icon = document.createElement('span');
        icon.className = 'notification-icon';
        icon.style.cssText = 'margin-right: 12px; font-size: 20px; filter: saturate(1.2);';
        icon.textContent = currentType.icon;
        const messageContainer = document.createElement('div');
        messageContainer.className = 'message-container';
        messageContainer.innerHTML = highlightedMessage;
        messageContainer.textContent = message;
        messageContainer.style.cssText = 'flex: 1; font-weight: bold;';
        const closeButton = document.createElement('button');
        closeButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        closeButton.style.cssText = `
            margin-left: 12px; background: #f3f4f6; border: none; width: 32px; height: 32px;
            border-radius: 50%; cursor: pointer; color: #6b7280; display: flex;
            align-items: center; justify-content: center; transition: all 0.3s ease; flex-shrink: 0;
        `;
        closeButton.onmouseover = () => { };
        closeButton.onmouseout = () => { };
        notification.appendChild(icon);
        notification.appendChild(messageContainer);
        notification.appendChild(closeButton);
        notification.appendChild(progressBar);
        container.prepend(notification);
        requestAnimationFrame(() => {
            NotificationAnimator.applyAnimation(notification, animation, true);
            if (duration > 0) {
                requestAnimationFrame(() => { progressBar.style.width = '0'; });
            }
        });
        function hideNotification(notificationElement) {
            if (!container.contains(notificationElement)) return;
            NotificationAnimator.applyAnimation(notificationElement, animation, false);
            setTimeout(() => {
                if (container.contains(notificationElement)) {
                    container.removeChild(notificationElement);
                }
                if (container.children.length === 0 && document.body.contains(container)) {
                    document.body.removeChild(container);
                }
            }, 300);
        }
        const hideThisNotification = () => hideNotification(notification);
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            clearTimeout(notification.hideTimeout);
            hideThisNotification();
        });
        if (duration > 0) {
            notification.addEventListener('click', hideThisNotification);
            notification.hideTimeout = setTimeout(() => {
                hideThisNotification();
            }, duration);
        }
    }
    function showConfirmNotification(message, options = {}) {
        const {
            animation = 'scale',
            confirmText = '确认',
            cancelText = '取消',
            title = null,
            description = null
        } = options;
        return new Promise((resolve) => {
            const container = getNotificationContainer();
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: relative;
                margin-bottom: 10px;
                padding: 20px 25px;
                border-radius: 16px;
                color: #333;
                font-size: 16px;
                font-weight: bold;
                box-shadow: 0 10px 25px rgba(0,0,0,0.1), 0 5px 10px rgba(0,0,0,0.05);
                pointer-events: auto;
                opacity: 0;
                transform: translateY(-20px);
                transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                display: flex;
                flex-direction: column;
                gap: 15px;
                background: linear-gradient(145deg, #ffffff, #f8f9fa);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(0,0,0,0.05);
                max-width: 450px;
            `;
            if (title) {
                const titleDiv = document.createElement('h3');
                titleDiv.textContent = title;
                titleDiv.style.cssText = `
                    margin: 0;
                    font-size: 18px;
                    font-weight: 700;
                    color: #1f2937;
                    text-align: center;
                `;
                notification.appendChild(titleDiv);
            }
            const messageDiv = document.createElement('div');
            messageDiv.innerHTML = message;
            messageDiv.style.fontWeight = '600';
            messageDiv.style.textAlign = 'center';
            notification.appendChild(messageDiv);
            if (description) {
                const descriptionDiv = document.createElement('div');
                descriptionDiv.innerHTML = description;
                descriptionDiv.style.cssText = `
                    margin-top: 5px;
                    font-size: 15px;
                    font-weight: normal;
                    color: #4b5569;
                    line-height: 1.5;
                    text-align: center;
                `;
                notification.appendChild(descriptionDiv);
            }
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                gap: 12px;
                justify-content: center;
                margin-top: 10px;
            `;
            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = confirmText;
            confirmBtn.style.cssText = `
                padding: 8px 18px;
                border: none;
                border-radius: 8px;
                background: #4f46e5;
                color: white;
                cursor: pointer;
                font-weight: bold;
                transition: all 0.2s ease;
            `;
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = cancelText;
            cancelBtn.style.cssText = `
                padding: 8px 18px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                background: transparent;
                color: #4b5569;
                cursor: pointer;
                font-weight: bold;
                transition: all 0.2s ease;
            `;
            [confirmBtn, cancelBtn].forEach(btn => {
                btn.onmouseover = () => { btn.style.transform = 'translateY(-1px)'; btn.style.filter = 'brightness(1.1)'; };
                btn.onmouseout = () => { btn.style.transform = 'translateY(0)'; btn.style.filter = 'brightness(1)'; };
            });
            buttonContainer.appendChild(cancelBtn);
            buttonContainer.appendChild(confirmBtn);
            notification.appendChild(buttonContainer);
            container.appendChild(notification);
            requestAnimationFrame(() => {
                notification.style.opacity = '1';
                notification.style.transform = 'translateY(0)';
            });
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    NotificationAnimator.applyAnimation(notification, animation, true);
                });
            });
            const hideNotification = (result) => {
                NotificationAnimator.applyAnimation(notification, animation, false);
                setTimeout(() => {
                    if (container.contains(notification)) {
                        container.removeChild(notification);
                    }
                    if (container.children.length === 0 && document.body.contains(container)) {
                        document.body.removeChild(container);
                    }
                    resolve(result);
                }, 300);
            };
            confirmBtn.onclick = () => hideNotification(true);
            cancelBtn.onclick = () => hideNotification(false);
        });
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
        closeButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        closeButton.style.cssText = `
            position: absolute;
            top: 15px;
            right: 15px;
            background: #f3f4f6;
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            cursor: pointer;
            color: #6b7280;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.08);
        `;
        closeButton.onmouseover = () => {
            closeButton.style.backgroundColor = '#e5e7eb';
            closeButton.style.transform = 'rotate(90deg)';
            closeButton.style.color = '#000';
            closeButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.12)';
        };
        closeButton.onmouseout = () => {
            closeButton.style.backgroundColor = '#f3f4f6';
            closeButton.style.transform = 'rotate(0deg)';
            closeButton.style.color = '#6b7280';
            closeButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.08)';
        };
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
        infoMessage.innerHTML = '关于激活码获取，请移步<a href="https://blog.zygame1314.site" target="_blank" style="color: #4CAF50; text-decoration: none;">我的主页</a>或者直接访问<a href="https://ifdian.net/a/zygame1314" target="_blank" style="color: #4CAF50; text-decoration: none;">爱发电</a>';
        infoMessage.style.color = '#666';
        infoMessage.style.fontSize = '14px';
        infoMessage.style.margin = '10px 0 0 0';
        const reuseInfoBox = document.createElement('div');
        reuseInfoBox.style.cssText = `
            margin-top: 20px;
            padding: 15px;
            background-color: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 12px;
            font-size: 13.5px;
            line-height: 1.7;
            color: #0c4a6e;
            text-align: left;
        `;
        reuseInfoBox.innerHTML = `
            <strong style="display: block; margin-bottom: 8px; font-size: 14px; color: #075985;">💡 重要提示</strong>
            <ul style="margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 8px;">
                    <strong>并非一次性：</strong>在会员有效期内，你始终可以使用<strong>任意一个</strong>你购买过的有效激活码来重新激活。
                </li>
                <li>
                    <strong>支持多设备：</strong>一次激活，即可在你的不同设备（如电脑、手机）上使用。在新设备上只需用同一个激活码重新激活，即可同步会员状态，<strong>无需为多设备重复购买</strong>。
                </li>
            </ul>
        `;
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
                confirmButton.innerHTML = '<span class="xiaoya-loading"></span>验证中...';
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
            .xiaoya-loading {
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
        `;
        document.head.appendChild(style);
        modalHeader.appendChild(icon);
        modalHeader.appendChild(title);
        modalHeader.appendChild(subtitle);
        modalHeader.appendChild(infoMessage);
        modalHeader.appendChild(reuseInfoBox);
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
            showNotification('请输入激活码。', { type: 'warning', keywords: ['激活码'], animation: 'scale' });
        });
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
                showNotification('请输入激活码。', { type: 'warning', keywords: ['激活码'], animation: 'scale' });
            }
        });
        confirmButton.addEventListener('click', () => {
            const userCode = input.value.trim();
            if (isLoading) return;
            if (userCode) {
                setLoadingState(true);
                const token = getToken();
                getCurrentUserInfo(token).then(userInfo => {
                    if (!userInfo || !userInfo.id) {
                        showNotification('无法获取小雅用户信息，请先登录小雅。', { type: 'error' });
                        setLoadingState(false);
                        return;
                    }
                    getApiBaseUrl().then(baseUrl => {
                        fetch(`${baseUrl}/api/activate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                activation_code: userCode,
                                platform_user_id: userInfo.id.toString(),
                                xiaoyaToken: token,
                                origin: window.location.origin
                            })
                        })
                            .then(res => res.json())
                            .then(data => {
                                setLoadingState(false);
                                if (data.success) {
                                    localStorage.setItem('xiaoya_access_token', data.access_token);
                                    localStorage.setItem('xiaoya_refresh_token', data.refresh_token);
                                    localStorage.setItem('xiaoya_bound_user_id', userInfo.id.toString());
                                    showNotification('激活成功！', { type: 'success', animation: 'scale' });
                                    closeModal();
                                    getAndStoreAnswers();
                                } else {
                                    showNotification(`激活失败: ${data.error}`, { type: 'error' });
                                }
                            })
                            .catch(err => {
                                setLoadingState(false);
                                showNotification(`网络错误: ${err.message}`, { type: 'error' });
                            });
                    });
                });
            } else {
                input.style.border = '2px solid #ff4444';
                input.style.backgroundColor = '#fff8f8';
                showNotification('请输入激活码。', { type: 'warning', keywords: ['激活码'], animation: 'fadeSlide' });
                input.focus();
            }
        });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !isLoading) {
                confirmButton.click();
            }
        });
    }
    async function authedFetch(action, payload) {
        let accessToken = localStorage.getItem('xiaoya_access_token');
        if (!accessToken) {
            throw new Error('需要激活');
        }
        const xiaoyaToken = getToken();
        if (!xiaoyaToken) throw new Error('无法获取小雅 Token');
        const currentUserInfo = await getCurrentUserInfo(xiaoyaToken);
        if (!currentUserInfo || !currentUserInfo.id) {
            showNotification('无法获取当前小雅用户信息，请确保已登录。', { type: 'error' });
            throw new Error('无法获取当前小雅用户信息');
        }
        const finalPayload = {
            ...payload,
            xiaoyaToken,
            origin: window.location.origin,
            current_platform_user_id: currentUserInfo.id.toString(),
            script_version: GM_info.script.version
        };
        const baseUrl = await getApiBaseUrl();
        async function doFetch(token) {
            return fetch(`${baseUrl}/api/action/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(finalPayload)
            });
        }
        let response = await doFetch(accessToken);
        if (response.status === 401 || response.status === 403) {
            const errorData = await response.json();
            const errorMessage = errorData.error || '';
            if (errorData.code === 'FRAUD_DETECTED') {
                console.error(`[欺诈检测] 后端返回欺诈警告: ${errorMessage}`);
                throw new Error(`欺诈行为警告: ${errorMessage}`);
            }
            if (errorMessage.includes('重新激活') || errorMessage.includes('用户不存在') || errorMessage.includes('已到期')) {
                console.warn(`后端要求重新激活: ${errorMessage}`);
                throw new Error(`凭证失效，请重新激活: ${errorMessage}`);
            }
            if (errorData.code === 'TOKEN_EXPIRED') {
                console.log('Access Token 过期，尝试刷新...');
                const refreshToken = localStorage.getItem('xiaoya_refresh_token');
                if (!refreshToken) {
                    throw new Error('刷新令牌不存在，请重新激活');
                }
                const refreshResponse = await fetch(`${baseUrl}/api/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken })
                });
                if (refreshResponse.ok) {
                    const refreshData = await refreshResponse.json();
                    accessToken = refreshData.access_token;
                    localStorage.setItem('xiaoya_access_token', accessToken);
                    console.log('Token 刷新成功，重试请求...');
                    response = await doFetch(accessToken);
                } else {
                    const refreshErrorData = await refreshResponse.json();
                    const message = refreshErrorData.error || '刷新令牌失败';
                    if (message.includes('数据库中无效')) {
                        throw new Error('检测到你可能在其他设备上激活，请重新在此设备上激活。');
                    }
                    throw new Error('刷新令牌失败，请重新激活');
                }
            } else {
                if (errorMessage.includes('无效的令牌')) {
                    throw new Error(`凭证无效，请重新激活: ${errorMessage}`);
                }
                throw new Error(`认证失败: ${errorMessage || '未知错误'}`);
            }
        }
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`请求失败 (${response.status}): ${errorData.error || response.statusText}`);
        }
        return response.json();
    }
    function showUsagePanel() {
        const overlay = document.createElement('div');
        overlay.id = 'usage-panel-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.7); z-index: 10001;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1); backdrop-filter: blur(8px);
        `;
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: linear-gradient(145deg, #f9fafb, #f3f4f6);
            padding: 32px 40px; border-radius: 20px;
            width: 480px; max-width: 90%;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            transform: scale(0.9) translateY(20px); opacity: 0;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative; border: 1px solid rgba(255, 255, 255, 0.2);
            display: flex; flex-direction: column;
        `;
        const closeModal = () => {
            modal.style.transform = 'scale(0.9) translateY(20px)';
            modal.style.opacity = '0';
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
            }, 400);
        };
        const closeButton = document.createElement('button');
        closeButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>`;
        closeButton.style.cssText = `
            position: absolute; top: 18px; right: 18px; background: #e5e7eb; border: none;
            width: 36px; height: 36px; border-radius: 50%; cursor: pointer; color: #6b7280;
            display: flex; align-items: center; justify-content: center; transition: all 0.3s ease;
        `;
        closeButton.onmouseover = () => { closeButton.style.transform = 'rotate(90deg) scale(1.1)'; closeButton.style.backgroundColor = '#d1d5db'; };
        closeButton.onmouseout = () => { closeButton.style.transform = 'rotate(0deg) scale(1)'; closeButton.style.backgroundColor = '#e5e7eb'; };
        closeButton.onclick = closeModal;
        const title = document.createElement('h2');
        title.innerHTML = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -6px; margin-right: 12px; color: #4f46e5;">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path>
            </svg>
            用量状态
        `;
        title.style.cssText = 'margin-top: 0; margin-bottom: 30px; text-align: center; color: #1f2937; font-size: 24px; font-weight: 700;';
        const contentArea = document.createElement('div');
        contentArea.style.cssText = `
            min-height: 180px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        `;
        const spinnerStyle = document.createElement('style');
        spinnerStyle.textContent = `@keyframes usage-spinner { to { transform: rotate(360deg); } }`;
        document.head.appendChild(spinnerStyle);
        contentArea.innerHTML = `
            <div class="loading-spinner" style="width: 40px; height: 40px; border: 4px solid #e5e7eb; border-top-color: #4f46e5; border-radius: 50%; animation: usage-spinner 1s linear infinite;"></div>
        `;
        modal.appendChild(closeButton);
        modal.appendChild(title);
        modal.appendChild(contentArea);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            modal.style.opacity = '1';
            modal.style.transform = 'scale(1) translateY(0)';
        });
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
        return { contentArea, closeModal };
    }
    function populateUsagePanel(contentArea, usageData, closeModal) {
        const { expires_at, total_queries, total_query_limit, daily_queries, daily_query_limit } = usageData;
        contentArea.innerHTML = '';
        contentArea.style.alignItems = 'stretch';
        contentArea.style.justifyContent = 'flex-start';
        contentArea.style.flexDirection = 'column';
        const createUsageBar = (label, used, limit, color) => {
            const container = document.createElement('div');
            container.style.marginBottom = '25px';
            const labelElement = document.createElement('div');
            labelElement.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 15px; color: #374151;';
            const labelText = document.createElement('span');
            labelText.textContent = label;
            labelText.style.fontWeight = '600';
            const usageText = document.createElement('span');
            usageText.style.cssText = `font-weight: 700; color: #374151; font-family: Microsoft YaHei; font-size: 16px;`;
            usageText.textContent = `${used.toLocaleString()} / ${limit.toLocaleString()}`;
            labelElement.appendChild(labelText);
            labelElement.appendChild(usageText);
            const progressBarBg = document.createElement('div');
            progressBarBg.style.cssText = 'height: 12px; background-color: #e5e7eb; border-radius: 6px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);';
            const progressBarFill = document.createElement('div');
            const percentage = limit > 0 ? (used / limit) * 100 : 0;
            progressBarFill.style.cssText = `
                height: 100%; width: 0%; background: ${color};
                border-radius: 6px; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
            `;
            progressBarBg.appendChild(progressBarFill);
            container.appendChild(labelElement);
            container.appendChild(progressBarBg);
            setTimeout(() => {
                progressBarFill.style.width = `${percentage}%`;
            }, 100);
            return container;
        };
        const dailyUsageBar = createUsageBar('今日已用额度', daily_queries, daily_query_limit, 'linear-gradient(90deg, #5eead4, #3b82f6)');
        const totalUsageBar = createUsageBar('总剩余额度', total_queries, total_query_limit, 'linear-gradient(90deg, #f87171, #ec4899)');
        const expiryContainer = document.createElement('div');
        expiryContainer.style.cssText = `
            margin-top: 10px; padding: 15px; text-align: center;
            background-color: #eef2ff; border: 1px solid #c7d2fe; border-radius: 12px;
        `;
        const expiryLabel = document.createElement('span');
        expiryLabel.textContent = '授权到期时间: ';
        expiryLabel.style.color = '#4338ca';
        expiryLabel.style.fontWeight = '600';
        const expiryDate = document.createElement('span');
        expiryDate.textContent = expires_at ? new Date(expires_at * 1000).toLocaleString('zh-CN', { hour12: false }) : 'N/A';
        expiryDate.style.fontWeight = '700';
        expiryDate.style.color = '#4f46e5';
        expiryContainer.appendChild(expiryLabel);
        expiryContainer.appendChild(expiryDate);
        const actionsContainer = document.createElement('div');
        actionsContainer.style.cssText = 'text-align: center; margin-top: 25px; margin-bottom: 10px;';
        const renewButton = document.createElement('button');
        renewButton.textContent = '续费 / 激活';
        renewButton.style.cssText = `
            padding: 12px 28px;
            border: none;
            border-radius: 10px;
            background: linear-gradient(145deg, #4f46e5, #3b82f6);
            color: white;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 15px rgba(79, 70, 229, 0.25);
        `;
        renewButton.onmouseover = () => {
            renewButton.style.transform = 'translateY(-3px)';
            renewButton.style.boxShadow = '0 7px 20px rgba(79, 70, 229, 0.35)';
        };
        renewButton.onmouseout = () => {
            renewButton.style.transform = 'translateY(0)';
            renewButton.style.boxShadow = '0 4px 15px rgba(79, 70, 229, 0.25)';
        };
        renewButton.onclick = () => {
            if (closeModal) {
                closeModal();
                setTimeout(() => {
                    promptActivationCode();
                }, 300);
            }
        };
        actionsContainer.appendChild(renewButton);
        const announcementContainer = document.createElement('div');
        announcementContainer.style.cssText = `
            margin-top: 25px;
            margin-bottom: 10px;
            padding: 15px 20px;
            text-align: left;
            background-color: #fffbeb;
            border: 1px solid #fde68a;
            border-radius: 12px;
            font-size: 14px;
            line-height: 1.7;
            color: #78350f;
        `;
        const announcementTitle = document.createElement('h4');
        announcementTitle.innerHTML = '📢 额度规则调整';
        announcementTitle.style.cssText = 'margin-top: 0; margin-bottom: 12px; color: #b45309; font-weight: bold; font-size: 16px;';
        const announcementBody = document.createElement('div');
        announcementBody.style.cssText = 'margin: 0;';
        announcementBody.innerHTML = `
            <h5 style="margin-top:0; margin-bottom: 5px; font-weight: bold; color: #92400e;">1. 总查询额度调整</h5>
            <ul style="margin: 0 0 10px 20px; padding: 0; list-style-type: disc;">
                <li style="margin-bottom: 3px;"><b>月卡</b> (30天): <b style="color: #16a34a;">20,000</b> 题</li>
                <li style="margin-bottom: 3px;"><b>季卡</b> (90天): <b style="color: #16a34a;">70,000</b> 题</li>
                <li style="margin-bottom: 3px;"><b>年卡</b> (365天): <b style="color: #16a34a;">300,000</b> 题</li>
            </ul>
            <h5 style="margin-top:10px; margin-bottom: 5px; font-weight: bold; color: #92400e;">2. 每日查询限额</h5>
            <p style="margin: 0 0 10px 0;">为保障系统稳定，<b>所有用户每日上限统一为 1,000 题</b>，无任何例外。该额度足以满足绝大多数使用场景。</p>
            <h5 style="margin-top:10px; margin-bottom: 5px; font-weight: bold; color: #92400e;">3. 续费与额度规则</h5>
            <ul style="margin: 0 0 10px 20px; padding: 0; list-style-type: disc;">
                <li style="margin-bottom: 3px;"><b>提前续费</b>: 未过期时续费，<b>剩余额度将与新额度叠加</b>。</li>
                <li style="margin-bottom: 3px;"><b>过期后续费</b>: 已过期再续费，<b>旧额度将清零</b>。</li>
            </ul>
        `;
        announcementContainer.appendChild(announcementTitle);
        announcementContainer.appendChild(announcementBody);
        contentArea.appendChild(dailyUsageBar);
        contentArea.appendChild(totalUsageBar);
        contentArea.appendChild(expiryContainer);
        contentArea.appendChild(actionsContainer);
        contentArea.appendChild(announcementContainer);
    }
    async function checkUsage() {
        if (!(await checkAccountConsistency())) {
            console.warn("[操作中止] 因账号不一致，已取消检查用量。");
            return;
        }
        const { contentArea, closeModal } = showUsagePanel();
        try {
            const data = await authedFetch('checkUsage', {});
            if (data.success) {
                populateUsagePanel(contentArea, data, closeModal);
            } else {
                throw new Error(data.error || '获取用量失败');
            }
        } catch (error) {
            console.error('检查用量失败:', error);
            if (error.message.includes('激活')) {
                closeModal();
                setTimeout(promptActivationCode, 300);
            } else {
                contentArea.innerHTML = `<div style="color: #ef4444; text-align: center;">获取用量失败：${error.message}</div>`;
            }
        }
    }
    let taskNoticesCache = {
        groupId: null,
        data: null,
        timestamp: null,
        CACHE_DURATION: 5 * 60 * 1000
    };
    const CONTRIBUTED_ASSIGNMENTS_KEY = 'xiaoya_contributed_assignments';
    const CONTRIBUTION_RESCAN_THRESHOLD = 7 * 24 * 60 * 60 * 1000;
    function getContributedAssignmentsData() {
        try {
            const storedData = localStorage.getItem(CONTRIBUTED_ASSIGNMENTS_KEY);
            if (!storedData) return {};
            const parsedData = JSON.parse(storedData);
            if (Object.values(parsedData).some(val => typeof val === 'number')) {
                console.log('[贡献数据迁移] 检测到旧的课程级冷却数据，将清空以使用新的作业级冷却机制。');
                localStorage.removeItem(CONTRIBUTED_ASSIGNMENTS_KEY);
                return {};
            }
            return (typeof parsedData === 'object' && parsedData !== null) ? parsedData : {};
        } catch (error) {
            console.error('读取已贡献作业数据失败，将重置:', error);
            localStorage.removeItem(CONTRIBUTED_ASSIGNMENTS_KEY);
            return {};
        }
    }
    function markAssignmentAsContributed(groupId, nodeId) {
        if (!groupId || !nodeId) return;
        const contributedData = getContributedAssignmentsData();
        const groupIdStr = groupId.toString();
        const nodeIdStr = nodeId.toString();
        if (!contributedData[groupIdStr]) {
            contributedData[groupIdStr] = {};
        }
        contributedData[groupIdStr][nodeIdStr] = Date.now();
        localStorage.setItem(CONTRIBUTED_ASSIGNMENTS_KEY, JSON.stringify(contributedData));
        console.log(`[本地记录] 作业 (课程 ${groupId}, 节点 ${nodeId}) 的贡献时间戳已更新。`);
    }
    async function checkAccountConsistency() {
        const boundUserId = localStorage.getItem('xiaoya_bound_user_id');
        if (!boundUserId) {
            return true;
        }
        const token = getToken();
        if (!token) {
            showNotification('无法获取小雅 Token，请刷新页面或重新登录。', { type: 'error' });
            return false;
        }
        const currentUserInfo = await getCurrentUserInfo(token);
        if (!currentUserInfo || !currentUserInfo.id) {
            showNotification('无法获取当前小雅用户信息，请刷新或重新登录。', { type: 'error' });
            return false;
        }
        if (currentUserInfo.id.toString() !== boundUserId) {
            showNotification(
                '检测到账号不一致！当前操作需要使用激活时绑定的账号。',
                { type: 'error', duration: 8000 }
            );
            const confirmed = await showConfirmNotification(
                '脚本检测到当前登录的小雅账号与激活脚本时使用的账号不一致。是否要清除当前激活信息，以便使用新账号重新激活？（你的激活码依旧有效）',
                {
                    animation: 'scale',
                    title: '账号不一致警告',
                    confirmText: '清除并重新激活',
                    cancelText: '取消操作'
                }
            );
            if (confirmed) {
                localStorage.removeItem('xiaoya_access_token');
                localStorage.removeItem('xiaoya_refresh_token');
                localStorage.removeItem('xiaoya_bound_user_id');
                setTimeout(() => promptActivationCode(), 300);
            }
            return false;
        }
        return true;
    }
    async function getTaskNotices(groupId) {
        const now = Date.now();
        if (
            taskNoticesCache.groupId === groupId &&
            taskNoticesCache.data &&
            (now - taskNoticesCache.timestamp) < taskNoticesCache.CACHE_DURATION
        ) {
            return taskNoticesCache.data;
        }
        try {
            const response = await fetch(
                `${window.location.origin}/api/jx-stat/group/task/queryTaskNotices?group_id=${groupId}&role=1`,
                {
                    headers: {
                        'authorization': `Bearer ${getToken()}`,
                        'content-type': 'application/json; charset=utf-8'
                    }
                }
            );
            const data = await response.json();
            if (!data.success) {
                throw new Error('获取作业信息失败');
            }
            taskNoticesCache = {
                groupId,
                data: data.data,
                timestamp: now,
                CACHE_DURATION: taskNoticesCache.CACHE_DURATION
            };
            return data.data;
        } catch (error) {
            console.error('获取任务信息失败:', error);
            return null;
        }
    }
    async function checkAssignmentStatus(groupId, nodeId) {
        try {
            const data = await getTaskNotices(groupId);
            if (!data) return null;
            const tasks = data.student_tasks || [];
            const task = tasks.find(t => t.node_id === nodeId);
            if (task) {
                const endTime = new Date(task.end_time);
                const now = new Date();
                const isExpired = now > endTime;
                const isCompleted = task.finish === 2;
                return {
                    isExpired,
                    isCompleted,
                    canSubmitAfterExpired: task.is_allow_after_submitted,
                    endTime,
                    status: isCompleted ? '已完成' : (isExpired ? '已截止' : '进行中')
                };
            }
            throw new Error('未找到作业信息');
        } catch (error) {
            console.error('检查作业状态失败:', error);
            return null;
        }
    }
    async function isTaskPage() {
        const groupId = getGroupIDFromUrl(window.location.href);
        const nodeId = getNodeIDFromUrl(window.location.href);
        if (!groupId || !nodeId) {
            return false;
        }
        const taskData = await getTaskNotices(groupId);
        if (!taskData || !taskData.student_tasks) {
            return false;
        }
        const currentTask = taskData.student_tasks.find(task => task.node_id === nodeId);
        if (!currentTask) {
            return false;
        }
        const validTaskTypes = [2, 3, 4, 5];
        return validTaskTypes.includes(currentTask.task_type);
    }
    async function getAnswerRecordId(nodeId, groupId, token) {
        try {
            const status = await checkAssignmentStatus(groupId, nodeId);
            if (status) {
                if (status.isCompleted) {
                    showNotification(`该作业已完成，将不会获取答题记录，仅可查看答案。`, {
                        type: 'warning',
                        keywords: ['已完成'],
                        animation: 'scale'
                    });
                    return null;
                }
                if (status.isExpired) {
                    if (!status.canSubmitAfterExpired) {
                        showNotification(`作业已于 ${status.endTime.toLocaleString()} 截止，且不允许补交，仅可查看答案。`, {
                            type: 'warning',
                            keywords: ['截止', '不允许补交'],
                            animation: 'fadeSlide'
                        });
                        return null;
                    }
                    showNotification(`作业已于 ${status.endTime.toLocaleString()} 截止，但允许补交。`, {
                        type: 'info',
                        keywords: ['截止', '允许补交'],
                        animation: 'slideRight'
                    });
                }
            }
        } catch (error) {
            console.warn("检查作业状态时发生错误，将继续尝试获取记录ID:", error);
        }
        const url = `${window.location.origin}/api/jx-iresource/survey/course/task/flow/v2?node_id=${nodeId}&group_id=${groupId}`;
        console.log('[答题记录] 正在请求任务流程信息:', url);
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'authorization': `Bearer ${token}`,
                    'content-type': 'application/json; charset=utf-8'
                },
                credentials: 'include'
            });
            if (!response.ok) {
                let errorMsg = `获取答题记录ID失败，服务器状态: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.message || errorMsg;
                } catch (e) {
                }
                throw new Error(errorMsg);
            }
            const data = await response.json();
            if (data.success && data.data) {
                let recordId = null;
                if (data.data.task_flow_record && Array.isArray(data.data.task_flow_record) && data.data.task_flow_record.length > 0) {
                    const record = data.data.task_flow_record[0];
                    if (record && record.answer_record_id) {
                        recordId = record.answer_record_id;
                        console.log(`[答题记录] 从 task_flow_record 成功获取 answer_record_id: ${recordId}`);
                        return recordId;
                    }
                }
                if (!recordId && data.data.task_flow_template && Array.isArray(data.data.task_flow_template) && data.data.task_flow_template.length > 0) {
                    const template = data.data.task_flow_template[0];
                    if (template && template.answer_record_id) {
                        recordId = template.answer_record_id;
                        console.log(`[答题记录] 从 task_flow_template (兼容模式) 成功获取 answer_record_id: ${recordId}`);
                        return recordId;
                    }
                }
            }
            throw new Error('未找到有效的答题记录。请先进入该作业的答题页面以生成它，然后再返回此页面重试。');
        } catch (error) {
            console.error('获取 answer_record_id 时发生错误:', error);
            throw error;
        }
    }
    async function getAndStoreAnswers() {
        if (!(await isTaskPage())) {
            showNotification('当前不是有效的作业/测验页面，或者脚本无法识别。', { type: 'warning' });
            return false;
        }
        const token = getToken();
        if (!token) {
            showNotification('无法获取token，请确保已登录。', { type: 'error' });
            return false;
        }
        if (!(await checkAccountConsistency())) {
            console.warn("[操作中止] 因账号不一致，已取消获取答案。");
            return false;
        }
        const currentUrl = window.location.href;
        const node_id = getNodeIDFromUrl(currentUrl);
        const group_id = getGroupIDFromUrl(currentUrl);
        if (!node_id || !group_id) {
            showNotification('无法获取必要参数，请确保在正确的页面。', { type: 'error' });
            return false;
        }
        const progress = createProgressBar();
        progress.show();
        let overallSuccess = false;
        let hitCount = 0;
        let missCount = 0;
        let totalQueryableQuestions = 0;
        try {
            progress.update(0, 100, '正在获取试卷结构', '%');
            const resourceResponse = await fetch(`${window.location.origin}/api/jx-iresource/resource/queryResource/v3?node_id=${node_id}`, { headers: { 'authorization': `Bearer ${token}` }, credentials: 'include' });
            const resourceData = await resourceResponse.json();
            if (!resourceData.success || !resourceData.data || !resourceData.data.resource) {
                throw new Error('获取试卷资源失败: ' + (resourceData.message || '返回数据结构不正确'));
            }
            progress.update(5, 100, '试卷结构获取成功', '%');
            const paperId = resourceData.data.resource.id;
            const assignmentTitle = resourceData.data.resource.title || '作业答案';
            const paperDescription = resourceData.data.resource.description || null;
            if (paperDescription) {
                localStorage.setItem('paperDescription', paperDescription);
                console.log('[全局上下文] 已保存作业头部描述信息。');
            } else {
                localStorage.removeItem('paperDescription');
            }
            let questionsFromResource = JSON.parse(JSON.stringify(resourceData.data.resource.questions || []));
            progress.update(7, 100, '正在获取答题记录', '%');
            const recordId = await getAnswerRecordId(node_id, group_id, token);
            localStorage.setItem('recordId', recordId || '');
            progress.update(10, 100, '答题记录获取成功', '%');
            localStorage.setItem('groupId', group_id);
            localStorage.setItem('paperId', paperId);
            localStorage.setItem('assignmentTitle', assignmentTitle);
            function mergeAnswerIntoQuestion(question, detailedQuestionInfo) {
                if (detailedQuestionInfo.title && detailedQuestionInfo.title !== '{}' && detailedQuestionInfo.title !== question.title) {
                    question.title = detailedQuestionInfo.title;
                }
                if (!Array.isArray(question.answer_items) || !Array.isArray(detailedQuestionInfo.answer_items)) {
                    console.warn(`问题 ${question.id}: 原始题目或数据库答案的 answer_items 格式不正确，无法合并。`);
                    return;
                }
                switch (question.type) {
                    case 1: case 2: {
                        const valueToAnswerInfoMap = new Map();
                        detailedQuestionInfo.answer_items.forEach(apiItem => {
                            const identifier = getCanonicalContent(apiItem.value);
                            if (identifier) {
                                valueToAnswerInfoMap.set(identifier, {
                                    answer_checked: apiItem.answer_checked
                                });
                            }
                        });
                        question.answer_items.forEach(qItem => {
                            const identifier = getCanonicalContent(qItem.value);
                            const answerInfo = valueToAnswerInfoMap.get(identifier);
                            if (answerInfo) {
                                qItem.answer_checked = answerInfo.answer_checked;
                            } else {
                                qItem.answer_checked = 1;
                                console.warn(`问题 ${question.id} (选择题): 无法根据内容匹配选项。`, qItem.value);
                            }
                        });
                        break;
                    }
                    case 5: {
                        const dbCorrectAnswer = detailedQuestionInfo.answer_items.find(item => item.answer_checked === 2);
                        if (!dbCorrectAnswer) {
                            console.warn(`问题 ${question.id} (判断题): 题库中未找到正确答案。`);
                            break;
                        }
                        const isDbAnswerTrue = dbCorrectAnswer.value === 'true';
                        question.answer_items.forEach(qItem => {
                            const pageOptionText = getCanonicalContent(qItem.value) || parseRichTextToPlainText(qItem.value);
                            const isPageOptionTrue = pageOptionText.includes('正确') || pageOptionText.toLowerCase().includes('true');
                            if (isDbAnswerTrue === isPageOptionTrue) {
                                qItem.answer_checked = 2;
                            } else {
                                qItem.answer_checked = 1;
                            }
                        });
                        break;
                    }
                    case 4: {
                        if (question.answer_items.length !== detailedQuestionInfo.answer_items.length) {
                            console.warn(`问题 ${question.id} (填空题): 原始题目与答案的空的数量不匹配，可能导致答案错位。原始: ${question.answer_items.length}, 答案: ${detailedQuestionInfo.answer_items.length}`);
                        }
                        const minLength = Math.min(question.answer_items.length, detailedQuestionInfo.answer_items.length);
                        for (let i = 0; i < minLength; i++) {
                            if (detailedQuestionInfo.answer_items[i] && detailedQuestionInfo.answer_items[i].answer !== undefined) {
                                question.answer_items[i].answer = detailedQuestionInfo.answer_items[i].answer;
                            }
                        }
                        break;
                    }
                    case 12: case 13: {
                        if (question.type === 12) {
                            const valueToAnswerInfoMap = new Map();
                            detailedQuestionInfo.answer_items.forEach(apiItem => {
                                const identifier = getCanonicalContent(apiItem.value);
                                if (identifier) {
                                    valueToAnswerInfoMap.set(identifier, { answer: apiItem.answer });
                                }
                            });
                            question.answer_items.forEach(qItem => {
                                const identifier = getCanonicalContent(qItem.value);
                                const answerInfo = valueToAnswerInfoMap.get(identifier);
                                if (answerInfo && answerInfo.answer !== null && answerInfo.answer !== undefined) {
                                    qItem.answer = answerInfo.answer;
                                }
                            });
                        } else {
                            const currentOptionContentToIdMap = new Map();
                            question.answer_items.forEach(item => {
                                if (item.is_target_opt) {
                                    const identifier = getCanonicalContent(item.value);
                                    if (identifier) {
                                        currentOptionContentToIdMap.set(identifier, item.id);
                                    }
                                }
                            });
                            const dbStemValueToAnswerContentMap = new Map();
                            detailedQuestionInfo.answer_items.forEach(apiItem => {
                                if (!apiItem.is_target_opt) {
                                    const keyIdentifier = getCanonicalContent(apiItem.value);
                                    const valueIdentifier = getCanonicalContent(apiItem.answer);
                                    if (keyIdentifier) {
                                        dbStemValueToAnswerContentMap.set(keyIdentifier, valueIdentifier);
                                    }
                                }
                            });
                            question.answer_items.forEach(qItem => {
                                if (!qItem.is_target_opt) {
                                    const stemIdentifier = getCanonicalContent(qItem.value);
                                    const correctOptionIdentifier = dbStemValueToAnswerContentMap.get(stemIdentifier);
                                    if (correctOptionIdentifier) {
                                        const currentCorrectOptionId = currentOptionContentToIdMap.get(correctOptionIdentifier);
                                        if (currentCorrectOptionId) {
                                            qItem.answer = currentCorrectOptionId;
                                        } else {
                                            console.warn(`问题 ${question.id} (匹配题): 找到了答案内容 "${correctOptionIdentifier}"，但在当前页面选项中找不到匹配项。`);
                                        }
                                    }
                                }
                            });
                        }
                        break;
                    }
                    case 6: case 10: {
                        if (detailedQuestionInfo.answer_items?.[0]?.answer !== null && detailedQuestionInfo.answer_items?.[0]?.answer !== undefined) {
                            let rawAnswer = detailedQuestionInfo.answer_items[0].answer;
                            let finalAnswerObject = deepParseJsonString(rawAnswer);
                            let finalAnswerString = (typeof finalAnswerObject === 'object')
                                ? JSON.stringify(finalAnswerObject)
                                : String(finalAnswerObject);
                            if (!question.answer_items || question.answer_items.length === 0) {
                                question.answer_items = [{ answer: finalAnswerString }];
                            } else {
                                question.answer_items[0].answer = finalAnswerString;
                            }
                        }
                        if (question.type === 10 && detailedQuestionInfo.program_setting) { question.program_setting = detailedQuestionInfo.program_setting; }
                        break;
                    }
                    default:
                        console.log(`问题 ${question.id}: 类型 ${question.type} 暂无特殊答案处理逻辑。`);
                        break;
                }
            }
            const questionsToQuery = [];
            const SUPPORTED_QUERY_TYPES = [1, 2, 4, 5, 6, 10, 12, 13];
            const processQuestionForQuery = (q) => {
                if (!q) return;
                if (q.type === 9) {
                    if (q.subQuestions) {
                        q.subQuestions.forEach(processQuestionForQuery);
                    }
                } else if (SUPPORTED_QUERY_TYPES.includes(q.type)) {
                    const hash = generateContentHash(q);
                    if (hash) {
                        questionsToQuery.push({
                            question_id: q.id,
                            content_hash: hash,
                            paper_id: paperId,
                            group_id: group_id
                        });
                    } else {
                        console.warn(`[答案获取] 无法为题目 ${q.id} 生成哈希，跳过查询。`);
                    }
                } else {
                    console.warn(`[答案获取] 跳过不支持的题型 ${q.id} (类型: ${q.type})`);
                }
            };
            questionsFromResource.forEach(processQuestionForQuery);
            totalQueryableQuestions = questionsToQuery.length;
            if (totalQueryableQuestions === 0) {
                throw new Error('试卷中没有支持查询的题目');
            }
            const chunkSize = 30;
            let allAggregatedAnswers = [];
            progress.update(10, 100, `分批请求答案 (共 ${totalQueryableQuestions} 题)...`, '%');
            for (let i = 0; i < questionsToQuery.length; i += chunkSize) {
                const chunk = questionsToQuery.slice(i, i + chunkSize);
                const currentProgress = 10 + (i / questionsToQuery.length) * 80;
                progress.update(currentProgress, 100, `请求第 ${Math.floor(i / chunkSize) + 1} 批答案...`, '%');
                const batchResult = await authedFetch('queryAllAnswers', { questionsToQuery: chunk });
                if (!batchResult.success || !Array.isArray(batchResult.allAnswers)) {
                    throw new Error(`获取批次答案失败: ${batchResult.error || '后端返回数据格式不正确'}`);
                }
                allAggregatedAnswers.push(...batchResult.allAnswers);
            }
            progress.update(90, 100, `所有批次请求成功，处理数据...`, '%');
            const allAnswersMap = new Map();
            hitCount = 0;
            allAggregatedAnswers.forEach(item => {
                if (!item || !item.result) { console.warn(`获取问题 ${item?.question_id} 答案失败: 无效的返回项`); return; }
                const questionData = item.result;
                if (questionData && questionData.type) {
                    hitCount++;
                    allAnswersMap.set(item.question_id, questionData);
                } else {
                    console.warn(`获取问题 ${item?.question_id} 答案失败:`, questionData.error || '无法识别的数据格式或未找到答案');
                }
            });
            missCount = totalQueryableQuestions - hitCount;
            progress.update(95, 100, '正在合并答案...', '%');
            questionsFromResource.forEach(question => {
                const detailedQuestionInfo = allAnswersMap.get(question.id);
                if (detailedQuestionInfo) {
                    mergeAnswerIntoQuestion(question, detailedQuestionInfo);
                }
                if (question.type === 9 && question.subQuestions) {
                    question.subQuestions.forEach(subQuestion => {
                        const detailedSubQuestionInfo = allAnswersMap.get(subQuestion.id);
                        if (detailedSubQuestionInfo) {
                            mergeAnswerIntoQuestion(subQuestion, detailedSubQuestionInfo);
                        }
                    });
                }
            });
            localStorage.setItem('answerData', JSON.stringify(questionsFromResource));
            progress.update(100, 100, '所有答案信息获取完成', '!');
            overallSuccess = true;
        } catch (error) {
            console.error('获取或处理答案失败:', error);
            const errorMessage = error.message.toLowerCase();
            if (errorMessage.includes('欺诈行为警告')) {
                showNotification('检测到异常操作，你的授权已被吊销，请重新激活。', { type: 'error', duration: 8000, animation: 'scale' });
                localStorage.removeItem('xiaoya_access_token'); localStorage.removeItem('xiaoya_refresh_token'); setTimeout(promptActivationCode, 1000);
            } else if (errorMessage.includes('激活')) {
                showNotification('你的凭证已失效或需要激活，请操作...', { type: 'warning', duration: 5000, animation: 'scale' });
                setTimeout(promptActivationCode, 500);
            } else {
                showNotification(`获取答案数据失败：${error.message}`, { type: 'error' });
            }
            overallSuccess = false;
        } finally {
            progress.hide();
            if (overallSuccess) {
                let message;
                let type;
                let keywords = [String(hitCount), String(missCount), String(totalQueryableQuestions)];
                if (hitCount === totalQueryableQuestions && totalQueryableQuestions > 0) {
                    message = `答案获取成功！题库精准命中全部 ${totalQueryableQuestions} 道题！`;
                    type = 'success';
                } else if (hitCount > 0) {
                    message = `答案获取成功！共命中 ${hitCount} 道，未命中 ${missCount} 道。`;
                    type = 'success';
                    keywords.push('命中', '未命中');
                } else {
                    message = `答案获取完成，但题库暂无收录 (共查询 ${totalQueryableQuestions} 道题)。`;
                    type = 'warning';
                    keywords.push('暂无收录');
                }
                showNotification(message, { type: type, keywords: keywords, animation: 'slideRight', duration: 8000 });
            }
        }
        return overallSuccess;
    }
    const SUPPORTED_CONTRIBUTION_TYPES = [1, 2, 4, 5, 6, 10, 12, 13];
    function hasValidAnswer_frontEnd(questionData) {
        if (!questionData || !SUPPORTED_CONTRIBUTION_TYPES.includes(questionData.type)) {
            return false;
        }
        if (!Array.isArray(questionData.answer_items)) {
            return false;
        }
        switch (questionData.type) {
            case 1:
            case 2:
            case 5:
                return questionData.answer_items.some(item => item.answer_checked === 2);
            case 4:
                return questionData.answer_items.some(item => {
                    const answer = item.answer;
                    if (answer === null || answer === undefined || answer === '' || answer === '{}') return false;
                    try {
                        const parsed = JSON.parse(answer);
                        if (parsed.blocks && parsed.blocks.length === 1 && parsed.blocks[0].text === '') {
                            return false;
                        }
                    } catch (e) {
                    }
                    return true;
                });
            case 12:
                return questionData.answer_items.length > 0 && questionData.answer_items.every(
                    item => item.answer !== null && item.answer !== undefined && item.answer !== ''
                );
            case 13:
                return questionData.answer_items.some(
                    item => !item.is_target_opt && item.answer !== null && item.answer !== undefined && item.answer !== ''
                );
            case 6:
            case 10: {
                if (questionData.answer_items.length === 0) return false;
                const answer = questionData.answer_items[0]?.answer;
                if (answer === null || answer === undefined || answer === '') return false;
                try {
                    const parsed = JSON.parse(answer);
                    if (parsed.blocks && Array.isArray(parsed.blocks)) {
                        if (parsed.blocks.length === 0) return false;
                        if (parsed.blocks.length === 1 && parsed.blocks[0].text === '') {
                            return parsed.blocks[0].type === 'atomic';
                        }
                    }
                } catch (e) {
                }
                return true;
            }
            default:
                return false;
        }
    }
    async function contributeSingleAssignment(groupId, nodeId) {
        const token = getToken();
        if (!token) return { success: false, error: '无法获取token' };
        try {
            const resourceResponse = await fetch(`${window.location.origin}/api/jx-iresource/resource/queryResource/v3?node_id=${nodeId}`, { headers: { 'authorization': `Bearer ${token}` } });
            const resourceData = await resourceResponse.json();
            if (!resourceData.success) return { success: false, error: '获取试卷资源失败' };
            const paperId = resourceData.data?.resource?.id;
            if (!paperId) return { success: false, error: '无法从资源中获取 paperId' };
            const answerSheetResponse = await fetch(`${window.location.origin}/api/jx-iresource/survey/course/queryStuPaper/v2?paper_id=${paperId}&group_id=${groupId}&node_id=${nodeId}`, { headers: { 'authorization': `Bearer ${token}` } });
            const answerSheetData = await answerSheetResponse.json();
            if (!answerSheetData.success || !answerSheetData.data || !answerSheetData.data.questions || answerSheetData.data.questions.length === 0) {
                return { success: false, error: '获取答案数据失败: ' + (answerSheetData.message || '无题目信息') };
            }
            const flattenQuestions = (questionList) => {
                let flatList = [];
                if (!Array.isArray(questionList)) {
                    console.warn("[flattenQuestions] 输入不是一个数组:", questionList);
                    return flatList;
                }
                questionList.forEach(q => {
                    if (!q) return;
                    flatList.push(q);
                    if (q.type === 9 && Array.isArray(q.subQuestions)) {
                        flatList.push(...flattenQuestions(q.subQuestions));
                    }
                });
                return flatList;
            };
            const clonedQuestions = JSON.parse(JSON.stringify(answerSheetData.data.questions));
            const allClonedQuestionsMap = new Map(flattenQuestions(clonedQuestions).map(q => [q.id, q]));
            const originalQuestionsData = answerSheetData.data.questions;
            const allOriginalQuestionsMap = new Map(flattenQuestions(originalQuestionsData).map(q => [q.id, q]));
            const studentCorrectAnswers = new Map();
            if (answerSheetData.data.answer_record && answerSheetData.data.answer_record.answers) {
                answerSheetData.data.answer_record.answers.forEach(ans => {
                    if (ans.correct === 2 || ans.score > 0) {
                        studentCorrectAnswers.set(ans.question_id, ans.answer);
                    }
                });
            }
            allClonedQuestionsMap.forEach(question => {
                const studentAnswer = studentCorrectAnswers.get(question.id);
                if (studentAnswer !== undefined) {
                    console.log(`[贡献] 题目 ${question.id} (类型 ${question.type}) 使用【学生正确作答记录】填充。`);
                    switch (question.type) {
                        case 1: case 5:
                            question.answer_items.forEach(item => { item.answer_checked = (item.id === String(studentAnswer)) ? 2 : 1; });
                            break;
                        case 2: {
                            let selectedItemIds = [];
                            if (Array.isArray(studentAnswer)) selectedItemIds = studentAnswer.map(String);
                            else if (typeof studentAnswer === 'string') selectedItemIds = studentAnswer.split(',').map(id => id.trim()).filter(id => id);
                            question.answer_items.forEach(item => { item.answer_checked = selectedItemIds.includes(item.id) ? 2 : 1; });
                            break;
                        }
                        case 4:
                            try {
                                const fillAnswersObject = JSON.parse(studentAnswer);
                                question.answer_items.forEach(item => { if (fillAnswersObject.hasOwnProperty(item.id)) { item.answer = JSON.stringify({ blocks: [{ text: fillAnswersObject[item.id] || '' }] }); } });
                            } catch (e) { console.warn(`[贡献] 解析学生填空题答案失败 (ID: ${question.id})`, e); }
                            break;
                        case 6:
                            if (question.answer_items && question.answer_items.length > 0) question.answer_items[0].answer = JSON.stringify({ blocks: [{ text: studentAnswer }] });
                            break;
                        case 10:
                            try {
                                const parsedAnswer = JSON.parse(studentAnswer);
                                if (!question.program_setting) question.program_setting = {};
                                question.program_setting.code_answer = parsedAnswer.code || studentAnswer;
                            } catch (e) {
                                if (!question.program_setting) question.program_setting = {};
                                question.program_setting.code_answer = studentAnswer;
                            }
                            break;
                        case 12: {
                            let sortedItemIds = [];
                            if (Array.isArray(studentAnswer)) sortedItemIds = studentAnswer.map(String);
                            else if (typeof studentAnswer === 'string') sortedItemIds = studentAnswer.split(',').map(id => id.trim()).filter(id => id);
                            question.answer_items.forEach(item => { const order = sortedItemIds.indexOf(item.id); item.answer = (order !== -1) ? (order + 1).toString() : ''; });
                            break;
                        }
                        case 13:
                            try {
                                const matchObject = (typeof studentAnswer === 'string' ? JSON.parse(studentAnswer) : studentAnswer)[0] || (typeof studentAnswer === 'string' ? JSON.parse(studentAnswer) : studentAnswer);
                                const optionIdToValueMap = new Map();
                                question.answer_items.forEach(item => {
                                    if (item.is_target_opt) {
                                        optionIdToValueMap.set(item.id, item.value);
                                    }
                                });
                                question.answer_items.forEach(item => {
                                    if (!item.is_target_opt && matchObject.hasOwnProperty(item.id)) {
                                        const matchedOptionId = matchObject[item.id];
                                        if (optionIdToValueMap.has(matchedOptionId)) {
                                            item.answer = optionIdToValueMap.get(matchedOptionId);
                                        }
                                    }
                                });
                            } catch (e) { console.warn(`[贡献] 解析学生匹配题答案失败 (ID: ${question.id})`, e); }
                            break;
                    }
                }
                else {
                    const originalQuestion = allOriginalQuestionsMap.get(question.id);
                    if (originalQuestion && hasValidAnswer_frontEnd(originalQuestion)) {
                        console.log(`[贡献] 题目 ${question.id} (类型 ${question.type}) 无学生作答记录，但使用【原始官方答案】。`);
                    } else {
                        console.log(`[贡献] 题目 ${question.id} (类型 ${question.type}) 无任何有效答案源，将在后续被过滤。`);
                    }
                }
            });
            const contributedQuestions = Array.from(allClonedQuestionsMap.values()).filter(q => hasValidAnswer_frontEnd(q));
            console.log(`[贡献] 准备贡献 ${contributedQuestions.length} 道高质量题目。`);
            if (contributedQuestions.length === 0) {
                return { success: false, error: '未解析到任何有效答案' };
            }
            const finalContributedData = contributedQuestions.map(q => {
                const hash = generateContentHash(q);
                if (!hash) {
                    console.warn(`[贡献] 无法为题目 ${q.id} 生成哈希，跳过贡献。`);
                    return null;
                }
                return {
                    question_id: q.id,
                    paper_id: q.paper_id,
                    content_hash: hash,
                    answer_data: q
                };
            }).filter(Boolean);
            if (finalContributedData.length === 0) {
                return { success: false, error: '所有可贡献题目都无法生成有效哈希' };
            }
            const response = await authedFetch('contributeAnswers', { contributedQuestions: finalContributedData });
            if (response.success) {
                markAssignmentAsContributed(groupId, nodeId);
                return { success: true, message: response.message };
            } else {
                return { success: false, error: response.error || '上传贡献失败' };
            }
        } catch (error) {
            console.error(`贡献作业 (nodeId: ${nodeId}) 时出错:`, error);
            return { success: false, error: error.message };
        }
    }
    async function asyncPool(poolLimit, array, iteratorFn) {
        const ret = [];
        const executing = [];
        for (const item of array) {
            const p = Promise.resolve().then(() => iteratorFn(item, array));
            ret.push(p);
            if (poolLimit <= array.length) {
                const e = p.then(() => executing.splice(executing.indexOf(e), 1));
                executing.push(e);
                if (executing.length >= poolLimit) {
                    await Promise.race(executing);
                }
            }
        }
        return Promise.all(ret);
    }
    async function scanAndContributeCourse(course, isPastCourse = false) {
        const groupId = course.id;
        const contributedData = getContributedAssignmentsData();
        const now = Date.now();
        try {
            const tasksData = await getTaskNotices(groupId);
            if (!tasksData || !tasksData.student_tasks) {
                console.error(`[后台扫描] 获取课程 "${course.name}" (ID: ${groupId}) 的任务列表失败。`);
                return { success: 0, failed: 0 };
            }
            const validTaskTypes = [2, 3, 4, 5];
            const allAssignments = tasksData.student_tasks.filter(task =>
                validTaskTypes.includes(task.task_type)
            );
            const assignmentsToScan = allAssignments.filter(task => {
                const lastScanTimestamp = contributedData[groupId.toString()]?.[task.node_id.toString()];
                if (!lastScanTimestamp) {
                    return true;
                }
                if (isPastCourse) {
                    console.log(`[后台扫描] 作业 (ID: ${task.node_id}) 属于已结束课程且已贡献过，将永久跳过。`);
                    return false;
                }
                return now - lastScanTimestamp > CONTRIBUTION_RESCAN_THRESHOLD;
            });
            if (assignmentsToScan.length === 0) {
                console.log(`[后台扫描] 课程 "${course.name}" (ID: ${groupId}) 中没有需要贡献的新作业。`);
                return { success: 0, failed: 0 };
            }
            console.log(`[后台扫描] 课程 "${course.name}" (ID: ${groupId}) 中发现 ${assignmentsToScan.length} 个需要处理的作业。`);
            let successCount = 0;
            let failCount = 0;
            const CONCURRENCY_LIMIT = 2;
            await asyncPool(CONCURRENCY_LIMIT, assignmentsToScan, async (task) => {
                const result = await contributeSingleAssignment(groupId, task.node_id);
                if (result.success) {
                    successCount++;
                } else {
                    if (result.error === '未解析到任何有效答案') {
                        console.log(`[后台扫描] 作业 (ID: ${task.node_id}) 无有效答案可贡献，标记为已检查。`);
                        markAssignmentAsContributed(groupId, task.node_id);
                    } else {
                        failCount++;
                        console.warn(`[后台扫描] 贡献作业 (ID: ${task.node_id}) 失败: ${result.error}`);
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 800));
            });
            return { success: successCount, failed: failCount };
        } catch (error) {
            console.error(`[后台扫描] 处理课程 "${course.name}" (ID: ${groupId}) 时发生严重错误:`, error);
            return { success: 0, failed: 1 };
        }
    }
    async function backgroundContributeAllCourses() {
        if (!autoContributeEnabled) {
            return false;
        }
        if (!(await checkAccountConsistency())) {
            console.log("[后台扫描] 因账号不一致，已中止全量扫描。");
            return false;
        }
        const token = getToken();
        if (!token) {
            return false;
        }
        ContributionProgressUI.show('正在准备后台贡献任务...');
        console.log('[后台扫描] 开始执行全量课程扫描...');
        try {
            const MAX_RETRIES = 3;
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log(`[后台扫描] 正在进行用量预检 (尝试 ${attempt}/${MAX_RETRIES})...`);
                    await authedFetch('checkUsage', {});
                    console.log(`[后台扫描] 用量预检成功。`);
                    break;
                } catch (error) {
                    console.warn(`[后台扫描] 用量预检尝试 ${attempt} 失败:`, error.message);
                    if (attempt < MAX_RETRIES) {
                        const delay = 1500 * attempt;
                        console.log(`[后台扫描] 将在 ${delay / 1000} 秒后重试...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        console.error(`[后台扫描] 用量预检在 ${MAX_RETRIES} 次尝试后彻底失败，后台贡献任务中止。`);
                        throw error;
                    }
                }
            }
            const fetchCourses = async (timeFlag) => {
                const url = `${window.location.origin}/api/jx-iresource/group/student/groups?time_flag=${timeFlag}`;
                const response = await fetch(url, { headers: { 'authorization': `Bearer ${token}` } });
                if (!response.ok) throw new Error(`获取课程列表失败 (flag=${timeFlag})`);
                const data = await response.json();
                return data.success ? data.data : [];
            };
            const [currentCourses, pastCourses] = await Promise.all([fetchCourses(1), fetchCourses(3)]);
            const courseMap = new Map();
            currentCourses.forEach(course => course && course.id && courseMap.set(course.id, { ...course, isPast: false }));
            pastCourses.forEach(course => {
                if (course && course.id && !courseMap.has(course.id)) {
                    courseMap.set(course.id, { ...course, isPast: true });
                }
            });
            const allCourses = Array.from(courseMap.values());
            if (allCourses.length === 0) {
                console.log('[后台扫描] 未获取到任何课程列表，任务结束。');
                ContributionProgressUI.complete('未找到任何课程。');
                return true;
            }
            ContributionProgressUI.show(`后台将检查 ${allCourses.length} 门课程中的新作业...`);
            showNotification(`后台将为你检查所有课程，寻找可贡献的新答案...`, { type: 'info', duration: 7000 });
            let totalNewContributions = 0;
            for (let i = 0; i < allCourses.length; i++) {
                const courseInfo = allCourses[i];
                console.log(`[后台扫描] [${i + 1}/${allCourses.length}] 正在检查课程: ${courseInfo.name} ${courseInfo.isPast ? '(已结束)' : ''}`);
                ContributionProgressUI.update(i + 1, allCourses.length, courseInfo.name);
                const result = await scanAndContributeCourse(courseInfo, courseInfo.isPast);
                totalNewContributions += result.success;
            }
            console.log(`[后台扫描] 全部完成！本次共贡献了 ${totalNewContributions} 个新作业。`);
            ContributionProgressUI.complete(`扫描完成！感谢你的 ${totalNewContributions} 个新贡献！`);
            if (totalNewContributions > 0) {
                showNotification(`后台扫描完成，感谢你为答案库贡献了 ${totalNewContributions} 个新作业！`, { type: 'success', duration: 10000 });
            }
            return true;
        } catch (error) {
            const errorMessage = error.message.toLowerCase();
            if (errorMessage.includes('激活') || errorMessage.includes('失效') || errorMessage.includes('到期') || errorMessage.includes('欺诈')) {
                console.error(`[后台扫描] 因授权问题中止: "${error.message}"`);
            } else {
                console.error('[后台扫描] 操作失败:', error);
            }
            ContributionProgressUI.error(error.message);
            return false;
        }
    }
    async function getSubmittedAnswers() {
        if (!(await isTaskPage())) {
            showNotification('当前不是有效的作业/测验页面，或者脚本无法识别。', {
                type: 'warning',
                keywords: ['作业', '测验'],
                animation: 'scale'
            });
            return;
        }
        try {
            const token = getToken();
            if (!token) {
                showNotification('无法获取token，请确保已登录。', {
                    type: 'error',
                    keywords: ['token', '登录'],
                    animation: 'fadeSlide'
                });
                return;
            }
            const currentUrl = window.location.href;
            const node_id = getNodeIDFromUrl(currentUrl);
            const group_id = getGroupIDFromUrl(currentUrl);
            if (!node_id || !group_id) {
                showNotification('无法获取必要参数，请确保在正确的页面。', {
                    type: 'error',
                    keywords: ['参数'],
                    animation: 'slideRight'
                });
                return;
            }
            const progress = createProgressBar();
            progress.show();
            progress.update(0, 1, '正在获取已提交作业');
            const resourceData = await fetch(
                `${window.location.origin}/api/jx-iresource/resource/queryResource/v3?node_id=${node_id}`,
                {
                    headers: {
                        'authorization': `Bearer ${token}`,
                        'content-type': 'application/json; charset=utf-8'
                    },
                    credentials: 'include'
                }
            ).then(res => res.json());
            if (!resourceData.success) {
                throw new Error('获取试卷资源失败');
            }
            const assignmentTitle = resourceData.data?.resource?.title || '作业答案';
            localStorage.setItem('assignmentTitle', assignmentTitle);
            const paperDescription = resourceData.data?.resource?.description || null;
            if (paperDescription) {
                localStorage.setItem('paperDescription', paperDescription);
                console.log('[全局上下文 - 已提交] 已同步更新作业头部描述信息。');
            } else {
                localStorage.removeItem('paperDescription');
                console.log('[全局上下文 - 已提交] 当前作业无头部描述，已清除旧的缓存。');
            }
            const paper_id = resourceData.data.resource.id;
            const submittedAnswerResponse = await fetch(
                `${window.location.origin}/api/jx-iresource/survey/course/queryStuPaper/v2?paper_id=${paper_id}&group_id=${group_id}&node_id=${node_id}`,
                {
                    headers: {
                        'authorization': `Bearer ${token}`,
                        'content-type': 'application/json; charset=utf-8'
                    },
                    credentials: 'include'
                }
            );
            const submittedAnswerData = await submittedAnswerResponse.json();
            progress.update(1, 1, '已获取提交答案');
            if (!submittedAnswerData.success) {
                throw new Error('获取已提交作业失败');
            }
            if (submittedAnswerData.data && submittedAnswerData.data.answer_record &&
                submittedAnswerData.data.answer_record.answers &&
                submittedAnswerData.data.answer_record.answers.length > 0) {
                localStorage.setItem('submittedAnswerData', JSON.stringify(submittedAnswerData.data.answer_record.answers));
                const questionsData = resourceData.data.resource.questions;
                const allQuestionsMap = new Map();
                questionsData.forEach(q => {
                    allQuestionsMap.set(q.id, q);
                    if (q.type === 9 && q.subQuestions) {
                        q.subQuestions.forEach(sq => {
                            allQuestionsMap.set(sq.id, sq);
                            sq.parent_question_id = q.id;
                        });
                    }
                });
                submittedAnswerData.data.answer_record.answers.forEach(submittedAnswer => {
                    const questionId = submittedAnswer.question_id;
                    const question = allQuestionsMap.get(questionId);
                    if (question) {
                        if (question.type === 1 || question.type === 5) {
                            const selectedItemId = String(submittedAnswer.answer);
                            if (question.answer_items) {
                                question.answer_items.forEach(item => {
                                    item.answer_checked = (item.id === selectedItemId) ? 2 : 1;
                                });
                            }
                        } else if (question.type === 2) {
                            let selectedItemIds = [];
                            if (Array.isArray(submittedAnswer.answer)) {
                                selectedItemIds = submittedAnswer.answer.map(String);
                            } else if (typeof submittedAnswer.answer === 'string') {
                                if (submittedAnswer.answer.includes(',')) {
                                    selectedItemIds = submittedAnswer.answer.split(',').map(id => id.trim()).filter(id => id);
                                } else if (submittedAnswer.answer.length > 0) {
                                    selectedItemIds = [submittedAnswer.answer];
                                }
                            }
                            if (question.answer_items) {
                                question.answer_items.forEach(item => {
                                    item.answer_checked = selectedItemIds.includes(item.id) ? 2 : 1;
                                });
                            }
                        } else if (question.type === 4) {
                            try {
                                const fillAnswersObject = JSON.parse(submittedAnswer.answer);
                                if (question.answer_items && typeof fillAnswersObject === 'object' && fillAnswersObject !== null) {
                                    question.answer_items.forEach(item => {
                                        if (fillAnswersObject.hasOwnProperty(item.id)) {
                                            const plainTextStudentAnswer = fillAnswersObject[item.id];
                                            item.answer = JSON.stringify({
                                                blocks: [{
                                                    key: `ans-${item.id}`,
                                                    text: plainTextStudentAnswer,
                                                    type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}
                                                }],
                                                entityMap: {}
                                            });
                                        } else {
                                            item.answer = JSON.stringify({
                                                blocks: [{
                                                    key: `empty-${item.id}`, text: "",
                                                    type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}
                                                }],
                                                entityMap: {}
                                            });
                                        }
                                    });
                                }
                            } catch (e) {
                                console.error(`解析填空题已提交作业失败 (questionId: ${questionId}):`, e, "Raw answer:", submittedAnswer.answer);
                                if (question.answer_items) {
                                    question.answer_items.forEach(item => {
                                        item.answer = JSON.stringify({
                                            blocks: [{
                                                key: `error-${item.id}`, text: "",
                                                type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}
                                            }],
                                            entityMap: {}
                                        });
                                    });
                                }
                            }
                        } else if (question.type === 6) {
                            if (question.answer_items && question.answer_items.length > 0) {
                                const plainTextStudentAnswer = submittedAnswer.answer;
                                try {
                                    JSON.parse(plainTextStudentAnswer);
                                    question.answer_items[0].answer = plainTextStudentAnswer;
                                } catch (err) {
                                    question.answer_items[0].answer = JSON.stringify({
                                        blocks: [{
                                            key: `ans-${question.id}`,
                                            text: plainTextStudentAnswer,
                                            type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}
                                        }],
                                        entityMap: {}
                                    });
                                }
                            }
                        } else if (question.type === 10) {
                            try {
                                const parsedAnswer = JSON.parse(submittedAnswer.answer);
                                if (parsedAnswer && parsedAnswer.code) {
                                    if (!question.program_setting) question.program_setting = {};
                                    question.program_setting.code_answer = parsedAnswer.code;
                                } else if (typeof submittedAnswer.answer === 'string' && !submittedAnswer.answer.startsWith('{')) {
                                    if (!question.program_setting) question.program_setting = {};
                                    question.program_setting.code_answer = submittedAnswer.answer;
                                }
                            } catch (e) {
                                if (question.program_setting) {
                                    question.program_setting.code_answer = submittedAnswer.answer;
                                } else {
                                    question.program_setting = { code_answer: submittedAnswer.answer };
                                }
                                console.warn(`解析编程题已获取答案可能不是标准JSON (questionId: ${questionId}):`, e, "Raw answer:", submittedAnswer.answer);
                            }
                        } else if (question.type === 12) {
                            let sortedItemIds = [];
                            if (Array.isArray(submittedAnswer.answer)) {
                                sortedItemIds = submittedAnswer.answer.map(String);
                            } else if (typeof submittedAnswer.answer === 'string') {
                                if (submittedAnswer.answer.includes(',')) {
                                    sortedItemIds = submittedAnswer.answer.split(',').map(id => id.trim()).filter(id => id);
                                } else if (submittedAnswer.answer.length > 0) {
                                    sortedItemIds = [submittedAnswer.answer];
                                }
                            }
                            if (question.answer_items && sortedItemIds.length > 0) {
                                question.answer_items.forEach(item => {
                                    const order = sortedItemIds.indexOf(item.id);
                                    if (order !== -1) {
                                        item.answer = (order + 1).toString();
                                    } else {
                                        item.answer = '';
                                        console.warn(`排序题 (questionId: ${questionId}) 的选项 item.id: ${item.id} 未在提交的答案中找到:`, sortedItemIds);
                                    }
                                });
                            }
                        } else if (question.type === 13) {
                            try {
                                let matchObject = null;
                                const parsedAnswerData = JSON.parse(submittedAnswer.answer);
                                if (Array.isArray(parsedAnswerData) && parsedAnswerData.length > 0 && typeof parsedAnswerData[0] === 'object') {
                                    matchObject = parsedAnswerData[0];
                                } else if (typeof parsedAnswerData === 'object' && !Array.isArray(parsedAnswerData)) {
                                    matchObject = parsedAnswerData;
                                }
                                if (matchObject && question.answer_items) {
                                    question.answer_items.forEach(item => {
                                        if (!item.is_target_opt) {
                                            if (matchObject.hasOwnProperty(item.id)) {
                                                item.answer = matchObject[item.id];
                                            } else {
                                                item.answer = '';
                                            }
                                        }
                                    });
                                }
                            } catch (e) {
                                console.error(`解析匹配题已获取答案失败 (questionId: ${questionId}):`, e, "Raw answer:", submittedAnswer.answer);
                            }
                        }
                    } else {
                        console.warn(`在 submittedAnswers 中找到一个答案，但其 question_id (${questionId}) 在 questionsData 或其子问题中均未找到。`);
                    }
                });
                localStorage.setItem('answerData', JSON.stringify(questionsData));
                progress.hide();
                showNotification('已提交作业获取成功！', {
                    type: 'success',
                    keywords: ['已提交', '答案', '获取'],
                    animation: 'scale'
                });
                return true;
            } else {
                progress.hide();
                showNotification('未找到已提交的答案，可能尚未提交或无权限查看。', {
                    type: 'warning',
                    keywords: ['未找到', '已提交'],
                    animation: 'fadeSlide'
                });
                return false;
            }
        } catch (error) {
            console.error('获取已提交作业失败:', error);
            showNotification('获取已提交作业失败：' + (error.message || '未知错误'), {
                type: 'error',
                keywords: ['获取', '失败'],
                animation: 'scale'
            });
            return false;
        }
    }
    async function fillAnswers() {
        const answerData = JSON.parse(localStorage.getItem('answerData'));
        const recordId = localStorage.getItem('recordId');
        const groupId = localStorage.getItem('groupId');
        const paperId = localStorage.getItem('paperId');
        if (!answerData || !recordId || !groupId || !paperId) {
            showNotification('缺少必要数据，请先获取答案或检查作业状态。', {
                type: 'error',
                keywords: ['数据', '获取', '检查'],
                animation: 'scale'
            });
            return;
        }
        const token = getToken();
        if (!token) {
            showNotification('无法获取token。', {
                type: 'error',
                keywords: ['token'],
                animation: 'slideRight'
            });
            return;
        }
        const progress = createProgressBar();
        progress.show();
        try {
            let completedCount = 0;
            const totalQuestions = answerData.length;
            const batchSize = 10;
            for (let i = 0; i < answerData.length; i += batchSize) {
                const batch = answerData.slice(i, i + batchSize);
                let localCompletedCount = completedCount;
                await Promise.all(batch.map(async question => {
                    await submitAnswer(question, recordId, groupId, paperId, token);
                    localCompletedCount++;
                    progress.update(localCompletedCount, totalQuestions);
                }));
                completedCount = localCompletedCount;
            }
            progress.hide();
            showNotification('答案填写完成！页面将于0.5s后刷新。', {
                type: 'success',
                keywords: ['答案', '填写', '刷新'],
                animation: 'slideRight'
            });
            const nodeId = getNodeIDFromUrl(window.location.href);
            const currentGroupId = getGroupIDFromUrl(window.location.href);
            if (nodeId && currentGroupId) sessionStorage.setItem(`xiaoya_autofilled_${currentGroupId}_${nodeId}`, 'true');
            setTimeout(() => {
                location.reload();
            }, 500);
        } catch (error) {
            progress.hide();
            console.error('填写答案失败:', error);
            showNotification('填写答案失败，请查看控制台。', {
                type: 'error',
                keywords: ['填写', '失败'],
                animation: 'scale'
            });
        }
    }
    async function submitAnswer(question, recordId, groupId, paperId, token) {
        let answer;
        let extAnswer = '';
        switch (question.type) {
            case 1: {
                answer = [question.answer_items.find(item => item.answer_checked === 2)?.id];
                break;
            }
            case 2: {
                answer = question.answer_items.filter(item => item.answer_checked === 2).map(item => item.id);
                break;
            }
            case 4: {
                const fillObject = {};
                question.answer_items.forEach(item => {
                    fillObject[item.id] = parseRichTextToPlainText(item.answer);
                });
                answer = [fillObject];
                break;
            }
            case 5: {
                answer = [question.answer_items.find(item => item.answer_checked === 2)?.id];
                break;
            }
            case 6: {
                answer = [question.answer_items[0].answer];
                break;
            }
            case 9: {
                if (question.subQuestions && question.subQuestions.length > 0) {
                    for (const subQuestion of question.subQuestions) {
                        await submitAnswer(subQuestion, recordId, groupId, paperId, token);
                    }
                }
                return;
            }
            case 10: {
                const progSetting = question.program_setting || {};
                const answerItem = question.answer_items?.[0];
                answer = [{
                    language: progSetting.language?.[0] || 'c',
                    code: progSetting.code_answer || '',
                    answer_item_id: answerItem?.id || ''
                }];
                break;
            }
            case 12: {
                answer = question.answer_items
                    .sort((a, b) => parseInt(a.answer) - parseInt(b.answer))
                    .map(item => item.id);
                break;
            }
            case 13: {
                const matchObject = {};
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
            }
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
        return fetch(`${window.location.origin}/api/jx-iresource/survey/answer`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(requestBody)
        });
    }
    const INLINE_STYLE_TAGS = {
        BOLD: { open: '<strong>', close: '</strong>' },
        ITALIC: { open: '<em>', close: '</em>' },
        UNDERLINE: { open: '<u>', close: '</u>' },
        STRIKETHROUGH: { open: '<s>', close: '</s>' },
        CODE: { open: '<code>', close: '</code>' },
        HIGHLIGHT: { open: '<mark>', close: '</mark>' },
        SUBSCRIPT: { open: '<sub>', close: '</sub>' },
        SUPERSCRIPT: { open: '<sup>', close: '</sup>' }
    };
    const STYLE_WRAP_ORDER = ['SUBSCRIPT', 'SUPERSCRIPT', 'CODE', 'BOLD', 'ITALIC', 'UNDERLINE', 'STRIKETHROUGH', 'HIGHLIGHT'];
    function escapeHtml(str = '') {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function escapeHtmlAttr(str = '') {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    function wrapWithStyles(html, stylesSet) {
        if (!stylesSet || stylesSet.size === 0) return html;
        let wrapped = html;
        STYLE_WRAP_ORDER.forEach(style => {
            const normalized = style.toUpperCase();
            if (stylesSet.has(normalized) && INLINE_STYLE_TAGS[normalized]) {
                const { open, close } = INLINE_STYLE_TAGS[normalized];
                wrapped = `${open}${wrapped}${close}`;
            }
        });
        return wrapped;
    }
    function getEntityByKey(entityMap, key) {
        if (!entityMap || key === undefined || key === null) return null;
        if (Object.prototype.hasOwnProperty.call(entityMap, key)) {
            return entityMap[key];
        }
        const stringKey = String(key);
        if (Object.prototype.hasOwnProperty.call(entityMap, stringKey)) {
            return entityMap[stringKey];
        }
        return null;
    }
    function findEntityCoveringRange(entityRanges = [], start, end, entityMap) {
        for (const range of entityRanges) {
            if (!range || typeof range.offset !== 'number' || typeof range.length !== 'number' || range.length <= 0) continue;
            const rangeStart = range.offset;
            const rangeEnd = range.offset + range.length;
            if (start >= rangeStart && end <= rangeEnd) {
                return getEntityByKey(entityMap, range.key);
            }
        }
        return null;
    }
    function convertEntityToHtml(entity, rawText) {
        if (!entity) return escapeHtml(rawText);
        const entityType = (entity.type || '').toUpperCase();
        const data = entity.data || {};
        if (entityType === 'INLINETEX' || entityType === 'INLINE_TEX' || entityType === 'TEX') {
            const tex = data.teX || data.tex || data.value || data.content;
            if (tex) {
                return `<span class="xiaoya-inline-math">\\(${escapeHtml(tex)}\\)</span>`;
            }
        } else if (entityType === 'BLOCKTEX' || entityType === 'TEXBLOCK' || entityType === 'DISPLAYTEX') {
            const texBlock = data.teX || data.tex || data.value || data.content;
            if (texBlock) {
                return `<div class="xiaoya-display-math">\\[${escapeHtml(texBlock)}\\]</div>`;
            }
        } else if (entityType === 'LINK' || entityType === 'HYPERLINK') {
            const href = data.url || data.href;
            if (href) {
                const targetAttr = data.target ? ` target="${escapeHtmlAttr(data.target)}"` : ' target="_blank"';
                return `<a href="${escapeHtmlAttr(href)}"${targetAttr} rel="noopener noreferrer">${escapeHtml(rawText) || escapeHtmlAttr(href)}</a>`;
            }
        } else if (entityType === 'IMAGE' || entityType === 'IMG') {
            if (data.src) {
                const src = escapeHtmlAttr(data.src);
                const alt = escapeHtmlAttr(data.alt || '内容图片');
                return `<img src="${src}" alt="${alt}" style="max-width:100%; height:auto; border-radius:8px;" />`;
            }
        }
        return escapeHtml(rawText);
    }
    function buildInlineHtml(block, entityMap) {
        const text = typeof block.text === 'string' ? block.text : '';
        if (!text) return '';
        const breakpoints = new Set([0, text.length]);
        (block.inlineStyleRanges || []).forEach(range => {
            if (range && typeof range.offset === 'number' && typeof range.length === 'number' && range.length > 0) {
                breakpoints.add(range.offset);
                breakpoints.add(range.offset + range.length);
            }
        });
        (block.entityRanges || []).forEach(range => {
            if (range && typeof range.offset === 'number' && typeof range.length === 'number' && range.length > 0) {
                breakpoints.add(range.offset);
                breakpoints.add(range.offset + range.length);
            }
        });
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '\n') {
                breakpoints.add(i);
                breakpoints.add(i + 1);
            }
        }
        const sortedBreakpoints = Array.from(breakpoints)
            .filter(index => index >= 0 && index <= text.length)
            .sort((a, b) => a - b);
        let html = '';
        for (let i = 0; i < sortedBreakpoints.length - 1; i++) {
            const start = sortedBreakpoints[i];
            const end = sortedBreakpoints[i + 1];
            if (start >= end) continue;
            const segment = text.slice(start, end);
            if (!segment) continue;
            if (segment === '\n') {
                html += '<br>';
                continue;
            }
            const styles = new Set();
            (block.inlineStyleRanges || []).forEach(range => {
                if (!range || typeof range.offset !== 'number' || typeof range.length !== 'number' || range.length <= 0) return;
                const rangeStart = range.offset;
                const rangeEnd = range.offset + range.length;
                if (start >= rangeStart && end <= rangeEnd) {
                    styles.add(String(range.style || '').toUpperCase());
                }
            });
            const entity = findEntityCoveringRange(block.entityRanges || [], start, end, entityMap);
            let segmentHtml = entity ? convertEntityToHtml(entity, segment) : escapeHtml(segment);
            if (segmentHtml && segmentHtml.replace) {
                segmentHtml = segmentHtml.replace(/ {2}/g, ' &nbsp;');
            }
            segmentHtml = wrapWithStyles(segmentHtml, styles);
            html += segmentHtml;
        }
        return html;
    }
    async function renderAtomicBlock(block, aiConfig = {}) {
        const data = block.data || {};
        const normalizedType = (data.type || '').toUpperCase();
        if (normalizedType === 'IMAGE' && data.src) {
            const fileIdMatch = data.src.match(/\/cloud\/file_access\/(\d+)/);
            if (fileIdMatch && fileIdMatch[1]) {
                const fileId = fileIdMatch[1];
                const imageUrl = `${window.location.origin}/api/jx-oresource/cloud/file_access/${fileId}?random=${Date.now()}`;
                return `<div><img src="${escapeHtmlAttr(imageUrl)}" alt="内容图片" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" onerror="this.style.display='none'; this.nextSibling.style.display='block';"/><div style="display:none; color:#D32F2F;font-style:italic;">[图片加载失败]</div></div>`;
            }
            return `<div>[图片链接格式无法解析]</div>`;
        }
        if (normalizedType === 'AUDIO' && data.data && data.data.quote_id) {
            const fileId = String(data.data.quote_id);
            const cacheKey = `audio_url_${fileId}`;
            let audioUrl = sessionStorage.getItem(cacheKey);
            if (!audioUrl) {
                audioUrl = await getAudioUrl(fileId);
                if (audioUrl) sessionStorage.setItem(cacheKey, audioUrl);
            }
            if (audioUrl) {
                const safeAudioUrl = escapeHtmlAttr(audioUrl);
                const safeFileId = escapeHtmlAttr(fileId);
                return `<div style="margin: 10px 0; padding: 12px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;"><audio controls preload="metadata" src="${safeAudioUrl}" style="width: 100%; outline: none;"></audio><div style="margin-top: 10px; text-align: right;"><button id="stt-only-btn-${safeFileId}" data-file-id="${safeFileId}" style="padding: 6px 12px; font-size: 13px; background-color: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s ease;">🎤 仅转录音频</button></div><div id="stt-result-container-${safeFileId}" style="margin-top: 10px; display: none; background-color: #fff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;"></div></div>`;
            }
            return `<div>[音频加载失败]</div>`;
        }
        if (normalizedType === 'VIDEO' && data.data && data.data.video_id) {
            const videoId = String(data.data.video_id);
            const cacheKey = `video_urls_${videoId}`;
            let urls = null;
            try {
                urls = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
            } catch (error) {
                urls = null;
            }
            if (!urls) {
                urls = await getVideoUrl(videoId);
                if (urls && urls.videoUrl) {
                    sessionStorage.setItem(cacheKey, JSON.stringify(urls));
                }
            }
            if (urls && urls.videoUrl) {
                const safeVideoUrl = escapeHtmlAttr(urls.videoUrl);
                const safeVideoId = escapeHtmlAttr(videoId);
                let videoHtml = `<div style="margin: 10px 0; padding: 12px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <video controls preload="metadata" src="${safeVideoUrl}" style="width: 100%; max-height: 400px; border-radius: 8px; outline: none;"></video>`;
                if (aiConfig.sttEnabled && aiConfig.sttVideoEnabled) {
                    videoHtml += `<div style="margin-top: 10px; text-align: right;">
                        <button id="video-stt-btn-${safeVideoId}" data-video-url="${safeVideoUrl}" style="padding: 6px 12px; font-size: 13px; background-color: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s ease;">
                            🎬 转录视频音频
                        </button>
                    </div>
                    <div id="video-stt-result-container-${safeVideoId}" style="margin-top: 10px; display: none; background-color: #fff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;"></div>`;
                }
                videoHtml += `</div>`;
                return videoHtml;
            }
            return `<div style="color:#D32F2F;font-style:italic;font-weight:bold;">[视频加载失败: ${escapeHtml(videoId)}]</div>`;
        }
        if ((normalizedType === 'MATH' || normalizedType === 'TEX' || normalizedType === 'TEXBLOCK' || normalizedType === 'DISPLAYTEX') && (data.teX || data.tex || data.value)) {
            const texBlock = data.teX || data.tex || data.value;
            return `<div class="xiaoya-display-math">\\[${escapeHtml(texBlock)}\\]</div>`;
        }
        return '';
    }
    async function parseRichTextContentAsync(content) {
        if (!content || typeof content !== 'string') return content || '';
        try {
            const jsonContent = JSON.parse(content);
            if (!jsonContent || !Array.isArray(jsonContent.blocks)) {
                return escapeHtml(content).replace(/\n/g, '<br>');
            }
            let htmlResult = '';
            const aiConfig = JSON.parse(localStorage.getItem('aiConfig') || '{}');
            const entityMap = jsonContent.entityMap || {};
            let activeListType = null;
            const closeActiveList = () => {
                if (activeListType === 'unordered-list-item') {
                    htmlResult += '</ul>';
                } else if (activeListType === 'ordered-list-item') {
                    htmlResult += '</ol>';
                }
                activeListType = null;
            };
            for (const block of jsonContent.blocks) {
                if (!block) continue;
                const blockType = block.type || 'unstyled';
                if (blockType === 'atomic' && block.data) {
                    closeActiveList();
                    htmlResult += await renderAtomicBlock(block, aiConfig);
                    continue;
                }
                if (blockType === 'unordered-list-item' || blockType === 'ordered-list-item') {
                    if (activeListType !== blockType) {
                        closeActiveList();
                        htmlResult += blockType === 'ordered-list-item' ? '<ol>' : '<ul>';
                        activeListType = blockType;
                    }
                    const inlineHtml = buildInlineHtml(block, entityMap);
                    htmlResult += `<li>${inlineHtml || '&nbsp;'}</li>`;
                    continue;
                }
                closeActiveList();
                const inlineHtml = buildInlineHtml(block, entityMap);
                switch (blockType) {
                    case 'header-one':
                        htmlResult += `<h1>${inlineHtml || '&nbsp;'}</h1>`;
                        break;
                    case 'header-two':
                        htmlResult += `<h2>${inlineHtml || '&nbsp;'}</h2>`;
                        break;
                    case 'header-three':
                        htmlResult += `<h3>${inlineHtml || '&nbsp;'}</h3>`;
                        break;
                    case 'header-four':
                        htmlResult += `<h4>${inlineHtml || '&nbsp;'}</h4>`;
                        break;
                    case 'blockquote':
                        htmlResult += `<blockquote>${inlineHtml || '&nbsp;'}</blockquote>`;
                        break;
                    case 'code-block':
                        htmlResult += `<pre><code>${inlineHtml || '&nbsp;'}</code></pre>`;
                        break;
                    default:
                        htmlResult += `<div>${inlineHtml || '&nbsp;'}</div>`;
                        break;
                }
            }
            if (activeListType) {
                closeActiveList();
            }
            return htmlResult;
        } catch (e) {
            return escapeHtml(content).replace(/\n/g, '<br>');
        }
    }
    async function setRichTextContent(targetElement, richContent) {
        if (!targetElement) return '';
        const parsedHtml = await parseRichTextContentAsync(richContent);
        targetElement.innerHTML = parsedHtml;
        applyMathRendering(targetElement);
        return parsedHtml;
    }
    function getNodeIDFromUrl(url) {
        const urlStr = url.toString();
        let match = urlStr.match(/\/course_paper\/mycourse\/\d+\/(\d+)/);
        if (match && match[1]) {
            console.log(`[URL解析器] 匹配到答题页模式. NodeID: ${match[1]}`);
            return match[1];
        }
        match = urlStr.match(/\/resource\/[^\/]+\/(\d+)/);
        if (match && match[1]) {
            console.log(`[URL解析器] 匹配到资源页模式. NodeID: ${match[1]}`);
            return match[1];
        }
        console.warn(`[URL解析器] 未能从URL中通过特定模式找到NodeID: ${urlStr}`);
        return null;
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
                    case 'm':
                        e.preventDefault();
                        exportHomeworkMarkdown();
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
        closeButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        closeButton.style.cssText = `
            position: absolute;
            top: 15px;
            right: 15px;
            background: #f3f4f6;
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            cursor: pointer;
            color: #6b7280;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.08);
        `;
        closeButton.onmouseover = () => {
            closeButton.style.backgroundColor = '#e5e7eb';
            closeButton.style.transform = 'rotate(90deg)';
            closeButton.style.color = '#000';
            closeButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.12)';
        };
        closeButton.onmouseout = () => {
            closeButton.style.backgroundColor = '#f3f4f6';
            closeButton.style.transform = 'rotate(0deg)';
            closeButton.style.color = '#6b7280';
            closeButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.08)';
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
                这里有关于脚本功能的详细说明。
            </p>
            <div style="margin: 24px 0; padding: 20px; background: #f8f9fa; border-radius: 12px; border-left: 4px solid #4e4376;">
                <h3 style="margin: 0 0 12px 0; color: #2b5876; font-size: 18px; display: flex; align-items: center;">
                    <span class="feature-icon">🎯</span> 核心功能
                </h3>
                <ol style="padding-left: 20px; color: #444; line-height: 1.6; margin: 0; font-size: 14px;">
                    <li><strong>获取答案</strong> - 从题库获取参考答案，这是答题的第一步。</li>
                    <li><strong>填写答案</strong> - 将获取到的答案、AI生成的答案一键自动填充到页面。</li>
                    <li><strong>编辑答案</strong> - 灵活修改，支持手动调整、上传图片/音频辅助AI重新生成。</li>
                    <li><strong>夸克搜题</strong> - 调用夸克搜索引擎，快速查找互联网上的相关解析。</li>
                    <li><strong>导出作业</strong> - 将整页题目和答案导出为 Word(.docx) 或 Markdown(.md) 格式。</li>
                </ol>
            </div>
            <div style="margin: 24px 0; padding: 20px; background: #f0f9ff; border-radius: 12px; border-left: 4px solid #3b82f6;">
                <h3 style="margin: 0 0 12px 0; color: #1e40af; font-size: 18px; display: flex; align-items: center;">
                    <span class="feature-icon">🤖</span> AI 智能解题
                </h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <h4 style="margin: 5px 0 8px 0; color: #1e3a8a; font-size: 15px;">文本推理 (LLM)</h4>
                        <ul style="padding-left: 18px; color: #444; line-height: 1.6; margin: 0; font-size: 13.5px;">
                            <li><strong>小雅 AI</strong>: 默认免费，无需配置。</li>
                            <li><strong>自定义 API</strong>: 支持 OpenAI, Gemini, Claude 等，更强更智能。</li>
                        </ul>
                    </div>
                    <div>
                        <h4 style="margin: 5px 0 8px 0; color: #1e3a8a; font-size: 15px;">图像/多模态</h4>
                        <ul style="padding-left: 18px; color: #444; line-height: 1.6; margin: 0; font-size: 13.5px;">
                            <li><strong>Vision 模型</strong>: 独立配置视觉模型(如OCR)，高性价比。</li>
                            <li><strong>媒体理解</strong>: Gemini 2.5+ 可直接"看"视频、"听"音频，无需转录。</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div style="margin: 24px 0; padding: 20px; background: #fff7ed; border-radius: 12px; border-left: 4px solid #f97316;">
                <h3 style="margin: 0 0 12px 0; color: #9a3412; font-size: 18px; display: flex; align-items: center;">
                    <span class="feature-icon">☁️</span> 配置云同步 (WebDAV)
                </h3>
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #444;">脚本不再担心重装丢失配置！通过 WebDAV (推荐坚果云)，你可以将你的个性化设置、Prompt、API Key 在多台设备间无缝同步。</p>
                <ul style="padding-left: 20px; color: #444; line-height: 1.6; margin: 0; font-size: 13.5px;">
                    <li><strong>配置方法</strong>: 进入 <span style="font-size: 1.1em; vertical-align: -0.1em;">⚙️</span> 设置面板底部，展开 WebDAV 区域，点击 <span style="color:#6366f1;">❓ 如何获取坚果云配置</span> 查看详细教程。</li>
                    <li><strong>多档案管理</strong>: 支持保存多套配置方案（如"考研专用"、"英语专用"），并随意切换。</li>
                    <li><strong>云端管理</strong>: 直接在脚本内查看云端所有备份，一键恢复或清理旧档。</li>
                </ul>
            </div>
            <div style="display: flex; gap: 20px; margin: 24px 0;">
                 <div style="flex: 1; padding: 20px; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                     <h3 style="margin: 0 0 12px 0; color: #2b5876; font-size: 16px; display: flex; align-items: center;">
                        <span class="feature-icon">⌨️</span> 常用快捷键
                    </h3>
                    <ul style="padding-left: 16px; color: #555; line-height: 1.6; margin: 0; font-size: 13px;">
                        <li><strong>Ctrl+Shift+A</strong>: 获取答案</li>
                        <li><strong>Ctrl+Shift+F</strong>: 填写答案</li>
                        <li><strong>Ctrl+Shift+E</strong>: 编辑答案</li>
                        <li><strong>Ctrl+Shift+Q</strong>: 导出Word</li>
                    </ul>
                </div>
                <div style="flex: 1; padding: 20px; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                    <h3 style="margin: 0 0 12px 0; color: #2b5876; font-size: 16px; display: flex; align-items: center;">
                        <span class="feature-icon">💡</span> 重要提示
                    </h3>
                    <ul style="padding-left: 16px; color: #555; line-height: 1.6; margin: 0; font-size: 13px;">
                        <li style="margin-bottom: 6px;">必须在<strong>作业的资源页面</strong>(URL含/resource/)点击获取。</li>
                        <li style="margin-bottom: 6px;">AI 功能需自备 Key，脚本不提供。</li>
                        <li>请自行核对答案，AI 仅供辅助。</li>
                    </ul>
                </div>
            </div>
             <div style="margin-top: 32px; padding: 20px; background: #fff; border-radius: 12px; border: 1px dashed #4e4376; display: flex; align-items: center; justify-content: space-between;">
                <div>
                   <h3 style="margin: 0 0 5px 0; color: #2b5876; font-size: 16px;">
                        <span class="feature-icon">🤝</span> 反馈与交流
                    </h3>
                    <p style="color: #666; font-size: 13px; margin: 0;">
                        遇到问题？欢迎邮件反馈或访问主页。
                    </p>
                </div>
                <div style="font-size: 13px;">
                     <a href="mailto:zygame1314@gmail.com" style="color: #4e4376; margin-right: 15px; text-decoration: none;">📧 发送邮件</a>
                     <a href="https://blog.zygame1314.site" target="_blank" style="color: #4e4376; text-decoration: none;">🌐 个人主页</a>
                </div>
            </div>
            <p style="margin: 30px 0 0 0; text-align: center; color: #888; font-size: 13px;">别太依赖脚本哦，多动脑才是真本事！😉</p>
            <p style="color: #bbb; font-size: 12px; text-align: center; margin-top: 5px;">
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
    function aliyunEncodeURI(str) {
        var result = encodeURIComponent(str);
        result = result.replace(/\+/g, "%20");
        result = result.replace(/\*/g, "%2A");
        result = result.replace(/%7E/g, "~");
        return result;
    }
    function makeUTF8sort(params) {
        var sortedKeys = Object.keys(params).sort();
        var sortedParams = [];
        for (var i = 0; i < sortedKeys.length; i++) {
            var key = sortedKeys[i];
            if (key && params[key]) {
                sortedParams.push(aliyunEncodeURI(key) + "=" + aliyunEncodeURI(params[key]));
            }
        }
        return sortedParams.join("&");
    }
    function makeChangeSiga(params, accessSecret) {
        const stringToSign = "GET&%2F&" + aliyunEncodeURI(makeUTF8sort(params));
        const signature = CryptoJS.HmacSHA1(stringToSign, accessSecret + "&");
        return signature.toString(CryptoJS.enc.Base64);
    }
    const SignatureUtil = {
        NONCE_STR_MAX: 32,
        createNonceStr(len = 16) {
            len = len > this.NONCE_STR_MAX ? this.NONCE_STR_MAX : len;
            let str = "";
            const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            for (let i = 0; i < len; i++) {
                str += chars[Math.floor(Math.random() * chars.length)];
            }
            return str;
        },
        createSignature(params) {
            const message = params.message;
            const timestamp = params.timestamp || new Date().getTime().toString();
            const nonce = params.nonce || this.createNonceStr();
            const elements = [
                encodeURIComponent(message),
                timestamp,
                nonce,
                "--xy-create-signature--"
            ];
            const signature = CryptoJS.SHA1(elements.sort().join("")).toString();
            return {
                message: message,
                signature: signature,
                timestamp: timestamp,
                nonce: nonce,
            };
        }
    };
    async function getAudioUrl(fileId) {
        try {
            const token = getToken();
            if (!token) throw new Error("无法获取Token");
            const message = JSON.stringify({ file_id: fileId });
            const signedPayload = SignatureUtil.createSignature({ message });
            const response = await fetch(`${window.location.origin}/api/jx-oresource/cloud/file/audio`, {
                method: 'POST',
                headers: {
                    'authorization': `Bearer ${token}`,
                    'content-type': 'application/json; charset=UTF-8'
                },
                body: JSON.stringify(signedPayload)
            });
            if (!response.ok) {
                throw new Error(`获取音频URL失败, 状态: ${response.status}`);
            }
            const data = await response.json();
            if (data.success && data.data) {
                return data.data.audio_transcode_url || data.data.url;
            } else {
                throw new Error(data.message || '返回数据格式不正确');
            }
        } catch (error) {
            console.error(`获取音频URL时出错 (File ID: ${fileId}):`, error);
            return null;
        }
    }
    function gmFetch(url, onProgress) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        if (onProgress) onProgress(1);
                        resolve(response.response);
                    } else {
                        reject(new Error(`gmFetch 请求失败: 状态 ${response.status}`));
                    }
                },
                onerror: (response) => {
                    reject(new Error(`gmFetch 网络错误: ${response.statusText}`));
                },
                onprogress: (event) => {
                    if (event.lengthComputable && onProgress) {
                        onProgress(event.loaded / event.total);
                    }
                }
            });
        });
    }
    async function getVideoUrl(videoId) {
        try {
            const token = getToken();
            if (!token) throw new Error("无法获取Token");
            const authResponse = await fetch(`${window.location.origin}/api/jx-oresource/vod/video/play_auth/${videoId}?is_public=1`, {
                headers: { 'authorization': `Bearer ${token}` }
            });
            if (!authResponse.ok) throw new Error(`获取视频凭证失败, 状态: ${authResponse.status}`);
            const authData = await authResponse.json();
            if (!authData.success || !authData.data || !authData.data.play_auth) {
                throw new Error(authData.message || '返回的播放凭证数据格式不正确');
            }
            const playAuthData = JSON.parse(atob(authData.data.play_auth));
            const s = {
                vid: playAuthData.VideoMeta.VideoId,
                accessId: playAuthData.AccessKeyId,
                accessSecret: playAuthData.AccessKeySecret,
                stsToken: playAuthData.SecurityToken,
                domainRegion: playAuthData.Region,
                authInfo: playAuthData.AuthInfo,
                format: "mp4",
                mediaType: "video"
            };
            const signatureNonce = crypto.randomUUID();
            const params = {
                AccessKeyId: s.accessId,
                Action: "GetPlayInfo",
                VideoId: s.vid,
                Formats: s.format,
                SecurityToken: s.stsToken,
                StreamType: s.mediaType,
                Format: "JSON",
                Version: "2017-03-21",
                SignatureMethod: "HMAC-SHA1",
                SignatureVersion: "1.0",
                SignatureNonce: signatureNonce,
                AuthInfo: s.authInfo
            };
            const signature = makeChangeSiga(params, s.accessSecret);
            const queryString = makeUTF8sort(params) + "&Signature=" + aliyunEncodeURI(signature);
            const finalUrl = `https://vod.${s.domainRegion}.aliyuncs.com/?${queryString}`;
            const playInfoResponse = await fetch(finalUrl);
            if (!playInfoResponse.ok) {
                const errorText = await playInfoResponse.text();
                console.error('从阿里云获取播放信息失败，原始响应:', errorText);
                throw new Error(`从阿里云获取播放信息失败, 状态: ${playInfoResponse.status}`);
            }
            const playInfoData = await playInfoResponse.json();
            if (playInfoData && playInfoData.PlayInfoList && playInfoData.PlayInfoList.PlayInfo && playInfoData.PlayInfoList.PlayInfo.length > 0) {
                const playInfos = playInfoData.PlayInfoList.PlayInfo;
                const videoInfo = playInfos
                    .filter(p => p.Format === 'mp4')
                    .sort((a, b) => (b.Width || 0) - (a.Width || 0))[0];
                const audioInfo = playInfos.find(p => p.Format === 'm4a');
                return {
                    videoUrl: videoInfo ? videoInfo.PlayURL : null,
                    audioUrl: audioInfo ? audioInfo.PlayURL : null,
                };
            } else if (playInfoData.Code) {
                throw new Error(`阿里云API错误: ${playInfoData.Code} - ${playInfoData.Message}`);
            } else {
                throw new Error('播放信息列表中没有可用的地址');
            }
        } catch (error) {
            console.error(`获取视频/音频URL时出错 (Video ID: ${videoId}):`, error);
            return { videoUrl: null, audioUrl: null };
        }
    }
    async function extractAndEncodeAudio(videoUrl, onProgress) {
        let worker = null;
        try {
            if (onProgress) onProgress(0.05, "下载中");
            const videoData = await gmFetch(videoUrl, (progress) => {
                if (onProgress) onProgress(0.05 + progress * 0.25, "下载中");
            });
            if (onProgress) onProgress(0.3, "解码中");
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(videoData);
            await audioContext.close();
            if (onProgress) onProgress(0.6, "编码中");
            return await new Promise((resolve, reject) => {
                const workerBlob = new Blob([WavEncoderWorker], { type: 'application/javascript' });
                worker = new Worker(URL.createObjectURL(workerBlob));
                worker.onmessage = (e) => {
                    if (onProgress) onProgress(1, "完成");
                    resolve(e.data);
                    worker.terminate();
                };
                worker.onerror = (e) => {
                    console.error("WAV 编码 Worker 出错:", e);
                    reject(new Error(`WAV 编码失败: ${e.message}`));
                    worker.terminate();
                };
                const channels = [];
                for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                    channels.push(audioBuffer.getChannelData(i));
                }
                worker.postMessage({
                    channels: channels,
                    sampleRate: audioBuffer.sampleRate,
                    length: audioBuffer.length
                });
            });
        } catch (error) {
            if (worker) worker.terminate();
            console.error("从视频提取音频失败:", error);
            throw error;
        }
    }
    async function callSttApi(audioSource, sttConfig) {
        const { sttProvider, sttEndpoint, sttApiKey, sttModel, apiKey: llmApiKey, disableCorrection } = sttConfig;
        if (!sttEndpoint) throw new Error("STT API 地址未配置。");
        const finalApiKey = sttApiKey || llmApiKey;
        if (!finalApiKey) throw new Error("STT API Key 未配置（也未提供备用的 LLM Key）。");
        console.log(`[STT] 使用 [${sttProvider}] 提供商开始转录...`);
        try {
            switch (sttProvider) {
                case 'openai_compatible':
                    return await callWhisperCompatibleApi(audioSource, sttEndpoint, finalApiKey, sttModel, disableCorrection);
                case 'gemini':
                    return await callGeminiSttApi(audioSource, sttEndpoint, finalApiKey, sttModel, disableCorrection);
                default:
                    throw new Error(`未知的 STT 提供商: ${sttProvider}`);
            }
        } catch (error) {
            console.error('[STT] 语音转录失败:', error);
            showNotification(`语音转录失败: ${error.message}`, { type: 'error', duration: 8000 });
            throw error;
        }
    }
    async function callWhisperCompatibleApi(audioSource, endpoint, apiKey, model, disableCorrection = false) {
        let audioBlob;
        let fileName = 'audio.wav';
        if (typeof audioSource === 'string') {
            const audioResponse = await fetch(audioSource);
            if (!audioResponse.ok) {
                throw new Error(`下载音频文件失败, 状态: ${audioResponse.status}`);
            }
            audioBlob = await audioResponse.blob();
            fileName = audioSource.split('/').pop().split('?')[0] || 'audio.mp3';
        } else if (audioSource instanceof Blob) {
            audioBlob = audioSource;
        } else {
            throw new Error('无效的音频源类型');
        }
        let finalEndpoint = endpoint;
        if (!disableCorrection) {
            let cleanEndpoint = endpoint.split('?')[0].replace(/\/$/, '');
            const targetPath = '/v1/audio/transcriptions';
            if (!cleanEndpoint.endsWith(targetPath)) {
                if (cleanEndpoint.includes('/v1')) {
                    cleanEndpoint = cleanEndpoint.substring(0, cleanEndpoint.indexOf('/v1')) + targetPath;
                } else {
                    cleanEndpoint += targetPath;
                }
                console.warn("STT Endpoint 已自动修正为:", cleanEndpoint);
            }
            finalEndpoint = cleanEndpoint + (endpoint.includes('?') ? endpoint.substring(endpoint.indexOf('?')) : '');
        }
        const formData = new FormData();
        formData.append('file', audioBlob, fileName);
        formData.append('model', model || 'whisper-1');
        const sttApiResponse = await fetch(finalEndpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });
        if (!sttApiResponse.ok) {
            const errorText = await sttApiResponse.text();
            throw new Error(`STT API 请求失败 (${sttApiResponse.status}): ${errorText}`);
        }
        const result = await sttApiResponse.json();
        if (typeof result.text === 'string') {
            showNotification('🎤 转录完成!', { type: 'success', duration: 2000 });
            return result.text;
        } else {
            throw new Error("STT API 返回的数据格式不正确，未找到 'text' 字段。");
        }
    }
    async function callGeminiSttApi(audioSource, endpoint, apiKey, model, disableCorrection = false) {
        let audioBlob;
        let mimeType;
        if (typeof audioSource === 'string') {
            const audioResponse = await fetch(audioSource);
            if (!audioResponse.ok) {
                throw new Error(`下载音频文件失败, 状态: ${audioResponse.status}`);
            }
            audioBlob = await audioResponse.blob();
            mimeType = audioBlob.type || 'audio/mp3';
        } else if (audioSource instanceof Blob) {
            audioBlob = audioSource;
            mimeType = audioBlob.type;
        } else {
            throw new Error('无效的音频源类型');
        }
        const base64Audio = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
        });
        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: "Please provide a transcript for this audio." },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Audio,
                            },
                        },
                    ],
                },
            ],
        };
        let finalEndpoint;
        if (disableCorrection) {
            let base = endpoint.endsWith('/') ? endpoint : endpoint + '/';
            finalEndpoint = `${base}${model}:generateContent?key=${apiKey}`;
        } else {
            let cleanBase = endpoint.replace(/\/v\d+(beta)?\/models\/?$/, '').replace(/\/models\/?$/, '').replace(/\/$/, '');
            finalEndpoint = `${cleanBase}/v1beta/models/${model}:generateContent?key=${apiKey}`;
            console.log(`[Gemini STT] Endpoint 已修正为: ${finalEndpoint}`);
        }
        const sttApiResponse = await fetch(finalEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        if (!sttApiResponse.ok) {
            const errorText = await sttApiResponse.text();
            throw new Error(`Gemini STT API 请求失败 (${sttApiResponse.status}): ${errorText}`);
        }
        const result = await sttApiResponse.json();
        const transcription = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof transcription === 'string') {
            showNotification('🎤 转录完成 (Gemini)!', { type: 'success', duration: 2000 });
            return transcription;
        } else {
            console.error('[STT-Gemini] 返回数据格式不正确:', result);
            throw new Error("Gemini STT API 返回的数据格式不正确。");
        }
    }
    function containsAudio(richTextContent) {
        if (!richTextContent || typeof richTextContent !== 'string') return false;
        try {
            const jsonContent = JSON.parse(richTextContent);
            if (jsonContent && Array.isArray(jsonContent.blocks)) {
                return jsonContent.blocks.some(block =>
                    block.type === 'atomic' && block.data?.type === 'AUDIO'
                );
            }
        } catch (e) {
            return false;
        }
        return false;
    }
    function containsVideo(richTextContent) {
        if (!richTextContent || typeof richTextContent !== 'string') return false;
        try {
            const jsonContent = JSON.parse(richTextContent);
            if (jsonContent && Array.isArray(jsonContent.blocks)) {
                return jsonContent.blocks.some(block =>
                    block.type === 'atomic' && block.data?.type === 'VIDEO'
                );
            }
        } catch (e) {
            return false;
        }
        return false;
    }
    function getQuestionType(typeCode) {
        const typeMap = {
            1: "单选题",
            2: "多选题",
            4: "填空题",
            5: "判断题",
            6: "简答题",
            9: "数组题",
            10: "编程题",
            12: "排序题",
            13: "匹配题"
        };
        return typeMap[typeCode] || "未知题型";
    }
    async function callXiaoyaStream(userPrompt, onChunk, onComplete, onError, signal) {
        const effectiveSignal = signal || new AbortController().signal;
        let timeoutId = null;
        if (!signal) {
            timeoutId = setTimeout(() => {
                console.error("Xiaoya Stream fetch 超时 (内部)");
                if (typeof onError === 'function') {
                    onError(new Error("小雅流式 API 网络错误: 请求超时 (内部)"));
                }
            }, 60000);
        } else {
            effectiveSignal.addEventListener('abort', () => {
                console.log("Xiaoya Stream 请求被外部信号中止。");
                if (typeof onError === 'function') {
                    onError(new DOMException('请求被中止', 'AbortError'));
                }
            }, { once: true });
        }
        try {
            const bearerToken = getToken();
            if (!bearerToken) {
                throw new Error("无法获取 Bearer Token");
            }
            let jwtToken = null;
            try {
                const xyGlobalConfig = window.localStorage.getItem('XY_GLOBAL_CONFIG');
                if (xyGlobalConfig) {
                    jwtToken = JSON.parse(xyGlobalConfig).xy_ai_token;
                }
            } catch (e) {
                console.warn("解析 XY_GLOBAL_CONFIG 失败:", e);
            }
            if (!jwtToken) {
                console.warn("无法从 localStorage 获取小雅 JWT Token，将尝试使用 Bearer Token");
                jwtToken = bearerToken;
            }
            const groupId = getGroupIDFromUrl(window.location.href) || "";
            const aiConfig = JSON.parse(localStorage.getItem('aiConfig') || '{}');
            const xiaoyaAiMode = aiConfig.xiaoyaAiMode || 'deep_think';
            const useDeepThink = xiaoyaAiMode === 'deep_think';
            const requestBody = {
                token: jwtToken,
                ask_key: "chat_scene_dialogue",
                ask_object: {
                    question: userPrompt,
                    multilingual_description: ""
                },
                deep_think_mode: useDeepThink,
                group_id: groupId
            };
            console.log(`调用 Xiaoya Stream API (模式: ${useDeepThink ? '深度思考' : '快速'})`, { body: requestBody });
            const response = await fetch(`${window.location.origin}/api/jx-oresource/assistant/chat/stream`, {
                method: "POST",
                headers: {
                    "accept": "*/*",
                    "authorization": `Bearer ${bearerToken}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify(requestBody),
                signal: effectiveSignal,
            });
            if (timeoutId) clearTimeout(timeoutId);
            if (!response.ok) {
                let errorMsg = `小雅流式 API 错误 (${response.status}): ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = `小雅流式 API 错误 (${response.status}): ${errorData.message || response.statusText}`;
                } catch (e) {
                }
                console.error("Xiaoya Stream fetch 错误:", errorMsg);
                if (typeof onError === 'function') {
                    onError(new Error(errorMsg));
                }
                return;
            }
            if (response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let accumulatedContent = '';
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        console.log("小雅流式处理已完成。");
                        break;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (line.startsWith('data: ')) {
                            const dataJson = line.substring(6).trim();
                            if (dataJson === '[DONE]') {
                                console.log("小雅流式处理收到 [DONE]");
                                continue;
                            }
                            try {
                                const data = JSON.parse(dataJson);
                                const delta = data.choices?.[0]?.delta;
                                if (delta) {
                                    const deltaContent = delta.content;
                                    const reasoningContent = delta.reasoning_content || delta.reasoning;
                                    if (reasoningContent) {
                                        if (typeof onChunk === 'function') {
                                            onChunk(`<think>${reasoningContent}</think>`);
                                        }
                                    } else if (deltaContent) {
                                        accumulatedContent += deltaContent;
                                        if (typeof onChunk === 'function') {
                                            onChunk(deltaContent);
                                        }
                                    }
                                }
                            } catch (parseError) {
                                if (dataJson) {
                                    console.warn("小雅流式 SSE JSON 解析错误:", parseError, "数据:", dataJson);
                                }
                            }
                        }
                    }
                }
                if (typeof onComplete === 'function') {
                    onComplete(accumulatedContent);
                }
            } else {
                console.error("Xiaoya Stream 响应体为空");
                if (typeof onError === 'function') {
                    onError(new Error("小雅流式 API 错误: 响应体为空"));
                }
            }
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.log("Xiaoya Stream 请求被中止.");
                if (!signal && typeof onError === 'function') {
                    onError(error);
                }
            } else {
                console.error("Xiaoya Stream 调用/处理失败:", error);
                if (typeof onError === 'function') {
                    onError(new Error(`小雅流式 API 网络或处理错误: ${error.message}`));
                }
            }
        }
    }
    async function callOpenAI(endpoint, apiKey, userPrompt, modelId, temperature = 0.7, max_tokens = 8000, onChunk = null, onComplete = null, onError = null, signal = null, visionEnabled = false) {
        const effectiveSignal = signal || new AbortController().signal;
        let timeoutId = null;
        if (!signal) {
            timeoutId = setTimeout(() => {
                console.error("OpenAI fetch 超时 (内部)");
                if (typeof onError === 'function') {
                    onError(new Error("OpenAI API 网络错误: 请求超时 (内部)"));
                }
            }, 60000);
        } else {
            effectiveSignal.addEventListener('abort', () => {
                console.log("OpenAI 请求被外部信号中止。");
                if (typeof onError === 'function') {
                    onError(new DOMException('请求被中止', 'AbortError'));
                }
            }, { once: true });
        }
        try {
            const aiConfig = JSON.parse(localStorage.getItem('aiConfig') || '{}');
            const disableMaxTokens = aiConfig.disableMaxTokens || false;
            const modelToUse = modelId || "gpt-4o";
            const payloadData = {
                model: modelToUse,
                messages: [{
                    role: "user",
                    content: visionEnabled ? userPrompt : String(userPrompt)
                }],
                temperature: temperature,
                stream: true
            };
            if (!disableMaxTokens) {
                payloadData.max_tokens = max_tokens;
            }
            const payload = JSON.stringify(payloadData);
            console.log("调用 OpenAI (流式 Fetch):", { endpoint, model: modelToUse, temperature, max_tokens: disableMaxTokens ? 'unlimited' : max_tokens });
            const disableCorrection = aiConfig.disableCorrection || aiConfig.isPreset || false;
            let finalEndpoint = endpoint;
            if (!disableCorrection) {
                let cleanEndpoint = endpoint.split('?')[0].replace(/\/$/, '');
                const targetPath = '/v1/chat/completions';
                if (!cleanEndpoint.endsWith(targetPath)) {
                    if (cleanEndpoint.includes('/v1')) {
                        cleanEndpoint = cleanEndpoint.substring(0, cleanEndpoint.indexOf('/v1')) + targetPath;
                    } else {
                        cleanEndpoint += targetPath;
                    }
                    console.warn("OpenAI Endpoint 已自动修正为:", cleanEndpoint);
                }
                finalEndpoint = cleanEndpoint + (endpoint.includes('?') ? endpoint.substring(endpoint.indexOf('?')) : '');
            }
            const response = await fetch(finalEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: payload,
                signal: effectiveSignal
            });
            if (timeoutId) clearTimeout(timeoutId);
            if (!response.ok) {
                let errorMsg = `OpenAI API 错误 (${response.status}): ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = `OpenAI API 错误 (${response.status}): ${errorData.error?.message || errorData.message || response.statusText}`;
                } catch (e) {
                    try {
                        const textError = await response.text();
                        console.error("OpenAI 原始错误响应:", textError);
                        errorMsg += ` - ${textError.substring(0, 100)}`;
                    } catch (textE) { }
                }
                console.error("OpenAI fetch 错误:", errorMsg);
                if (typeof onError === 'function') {
                    onError(new Error(errorMsg));
                }
                return;
            }
            if (response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let accumulatedContent = '';
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        console.log("OpenAI 流式处理已完成。");
                        break;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (let j = 0; j < lines.length; j++) {
                        const line = lines[j];
                        if (line.startsWith('data: ')) {
                            const dataJson = line.substring(6).trim();
                            if (dataJson === '[DONE]') {
                                console.log("OpenAI 流式处理收到 [DONE]");
                                continue;
                            }
                            try {
                                const data = JSON.parse(dataJson);
                                const delta = data.choices?.[0]?.delta;
                                if (delta) {
                                    const deltaContent = delta.content;
                                    const reasoningContent = delta.reasoning_content || delta.reasoning;
                                    if (reasoningContent) {
                                        if (typeof onChunk === 'function') {
                                            onChunk(`<think>${reasoningContent}</think>`);
                                        }
                                    } else if (deltaContent) {
                                        accumulatedContent += deltaContent;
                                        if (typeof onChunk === 'function') {
                                            onChunk(deltaContent);
                                        }
                                    }
                                }
                            } catch (parseError) {
                                if (dataJson) {
                                    console.warn("SSE JSON 解析错误:", parseError, "数据:", dataJson);
                                }
                            }
                        }
                    }
                }
                if (typeof onComplete === 'function') {
                    onComplete(accumulatedContent);
                }
            } else {
                console.error("OpenAI 响应体为空");
                if (typeof onError === 'function') {
                    onError(new Error("OpenAI API 错误: 响应体为空"));
                }
            }
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.log("OpenAI 请求被中止.");
                if (!signal && typeof onError === 'function') {
                    onError(error);
                }
            } else {
                console.error("OpenAI 调用/处理失败:", error);
                if (typeof onError === 'function') {
                    onError(new Error(`OpenAI API 网络或处理错误: ${error.message}`));
                }
            }
        }
    }
    async function callGemini(endpoint, apiKey, userPrompt, modelId, temperature = 0.7, max_tokens = 8000, onChunk = null, onComplete = null, onError = null, signal = null, visionEnabled = false) {
        const effectiveSignal = signal || new AbortController().signal;
        let timeoutId = null;
        if (!signal) {
            timeoutId = setTimeout(() => {
                console.error("Gemini fetch 超时 (内部)");
                if (typeof onError === 'function') {
                    onError(new Error("Gemini API 网络错误: 请求超时 (内部)"));
                }
            }, 120000);
        } else {
            effectiveSignal.addEventListener('abort', () => {
                console.log("Gemini 请求被外部信号中止。");
                if (typeof onError === 'function') {
                    onError(new DOMException('请求被中止', 'AbortError'));
                }
            }, { once: true });
        }
        try {
            const aiConfig = JSON.parse(localStorage.getItem('aiConfig') || '{}');
            const disableCorrection = aiConfig.disableCorrection || false;
            const disableMaxTokens = aiConfig.disableMaxTokens || false;
            const geminiThinkingEnabled = aiConfig.geminiThinkingEnabled || false;
            const geminiThinkingBudgetMode = aiConfig.geminiThinkingBudgetMode || 'dynamic';
            const geminiThinkingBudgetCustom = aiConfig.geminiThinkingBudgetCustom || 8192;
            const modelToUse = modelId || "gemini-2.5-flash";
            const apiVersion = "v1beta";
            let finalEndpoint;
            if (disableCorrection) {
                finalEndpoint = endpoint;
                if (!finalEndpoint.includes('key=')) {
                    finalEndpoint += (finalEndpoint.includes('?') ? '&' : '?') + `key=${apiKey}`;
                }
                if (!finalEndpoint.includes('alt=sse')) {
                    finalEndpoint += (finalEndpoint.includes('?') ? '&' : '?') + 'alt=sse';
                }
            } else {
                let cleanBaseEndpoint = endpoint.replace(/\/v\d+(beta)?\/models\/.*$/, '').replace(/\/models\/.*$/, '').replace(/\/$/, '');
                finalEndpoint = `${cleanBaseEndpoint}/${apiVersion}/models/${modelToUse}:streamGenerateContent?key=${apiKey}&alt=sse`;
            }
            const generationConfig = {
                temperature: temperature
            };
            if (!disableMaxTokens) {
                generationConfig.maxOutputTokens = max_tokens;
            }
            if (geminiThinkingEnabled) {
                const thinkingConfig = { includeThoughts: true };
                switch (geminiThinkingBudgetMode) {
                    case 'dynamic':
                        thinkingConfig.thinkingBudget = -1;
                        break;
                    case 'disabled':
                        thinkingConfig.thinkingBudget = 0;
                        break;
                    case 'custom':
                        thinkingConfig.thinkingBudget = geminiThinkingBudgetCustom;
                        break;
                }
                generationConfig.thinkingConfig = thinkingConfig;
            }
            console.log("调用 Gemini (流式 Fetch):", { fullEndpoint: finalEndpoint, generationConfig: generationConfig });
            let finalParts;
            if (Array.isArray(userPrompt) && userPrompt.some(p => p.type === 'video_data')) {
                console.log("[Gemini] 构建媒体理解请求体...");
                finalParts = userPrompt.map(part => {
                    if (part.type === 'video_data') {
                        return { inline_data: { mime_type: part.video_data.mimeType, data: part.video_data.base64 } };
                    } else if (part.type === 'image_url') {
                        const base64Data = part.image_url.url;
                        const parts = base64Data.split(',');
                        const mimeMatch = parts[0].match(/:(.*?);/);
                        return { inline_data: { mime_type: mimeMatch[1], data: parts[1] } };
                    }
                    return { text: part.text };
                });
            } else if (visionEnabled) {
                finalParts = userPrompt.map(part => {
                    if (part.type === 'image_url') {
                        const base64Data = part.image_url.url;
                        const parts = base64Data.split(',');
                        const mimeMatch = parts[0].match(/:(.*?);/);
                        return { inline_data: { mime_type: mimeMatch[1], data: parts[1] } };
                    }
                    return { text: part.text };
                });
            } else {
                finalParts = [{ text: userPrompt }];
            }
            const payload = JSON.stringify({
                contents: [{ role: 'user', parts: finalParts }],
                generationConfig: generationConfig
            });
            const response = await fetch(finalEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                signal: effectiveSignal
            });
            if (timeoutId) clearTimeout(timeoutId);
            if (!response.ok) {
                let errorMsg = `Gemini API 错误 (${response.status}): ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = `Gemini API 错误 (${response.status}): ${errorData.error?.message || errorData.message || response.statusText}`;
                    if (response.status === 500 && errorMsg.toLowerCase().includes('internal')) {
                        errorMsg += ' (这通常是Google服务器临时问题，请稍后重试或尝试更换模型，如 gemini-2.5-flash)。';
                    }
                } catch (e) {
                    try {
                        const textError = await response.text();
                        console.error("Gemini 原始错误响应:", textError);
                        errorMsg += ` - ${textError.substring(0, 100)}`;
                    } catch (textE) { }
                }
                console.error("Gemini fetch 错误:", errorMsg);
                if (typeof onError === 'function') {
                    onError(new Error(errorMsg));
                }
                return;
            }
            if (response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let accumulatedAnswerContent = '';
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        console.log("Gemini 流式处理已完成。");
                        break;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    function handleGeminiLine(line) {
                        if (line.startsWith('data: ')) {
                            const dataJson = line.substring(6).trim();
                            try {
                                const data = JSON.parse(dataJson);
                                const parts = data.candidates?.[0]?.content?.parts;
                                if (parts && Array.isArray(parts)) {
                                    for (const part of parts) {
                                        if (part.text) {
                                            if (part.thought) {
                                                if (typeof onChunk === 'function') {
                                                    onChunk(`<think>${part.text}</think>`);
                                                }
                                            } else {
                                                accumulatedAnswerContent += part.text;
                                                if (typeof onChunk === 'function') {
                                                    onChunk(part.text);
                                                }
                                            }
                                        }
                                    }
                                }
                                const finishReason = data.candidates?.[0]?.finishReason;
                                if (finishReason && finishReason !== "STOP") {
                                    console.warn("Gemini 流式处理结束，原因：", finishReason);
                                    if (finishReason === "SAFETY") {
                                        const safetyError = new Error("Gemini API 错误: 响应因安全设置被阻止。");
                                        if (typeof onError === 'function') onError(safetyError);
                                    }
                                }
                                const promptFeedback = data.promptFeedback;
                                if (promptFeedback?.blockReason) {
                                    console.error(`Gemini API 错误: 提示因 ${promptFeedback.blockReason} 被阻止`, data);
                                    const promptError = new Error(`Gemini API 错误: 提示因 ${promptFeedback.blockReason} 被阻止`);
                                    if (typeof onError === 'function') onError(promptError);
                                }
                            } catch (parseError) {
                                if (dataJson) {
                                    console.warn("Gemini SSE JSON 解析错误:", parseError, "数据:", dataJson);
                                }
                            }
                        }
                    }
                    lines.forEach(handleGeminiLine);
                }
                if (typeof onComplete === 'function') {
                    onComplete(accumulatedAnswerContent);
                }
            } else {
                console.error("Gemini 响应体为空");
                if (typeof onError === 'function') {
                    onError(new Error("Gemini API 错误: 响应体为空"));
                }
            }
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.log("Gemini 请求被中止.");
                if (!signal && typeof onError === 'function') {
                    onError(error);
                }
            } else {
                console.error("Gemini 调用/处理失败:", error);
                if (typeof onError === 'function') {
                    onError(new Error(`Gemini API 网络或处理错误: ${error.message}`));
                }
            }
        }
    }
    async function callAnthropic(endpoint, apiKey, userPrompt, modelId, temperature = 0.7, max_tokens = 8000, onChunk = null, onComplete = null, onError = null, signal = null, visionEnabled = false) {
        const effectiveSignal = signal || new AbortController().signal;
        let timeoutId = null;
        if (!signal) {
            timeoutId = setTimeout(() => {
                console.error("Anthropic fetch 超时 (内部)");
                if (typeof onError === 'function') {
                    onError(new Error("Anthropic API 网络错误: 请求超时 (内部)"));
                }
            }, 60000);
        } else {
            effectiveSignal.addEventListener('abort', () => {
                console.log("Anthropic 请求被外部信号中止。");
                if (typeof onError === 'function') {
                    onError(new DOMException('请求被中止', 'AbortError'));
                }
            }, { once: true });
        }
        try {
            const aiConfig = JSON.parse(localStorage.getItem('aiConfig') || '{}');
            const disableMaxTokens = aiConfig.disableMaxTokens || false;
            const modelToUse = modelId || "claude-sonnet-4-20250514";
            let finalContent;
            if (visionEnabled) {
                finalContent = userPrompt.map(part => {
                    if (part.type === 'image_url') {
                        const base64Data = part.image_url.url;
                        const parts = base64Data.split(',');
                        const mimeMatch = parts[0].match(/:(.*?);/);
                        return { type: 'image', source: { type: 'base64', media_type: mimeMatch[1], data: parts[1] } };
                    }
                    return { type: 'text', text: part.text };
                });
            } else {
                finalContent = [{ type: 'text', text: userPrompt }];
            }
            const payloadData = {
                model: modelToUse,
                messages: [{ role: "user", content: finalContent }],
                temperature: temperature,
                stream: true
            };
            if (!disableMaxTokens) {
                payloadData.max_tokens = max_tokens;
            }
            const payload = JSON.stringify(payloadData);
            console.log("调用 Anthropic (流式 Fetch):", { endpoint, model: modelToUse, temperature, max_tokens: disableMaxTokens ? 'unlimited' : max_tokens });
            const disableCorrection = aiConfig.disableCorrection || false;
            let finalEndpoint = endpoint;
            if (!disableCorrection) {
                let cleanEndpoint = endpoint.split('?')[0].replace(/\/$/, '');
                const targetPath = '/v1/messages';
                if (!cleanEndpoint.endsWith(targetPath)) {
                    if (cleanEndpoint.includes('/v1')) {
                        cleanEndpoint = cleanEndpoint.substring(0, cleanEndpoint.indexOf('/v1')) + targetPath;
                    } else {
                        cleanEndpoint += targetPath;
                    }
                    console.warn("Anthropic Endpoint 已自动修正为:", cleanEndpoint);
                }
                finalEndpoint = cleanEndpoint + (endpoint.includes('?') ? endpoint.substring(endpoint.indexOf('?')) : '');
            }
            const response = await fetch(finalEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                },
                body: payload,
                signal: effectiveSignal
            });
            if (timeoutId) clearTimeout(timeoutId);
            if (!response.ok) {
                let errorMsg = `Anthropic API 错误 (${response.status}): ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = `Anthropic API 错误 (${response.status}): ${errorData.error?.type || errorData.type || response.statusText} - ${errorData.error?.message || errorData.message || ''}`;
                } catch (e) {
                    try {
                        const textError = await response.text();
                        console.error("Anthropic 原始错误响应:", textError);
                        errorMsg += ` - ${textError.substring(0, 100)}`;
                    } catch (textE) { }
                }
                console.error("Anthropic fetch 错误:", errorMsg);
                if (typeof onError === 'function') {
                    onError(new Error(errorMsg));
                }
                return;
            }
            if (response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let accumulatedContent = '';
                let buffer = '';
                let streamEnded = false;
                while (!streamEnded) {
                    const { done, value } = await reader.read();
                    if (done) {
                        console.log("Anthropic 流式处理已完成。");
                        streamEnded = true;
                        break;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const blocks = buffer.split('\n\n');
                    buffer = blocks.pop() || '';
                    blocks.forEach(block => {
                        if (!block.trim()) return;
                        let eventType = null;
                        let dataJson = null;
                        const lines = block.split('\n');
                        for (let k = 0; k < lines.length; k++) {
                            const line = lines[k];
                            if (line.startsWith('event: ')) {
                                eventType = line.substring(7).trim();
                            } else if (line.startsWith('data: ')) {
                                dataJson = line.substring(6).trim();
                            }
                        }
                        if (eventType && dataJson) {
                            try {
                                const data = JSON.parse(dataJson);
                                if (eventType === 'content_block_delta') {
                                    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                                        const delta = data.delta.text;
                                        accumulatedContent += delta;
                                        if (typeof onChunk === 'function') {
                                            onChunk(delta);
                                        }
                                    } else if (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta') {
                                        const thinkingDelta = data.delta.thinking;
                                        if (thinkingDelta && typeof onChunk === 'function') {
                                            onChunk(`<think>${thinkingDelta}</think>`);
                                        }
                                    }
                                } else if (eventType === 'message_start') {
                                } else if (eventType === 'message_delta') {
                                } else if (eventType === 'message_stop') {
                                    console.log("Anthropic 流式传输已停止 (收到 message_stop 事件)");
                                    streamEnded = true;
                                } else if (eventType === 'ping') {
                                } else if (eventType === 'error') {
                                    console.error("Anthropic 流式传输错误事件:", data);
                                    {
                                        const streamError = new Error(`Anthropic API 错误: ${data.error?.type} - ${data.error?.message}`);
                                        if (typeof onError === 'function') onError(streamError);
                                        streamEnded = true;
                                    }
                                } else {
                                    console.warn("未知的 Anthropic 事件类型:", eventType, data);
                                }
                            } catch (parseError) {
                                console.warn("Anthropic SSE JSON 解析错误:", parseError, "数据:", dataJson);
                            }
                        }
                    });
                }
                if (typeof onComplete === 'function') {
                    onComplete(accumulatedContent);
                }
            } else {
                console.error("Anthropic 响应体为空");
                if (typeof onError === 'function') {
                    onError(new Error("Anthropic API 错误: 响应体为空"));
                }
            }
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.log("Anthropic 请求被中止.");
                if (!signal && typeof onError === 'function') {
                    onError(error);
                }
            } else {
                console.error("Anthropic 调用/处理失败:", error);
                if (typeof onError === 'function') {
                    onError(new Error(`Anthropic API 网络或处理错误: ${error.message}`));
                }
            }
        }
    }
    async function callAzureOpenAI(endpoint, apiKey, apiVersion, modelId, userPrompt, temperature = 0.7, max_tokens = 8000, onChunk = null, onComplete = null, onError = null, signal = null, visionEnabled = false) {
        const effectiveSignal = signal || new AbortController().signal;
        let timeoutId = null;
        if (!signal) {
            timeoutId = setTimeout(() => {
                console.error("Azure OpenAI fetch 超时 (内部)");
                if (typeof onError === 'function') {
                    onError(new Error("Azure OpenAI API 网络错误: 请求超时 (内部)"));
                }
            }, 60000);
        } else {
            effectiveSignal.addEventListener('abort', () => {
                console.log("Azure OpenAI 请求被外部信号中止。");
                if (typeof onError === 'function') {
                    onError(new DOMException('请求被中止', 'AbortError'));
                }
            }, { once: true });
        }
        try {
            const aiConfig = JSON.parse(localStorage.getItem('aiConfig') || '{}');
            const disableCorrection = aiConfig.disableCorrection || false;
            const disableMaxTokens = aiConfig.disableMaxTokens || false;
            const version = apiVersion || '2024-05-01-preview';
            let finalEndpoint;
            let cleanEndpointBase = endpoint.split('?')[0].replace(/\/$/, '');
            const urlParams = new URLSearchParams(endpoint.split('?')[1] || '');
            if (!urlParams.has('api-version')) {
                urlParams.set('api-version', version);
            }
            if (disableCorrection) {
                finalEndpoint = `${cleanEndpointBase}?${urlParams.toString()}`;
            } else {
                const isOpenAIStyle = cleanEndpointBase.includes('.openai.azure.com');
                const isAIServicesStyle = cleanEndpointBase.includes('.services.ai.azure.com') || cleanEndpointBase.includes('.inference.ai.azure.com');
                if (!isOpenAIStyle && !isAIServicesStyle) {
                    console.warn("Azure 端点主机名似乎不符合预期（应为 '*.openai.azure.com' 或 '*.services.ai.azure.com' 或 '*.inference.ai.azure.com'）：", cleanEndpointBase);
                }
                if (isOpenAIStyle) {
                    if (!cleanEndpointBase.includes('/openai/deployments/')) {
                        console.warn("Azure OpenAI 风格的端点路径可能不完整。期望格式：'.../openai/deployments/<deployment-id>/chat/completions'。当前：", cleanEndpointBase);
                    } else if (!cleanEndpointBase.endsWith('/chat/completions')) {
                        console.warn("Azure OpenAI 风格的端点路径可能不完整，将确保以 '/chat/completions' 结尾。当前：", cleanEndpointBase);
                        if (/\/openai\/deployments\/[^/]+$/.test(cleanEndpointBase)) {
                            cleanEndpointBase += '/chat/completions';
                        }
                    }
                } else if (isAIServicesStyle) {
                    if (!cleanEndpointBase.endsWith('/models/chat/completions')) {
                        console.warn("Azure AI Services 风格的端点路径可能不完整。期望格式：'.../models/chat/completions'。当前：", cleanEndpointBase);
                        if (cleanEndpointBase.endsWith('/models/chat')) {
                            cleanEndpointBase += '/completions';
                        }
                    }
                }
                finalEndpoint = `${cleanEndpointBase}?${urlParams.toString()}`;
            }
            console.log("调用 Azure OpenAI (流式 Fetch):", { fullEndpoint: finalEndpoint, model: modelId, temperature, max_tokens: disableMaxTokens ? 'unlimited' : max_tokens });
            const requestBody = {
                model: modelId,
                messages: [{
                    role: "user",
                    content: visionEnabled ? userPrompt : [{ type: "text", text: String(userPrompt) }]
                }],
                temperature: temperature,
                stream: true
            };
            if (!disableMaxTokens) {
                requestBody.max_tokens = max_tokens;
            }
            const payload = JSON.stringify(requestBody);
            const response = await fetch(finalEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: payload,
                signal: effectiveSignal
            });
            if (timeoutId) clearTimeout(timeoutId);
            if (!response.ok) {
                let errorMsg = `Azure OpenAI API 错误 (${response.status}): ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = `Azure OpenAI API 错误 (${response.status}): ${errorData.error?.message || errorData.message || response.statusText}`;
                } catch (e) {
                    try {
                        const textError = await response.text();
                        console.error("Azure OpenAI 原始错误响应:", textError);
                        errorMsg += ` - ${textError.substring(0, 100)}`;
                    } catch (textE) { }
                }
                console.error("Azure OpenAI fetch 错误:", errorMsg);
                if (typeof onError === 'function') {
                    onError(new Error(errorMsg));
                }
                return;
            }
            if (response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let accumulatedContent = '';
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        console.log("Azure OpenAI 流式处理已完成。");
                        break;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    function handleAzureLine(line) {
                        if (line.startsWith('data: ')) {
                            const dataJson = line.substring(6).trim();
                            if (dataJson === '[DONE]') {
                                console.log("Azure OpenAI 流式处理收到 [DONE]");
                                return;
                            }
                            try {
                                const data = JSON.parse(dataJson);
                                const choice = data.choices?.[0];
                                if (choice) {
                                    const delta = choice.delta;
                                    if (delta) {
                                        const deltaContent = delta.content;
                                        const reasoningContent = delta.reasoning_content || delta.reasoning;
                                        if (reasoningContent) {
                                            if (typeof onChunk === 'function') {
                                                onChunk(`<think>${reasoningContent}</think>`);
                                            }
                                        } else if (deltaContent) {
                                            accumulatedContent += deltaContent;
                                            if (typeof onChunk === 'function') {
                                                onChunk(deltaContent);
                                            }
                                        }
                                    }
                                    const finishReason = choice.finish_reason;
                                    if (finishReason && finishReason !== "stop") {
                                        console.warn("Azure OpenAI 流式处理结束，原因：", finishReason, "数据：", dataJson);
                                        if (finishReason === "content_filter") {
                                            let filterMessage = "Azure OpenAI API 错误: 响应因内容过滤器被阻止。";
                                            if (data.prompt_filter_results && data.prompt_filter_results.length > 0) {
                                                filterMessage = `Azure OpenAI API 错误: 提示因内容过滤器 (${data.prompt_filter_results[0].content_filter_results.hate.filtered ? 'hate' : ''}...)被阻止。`;
                                            } else if (choice.content_filter_results) {
                                                const results = choice.content_filter_results;
                                                let reasons = [];
                                                if (results.hate?.filtered) reasons.push("hate");
                                                if (results.self_harm?.filtered) reasons.push("self_harm");
                                                if (results.sexual?.filtered) reasons.push("sexual");
                                                if (results.violence?.filtered) reasons.push("violence");
                                                if (reasons.length > 0) filterMessage += ` 检测到: ${reasons.join(', ')}.`;
                                            }
                                            const filterError = new Error(filterMessage);
                                            if (typeof onError === 'function') onError(filterError);
                                        }
                                    }
                                }
                            } catch (parseError) {
                                if (dataJson) {
                                    console.warn("Azure SSE JSON 解析错误:", parseError, "数据:", dataJson);
                                }
                            }
                        }
                    }
                    lines.forEach(handleAzureLine);
                }
                if (typeof onComplete === 'function') {
                    onComplete(accumulatedContent);
                }
            } else {
                console.error("Azure OpenAI 响应体为空");
                if (typeof onError === 'function') {
                    onError(new Error("Azure OpenAI API 错误: 响应体为空"));
                }
            }
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.log("Azure OpenAI 请求被中止.");
                if (!signal && typeof onError === 'function') {
                    onError(error);
                }
            } else {
                console.error("Azure OpenAI 调用/处理失败:", error);
                if (typeof onError === 'function') {
                    onError(new Error(`Azure OpenAI API 网络或处理错误: ${error.message}`));
                }
            }
        }
    }
    async function dispatchAICall(config, prompt, onChunk, onComplete, onError, signal) {
        const { provider, endpoint, apiKey, model, temperature, max_tokens, azureApiVersion } = config;
        if (provider === 'default') {
            const textPrompt = typeof prompt === 'string' ? prompt : prompt.map(p => p.text || '').join('\n');
            return callXiaoyaStream(textPrompt, onChunk, onComplete, onError, signal);
        }
        if (!endpoint || !apiKey) {
            throw new Error(`AI 提供商 "${provider}" 的 API 地址或 Key 未配置。`);
        }
        const isVision = Array.isArray(prompt);
        switch (provider) {
            case 'openai':
                return callOpenAI(endpoint, apiKey, prompt, model, temperature, max_tokens, onChunk, onComplete, onError, signal, isVision);
            case 'gemini':
                return callGemini(endpoint, apiKey, prompt, model, temperature, max_tokens, onChunk, onComplete, onError, signal, isVision);
            case 'anthropic':
                return callAnthropic(endpoint, apiKey, prompt, model, temperature, max_tokens, onChunk, onComplete, onError, signal, isVision);
            case 'azure':
                return callAzureOpenAI(endpoint, apiKey, azureApiVersion, model, prompt, temperature, max_tokens, onChunk, onComplete, onError, signal, isVision);
            default:
                throw new Error(`不支持的 AI 提供商: ${provider}`);
        }
    }
    class ThinkingHandler {
        constructor(container, options = {}) {
            this.container = container;
            this.autoScrollEnabled = options.autoScrollEnabled === true;
            this.thinkingProcessDiv = null;
            this.timelineContainer = null;
            this.detailsElement = null;
            this._steps = [];
            this._currentStepIndex = -1;
            this._buffer = "";
            this.isUserScrolledUp = false;
            this._isFirstChunk = true;
        }
        _ensureUi() {
            if (!this.container) return false;
            if (!this.thinkingProcessDiv || !this.container.contains(this.thinkingProcessDiv)) {
                this.thinkingProcessDiv = this.container.querySelector('.ai-thinking-process');
                if (!this.thinkingProcessDiv) {
                    this.thinkingProcessDiv = document.createElement('div');
                    this.thinkingProcessDiv.className = 'ai-thinking-process';
                    this.thinkingProcessDiv.style.marginTop = '15px';
                    this.thinkingProcessDiv.style.display = 'none';
                    this.container.appendChild(this.thinkingProcessDiv);
                }
                this.detailsElement = this.thinkingProcessDiv.querySelector('details');
                if (!this.detailsElement) {
                    this.thinkingProcessDiv.innerHTML = `
                    <details style="margin-top: 15px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb;">
                        <summary style="padding: 8px 12px; cursor: pointer; font-weight: 600; color: #4b5569; font-size: 13px; list-style: none; display: flex; align-items: center;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; transition: transform 0.2s;"><path d="M9 18l6-6-6-6"/></svg>
                            查看 AI 思考过程
                        </summary>
                        <div class="timeline-container"></div>
                    </details>
                `;
                    this.detailsElement = this.thinkingProcessDiv.querySelector('details');
                    this.timelineContainer = this.thinkingProcessDiv.querySelector('.timeline-container');
                    const summaryElement = this.thinkingProcessDiv.querySelector('summary');
                    const arrowSvg = summaryElement.querySelector('svg');
                    this.detailsElement.addEventListener('toggle', () => {
                        if (arrowSvg) {
                            arrowSvg.style.transform = this.detailsElement.open ? 'rotate(90deg)' : 'rotate(0deg)';
                        }
                    });
                } else {
                    this.timelineContainer = this.thinkingProcessDiv.querySelector('.timeline-container');
                }
                if (this.timelineContainer && !this.timelineContainer.dataset.scrollListenerAttached) {
                    this.timelineContainer.addEventListener('scroll', () => {
                        this.isUserScrolledUp = !this._isAtBottom();
                    });
                    this.timelineContainer.dataset.scrollListenerAttached = 'true';
                }
            }
            return true;
        }
        _createNewStep(title) {
            if (!this.timelineContainer) return;
            if (this._currentStepIndex > -1 && this._steps[this._currentStepIndex]) {
                const previousStep = this._steps[this._currentStepIndex];
                if (previousStep.title === "正在思考...") {
                    const newTitle = "初步分析";
                    previousStep.title = newTitle;
                    previousStep.titleElement.textContent = newTitle;
                }
                previousStep.element.classList.remove('active');
                previousStep.element.classList.add('completed');
            }
            const stepElement = document.createElement('div');
            stepElement.className = 'timeline-step active';
            stepElement.innerHTML = `
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                <h4></h4>
                <p></p>
            </div>
        `;
            const titleElement = stepElement.querySelector('h4');
            const contentElement = stepElement.querySelector('p');
            titleElement.textContent = title;
            this.timelineContainer.appendChild(stepElement);
            this._currentStepIndex++;
            this._steps[this._currentStepIndex] = {
                title,
                content: "",
                element: stepElement,
                titleElement,
                contentElement
            };
            if (!this.isUserScrolledUp) {
                requestAnimationFrame(() => this._scrollToBottom());
            }
        }
        _updateCurrentStepContent(text) {
            if (this._currentStepIndex === -1 || !this._steps[this._currentStepIndex]) return;
            const currentStep = this._steps[this._currentStepIndex];
            currentStep.content += text;
            const renderedHtml = renderSimpleMarkdown(currentStep.content);
            requestAnimationFrame(() => {
                currentStep.contentElement.innerHTML = renderedHtml;
                applyMathRendering(currentStep.contentElement);
                if (!this.isUserScrolledUp) {
                    this._scrollToBottom();
                }
            });
        }
        addContent(delta) {
            if (!this._ensureUi()) return;
            if (this._isFirstChunk) {
                this.show(true);
                this._isFirstChunk = false;
            } else {
                this.show(false);
            }
            this._buffer += delta;
            if (this._currentStepIndex === -1) {
                this._createNewStep("正在思考...");
            }
            while (true) {
                const titleMatch = this._buffer.match(/\*\*(.*?)\*\*/);
                if (!titleMatch) {
                    if (this._buffer.length > 0) {
                        this._updateCurrentStepContent(this._buffer);
                        this._buffer = '';
                    }
                    break;
                }
                const contentBeforeTitle = this._buffer.substring(0, titleMatch.index);
                const newTitle = titleMatch[1].trim();
                if (this._currentStepIndex === 0 && this._steps[0].title === "正在思考..." && this._steps[0].content === "" && contentBeforeTitle.trim() === "") {
                    this._steps[0].title = newTitle;
                    this._steps[0].titleElement.textContent = newTitle;
                } else {
                    if (contentBeforeTitle) {
                        this._updateCurrentStepContent(contentBeforeTitle);
                    }
                    this._createNewStep(newTitle);
                }
                this._buffer = this._buffer.substring(titleMatch.index + titleMatch[0].length);
            }
        }
        show(makeOpen = true) {
            if (!this._ensureUi()) return;
            this.thinkingProcessDiv.style.display = 'block';
            if (makeOpen && this.detailsElement && !this.detailsElement.open) {
                this.detailsElement.open = true;
            }
        }
        hide() {
            if (this.thinkingProcessDiv) {
                this.thinkingProcessDiv.style.display = 'none';
            }
        }
        reset() {
            if (this._ensureUi() && this.timelineContainer) {
                this.timelineContainer.innerHTML = '';
            }
            this._steps = [];
            this._currentStepIndex = -1;
            this._buffer = "";
            this.isUserScrolledUp = false;
            this._isFirstChunk = true;
            this.hide();
        }
        finalize() {
            if (!this._ensureUi()) return;
            if (this._currentStepIndex > -1 && this._steps[this._currentStepIndex]) {
                const lastStep = this._steps[this._currentStepIndex];
                if (lastStep.title === "正在思考...") {
                    const finalTitle = "思考过程";
                    lastStep.title = finalTitle;
                    lastStep.titleElement.textContent = finalTitle;
                }
                lastStep.element.classList.remove('active');
                lastStep.element.classList.add('completed');
            }
        }
        _isAtBottom() {
            if (!this.timelineContainer) return true;
            const threshold = 10;
            return this.timelineContainer.scrollHeight - this.timelineContainer.scrollTop - this.timelineContainer.clientHeight <= threshold;
        }
        _scrollToBottom() {
            if (this.timelineContainer) {
                this.timelineContainer.scrollTop = this.timelineContainer.scrollHeight;
            }
        }
    }
    class StreamProcessor {
        constructor(targetElement, questionTypeNum, thinkingHandler, onUpdateTarget, onFinalizeTarget) {
            this.targetElement = targetElement;
            this.questionTypeNum = questionTypeNum;
            this.thinkingHandler = thinkingHandler;
            this.onUpdateTarget = onUpdateTarget;
            this.onFinalizeTarget = onFinalizeTarget;
            this.buffer = '';
            this.isThinking = false;
            this.currentMainContent = '';
            this.currentThinkingContent = '';
            this.thinkStartTag = '<think>';
            this.thinkEndTag = '</think>';
        }
        processChunk(delta) {
            if (!delta) return;
            this.buffer += delta;
            let thinkStartIndex, thinkEndIndex;
            while (this.buffer.length > 0) {
                if (!this.isThinking) {
                    thinkStartIndex = this.buffer.indexOf(this.thinkStartTag);
                    if (thinkStartIndex !== -1) {
                        const beforeThink = this.buffer.substring(0, thinkStartIndex);
                        this.currentMainContent += beforeThink;
                        if (typeof this.onUpdateTarget === 'function') {
                            this.onUpdateTarget(beforeThink);
                        }
                        this.isThinking = true;
                        this.buffer = this.buffer.substring(thinkStartIndex + this.thinkStartTag.length);
                    } else {
                        this.currentMainContent += this.buffer;
                        if (typeof this.onUpdateTarget === 'function') {
                            this.onUpdateTarget(this.buffer);
                        }
                        this.buffer = '';
                        break;
                    }
                } else {
                    thinkEndIndex = this.buffer.indexOf(this.thinkEndTag);
                    if (thinkEndIndex !== -1) {
                        const thinkingPart = this.buffer.substring(0, thinkEndIndex);
                        this.currentThinkingContent += thinkingPart;
                        this.thinkingHandler.addContent(thinkingPart);
                        this.isThinking = false;
                        this.buffer = this.buffer.substring(thinkEndIndex + this.thinkEndTag.length);
                    } else {
                        this.currentThinkingContent += this.buffer;
                        this.thinkingHandler.addContent(this.buffer);
                        this.buffer = '';
                        break;
                    }
                }
            }
        }
        processComplete() {
            console.log("StreamProcessor 流式处理已完成。");
            if (this.buffer) {
                if (this.isThinking) {
                    this.currentThinkingContent += this.buffer;
                    this.thinkingHandler.update(this.buffer);
                } else {
                    this.currentMainContent += this.buffer;
                    if (typeof this.onUpdateTarget === 'function') {
                        if (this.questionTypeNum !== 4) this.onUpdateTarget(this.buffer);
                    }
                }
                this.buffer = '';
            }
            this.thinkingHandler.finalize();
            if (!this.currentThinkingContent.trim()) {
                this.thinkingHandler.hide();
            }
            return {
                mainContent: this.currentMainContent,
                thinkingContent: this.currentThinkingContent
            };
        }
        reset() {
            this.buffer = '';
            this.isThinking = false;
            this.currentMainContent = '';
            this.currentThinkingContent = '';
            this.thinkingHandler.reset();
        }
    }
    function isEmptyRichText(content) {
        try {
            let jsonContent = JSON.parse(content);
            if (jsonContent.blocks.length === 1 &&
                jsonContent.blocks[0].text === "" &&
                Object.keys(jsonContent.entityMap).length === 0) {
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }
    async function uploadImage(file) {
        try {
            const token = getToken();
            if (!token) {
                throw new Error('无法获取授权，请确保已登录');
            }
            const uploadId = `rc-upload-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const credentialResponse = await fetch(`${window.location.origin}/api/jx-oresource/disk/files`, {
                method: 'POST',
                headers: {
                    "accept": "*/*",
                    "authorization": `Bearer ${token}`,
                    "content-type": "application/json; charset=UTF-8"
                },
                body: JSON.stringify({
                    uploadId: uploadId,
                    filename: file.name,
                    file_size: file.size
                })
            });
            const credentialData = await credentialResponse.json();
            if (!credentialData.success || !credentialData.data) {
                console.error('上传凭证数据不完整:', credentialData);
                throw new Error(credentialData.message || '获取上传凭证失败，返回的数据结构不完整');
            }
            const formData = new FormData();
            formData.append('key', credentialData.data.multipart.key);
            for (const key in credentialData.data.multipart) {
                if (key !== 'key') {
                    formData.append(key, credentialData.data.multipart[key]);
                }
            }
            formData.append('file', file);
            console.log('上传地址:', credentialData.data.host);
            console.log('表单数据:', Object.keys(credentialData.data.multipart));
            const uploadResponse = await fetch(credentialData.data.host, {
                method: 'POST',
                body: formData
            });
            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                console.error('上传失败响应:', errorText);
                throw new Error(`文件上传失败，状态码: ${uploadResponse.status}, 错误信息: ${errorText}`);
            }
            if (!credentialData.data.multipart.id) {
                console.error('缺少文件ID:', credentialData);
                throw new Error('上传成功但缺少文件ID');
            }
            return `${window.location.origin}/api/jx-oresource/cloud/file_access/${credentialData.data.multipart.id}`;
        } catch (error) {
            console.error('上传图片失败:', error);
            throw error;
        }
    }
    function insertImageToEditor(editor, imageUrl) {
        const imgElement = `
            <div style="margin: 10px 0;">
                <img src="${imageUrl}"
                    alt="上传图片"
                    style="max-width: 100%;
                            height: auto;
                            border-radius: 8px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                            transition: transform 0.3s ease;"
                    onmouseover="this.style.transform='scale(1.02)'"
                    onmouseout="this.style.transform='scale(1)'"
                    onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5OTkiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiI+PC9yZWN0PjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ij48L2NpcmNsZT48cG9seWxpbmUgcG9pbnRzPSIyMSAxNSAxNiAxMCA1IDIxIj48L3BvbHlsaW5lPjwvc3ZnPg=='"/>
            </div>`;
        if (window.getSelection) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                if (range.commonAncestorContainer === editor || editor.contains(range.commonAncestorContainer)) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = imgElement;
                    const imgNode = tempDiv.firstElementChild;
                    if (imgNode) {
                        range.deleteContents();
                        range.insertNode(imgNode);
                        try {
                            range.setStartAfter(imgNode);
                            range.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(range);
                        } catch (error) {
                            console.warn('设置光标位置失败，但图片已成功插入:', error);
                        }
                        return;
                    }
                }
            }
        }
        editor.innerHTML += imgElement;
    }
    function updateAnswerWithContent(question, htmlContent) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        const blocks = [];
        let currentTextBlock = "";
        let blockKey = 0;
        function processNodes() {
            const allNodes = [];
            const walkNodes = (node, isRoot = false) => {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                    allNodes.push({ type: 'text', node: node });
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.nodeName === 'IMG') {
                        allNodes.push({ type: 'image', node: node });
                    } else if (node.nodeName === 'BR') {
                        allNodes.push({ type: 'linebreak' });
                    } else if (!isRoot && (node.nodeName === 'DIV' || node.style.display === 'block')) {
                        const childNodes = Array.from(node.childNodes);
                        childNodes.forEach(child => walkNodes(child));
                        if (node.nextSibling) {
                            allNodes.push({ type: 'linebreak' });
                        }
                    } else {
                        Array.from(node.childNodes).forEach(child => walkNodes(child));
                    }
                }
            };
            walkNodes(tempDiv, true);
            return allNodes;
        }
        const nodes = processNodes();
        for (let i = 0; i < nodes.length; i++) {
            const nodeInfo = nodes[i];
            if (nodeInfo.type === 'text') {
                currentTextBlock += nodeInfo.node.textContent;
            } else if (nodeInfo.type === 'linebreak') {
                if (i < nodes.length - 1) {
                    currentTextBlock += '\n';
                }
            } else if (nodeInfo.type === 'image') {
                if (currentTextBlock) {
                    blocks.push({
                        key: `block${blockKey++}`,
                        text: currentTextBlock,
                        type: 'unstyled',
                        depth: 0,
                        inlineStyleRanges: [],
                        entityRanges: [],
                        data: {}
                    });
                    currentTextBlock = "";
                }
                const img = nodeInfo.node;
                if (img && img.src) {
                    const fileIdMatch = img.src.match(/\/cloud\/file_access\/(\d+)/);
                    if (fileIdMatch && fileIdMatch[1]) {
                        blocks.push({
                            key: `block${blockKey++}`,
                            text: "",
                            type: "atomic",
                            depth: 0,
                            inlineStyleRanges: [],
                            entityRanges: [],
                            data: {
                                type: "IMAGE",
                                src: `${window.location.origin}/api/jx-oresource/cloud/file_access/${fileIdMatch[1]}`
                            }
                        });
                    }
                }
            }
        }
        if (currentTextBlock) {
            blocks.push({
                key: `block${blockKey++}`,
                text: currentTextBlock,
                type: 'unstyled',
                depth: 0,
                inlineStyleRanges: [],
                entityRanges: [],
                data: {}
            });
        }
        if (blocks.length === 0) {
            blocks.push({
                key: 'empty',
                text: '',
                type: 'unstyled',
                depth: 0,
                inlineStyleRanges: [],
                entityRanges: [],
                data: {}
            });
        }
        const richTextContent = {
            blocks: blocks,
            entityMap: {}
        };
        question.answer_items[0].answer = JSON.stringify(richTextContent);
    }
    async function buildMultimodalPrompt(provider, question, promptTemplate, customPrompts, currentAnswerContent, extraText = '', paperDescription = null, temporaryPrompt = '', imageDescriptions = '', extraImages = []) {
        const questionTypeNum = question.type;
        let multimodalContent = [];
        let combinedExtraText = '';
        if (extraText) {
            combinedExtraText += `\n\n【听力原文】:\n${extraText}`;
        }
        if (imageDescriptions) {
            combinedExtraText += `\n\n【图片内容描述】:\n${imageDescriptions}`;
        }
        if (temporaryPrompt || extraImages.length > 0) {
            multimodalContent.push({ type: 'text', text: `【临时指令与补充材料】:\n` });
            if (temporaryPrompt) {
                multimodalContent.push({ type: 'text', text: temporaryPrompt });
            }
            if (extraImages.length > 0) {
                multimodalContent.push(...extraImages);
            }
            multimodalContent.push({ type: 'text', text: '\n\n---\n\n' });
        }
        if (paperDescription) {
            multimodalContent.push({ type: 'text', text: '【作业说明及公共材料】:\n' });
            multimodalContent.push(...await parseRichTextToMultimodalContent(paperDescription));
            multimodalContent.push({ type: 'text', text: '\n\n---\n\n' });
        }
        const placeholderRegex = /(\{questionTitle\}|\{optionsText\}|\{stemsText\}|\{answerContent\})/g;
        const templateParts = promptTemplate.split(placeholderRegex);
        const parseToStandardFormat = async (richText) => {
            return await parseRichTextToMultimodalContent(richText);
        };
        for (const part of templateParts) {
            switch (part) {
                case '{questionTitle}':
                    if (question.parentQuestion && question.parentQuestion.title) {
                        multimodalContent.push(...await parseToStandardFormat(question.parentQuestion.title));
                        multimodalContent.push({ type: 'text', text: '\n\n--- (子题目) ---\n\n' });
                    }
                    multimodalContent.push(...await parseToStandardFormat(question.title));
                    break;
                case '{optionsText}':
                    if ([1, 2, 5, 12].includes(questionTypeNum)) {
                        for (const [idx, item] of question.answer_items.entries()) {
                            const letter = String.fromCharCode(65 + idx);
                            const prefix = questionTypeNum === 5 ? (idx === 0 ? '正确' : '错误') : '';
                            multimodalContent.push({ type: 'text', text: `\n${letter}. ${prefix}` });
                            if (questionTypeNum !== 5) {
                                multimodalContent.push(...await parseToStandardFormat(item.value));
                            }
                        }
                    } else if (questionTypeNum === 13) {
                        const rightItems = question.answer_items.filter(item => item.is_target_opt);
                        for (const [idx, item] of rightItems.entries()) {
                            const letter = String.fromCharCode(97 + idx);
                            multimodalContent.push({ type: 'text', text: `\n${letter}. ` });
                            multimodalContent.push(...await parseToStandardFormat(item.value));
                        }
                    }
                    break;
                case '{stemsText}':
                    if (questionTypeNum === 13) {
                        const leftItems = question.answer_items.filter(item => !item.is_target_opt);
                        for (const [idx, item] of leftItems.entries()) {
                            const letter = String.fromCharCode(65 + idx);
                            multimodalContent.push({ type: 'text', text: `\n${letter}. ` });
                            multimodalContent.push(...await parseToStandardFormat(item.value));
                        }
                    }
                    break;
                case '{answerContent}':
                    if ([4, 6, 10].includes(questionTypeNum)) {
                        let contentText;
                        if (currentAnswerContent !== null) {
                            contentText = htmlToPlainText(currentAnswerContent);
                        } else {
                            contentText = parseRichTextToPlainText(question.answer_items[0]?.answer || '');
                        }
                        if (contentText) {
                            multimodalContent.push({ type: 'text', text: contentText });
                        }
                    }
                    break;
                default:
                    if (part) {
                        let textPart = part;
                        textPart = textPart.replace('{questionType}', getQuestionType(question.type));
                        if (question.type === 10) {
                            const progSetting = question.program_setting || {};
                            textPart = textPart.replace('{language}', progSetting.language?.join(', ') || '未指定');
                            textPart = textPart.replace('{max_time}', progSetting.max_time || 'N/A');
                            textPart = textPart.replace('{max_memory}', progSetting.max_memory || 'N/A');
                        }
                        multimodalContent.push({ type: 'text', text: textPart });
                    }
            }
        }
        if (combinedExtraText) {
            multimodalContent.push({ type: 'text', text: combinedExtraText });
        }
        const mergedContent = [];
        let textBuffer = '';
        for (const item of multimodalContent) {
            if (item.type === 'text') {
                textBuffer += item.text;
            } else {
                if (textBuffer) {
                    mergedContent.push({ type: 'text', text: textBuffer });
                    textBuffer = '';
                }
                mergedContent.push(item);
            }
        }
        if (textBuffer) {
            mergedContent.push({ type: 'text', text: textBuffer });
        }
        return mergedContent;
    }
    async function _getAIAnswer(question, aiConfig, customPrompts, temporaryPrompt = '', currentAnswerContent = null, onChunk = null, onComplete = null, signal = null, notificationId = null) {
        if (signal?.aborted) {
            return Promise.resolve({ cancelled: true });
        }
        let temporaryImages = [];
        if (aiConfig.visionEnabled) {
            const previewContainer = document.getElementById('temp-prompt-image-preview');
            if (previewContainer) {
                previewContainer.querySelectorAll('img').forEach(img => {
                    if (img.dataset.base64) {
                        temporaryImages.push({ type: 'image_url', image_url: { url: img.dataset.base64 } });
                    }
                });
            }
        }
        const questionTypeNum = question.type;
        const questionType = getQuestionType(questionTypeNum);
        const typeCodeStr = String(questionTypeNum);
        let promptTemplate = customPrompts[typeCodeStr] || defaultPrompts[typeCodeStr];
        if (!promptTemplate) {
            console.warn(`未找到题型 ${questionTypeNum} (${questionType}) 的 Prompt 模板！将跳过此题。`);
            return Promise.resolve({ skipped: true, reason: `不支持的题型 (${questionType})` });
        }
        const paperDescription = localStorage.getItem('paperDescription');
        const questionIdForLog = question.parentQuestion ?
            `${question.parentQuestion.id} (子问题: ${question.id})` :
            question.id;
        const videoCheckEnabled = aiConfig.sttVideoEnabled !== false;
        const MEDIA_PROCESS_ID = notificationId || `media-process-${question.id}`
        const hasVideoInSelf = containsVideo(question.title);
        const hasVideoInParent = question.parentQuestion && containsVideo(question.parentQuestion.title);
        const hasVideoInPaper = paperDescription && containsVideo(paperDescription);
        const hasVideo = hasVideoInSelf || hasVideoInParent || hasVideoInPaper;
        const hasAudioInSelf = containsAudio(question.title);
        const hasAudioInParent = question.parentQuestion && containsAudio(question.parentQuestion.title);
        const hasAudioInPaper = paperDescription && containsAudio(paperDescription);
        const hasAudio = hasAudioInSelf || hasAudioInParent || hasAudioInPaper;
        let transcriptionText = '';
        let imageDescriptions = '';
        let mediaDataForPrompt = [];
        const audioProcessingMode = aiConfig.audioProcessingMode || 'main_model';
        const mainProvider = aiConfig.provider;
        const analyzeVideoFrames = aiConfig.geminiAnalyzeVideoFramesEnabled || false;
        const mainModelSupportsAudio = mainProvider === 'gemini';
        if ((hasAudio || hasVideo) && audioProcessingMode === 'main_model' && mainModelSupportsAudio) {
            console.log(`[多模态处理] 题 ${question.id}: 检测到媒体，使用主AI模型(${mainProvider})直接处理。通知ID: ${MEDIA_PROCESS_ID}`);
            showNotification('🎤 正在准备媒体文件...', { type: 'info', duration: 0, id: MEDIA_PROCESS_ID });
            try {
                const allMediaBlocks = [];
                const sources = [paperDescription, question.parentQuestion?.title, question.title].filter(Boolean);
                sources.forEach(source => {
                    try {
                        const jsonContent = JSON.parse(source);
                        jsonContent.blocks.forEach(b => {
                            if (b.type === 'atomic' && b.data && (b.data.type === 'VIDEO' || b.data.type === 'AUDIO')) {
                                allMediaBlocks.push(b);
                            }
                        });
                    } catch (e) {
                        console.warn('[Gemini视频理解] 解析视频富文本失败:', e);
                        showNotification('视频内容解析失败，无法识别视频块', { type: 'error', id: 'video-process' });
                    }
                });
                if (allMediaBlocks.length > 0) {
                    for (const mediaBlock of allMediaBlocks) {
                        const mediaType = mediaBlock.data.type;
                        const mediaId = (mediaType === 'AUDIO') ? mediaBlock.data.data.quote_id : mediaBlock.data.data.video_id;
                        if (!mediaId) continue;
                        if (videoCache[mediaId]) {
                            mediaDataForPrompt.push(videoCache[mediaId]);
                            continue;
                        }
                        if (videoProcessingLocks[mediaId]) {
                            mediaDataForPrompt.push(await videoProcessingLocks[mediaId]);
                            continue;
                        }
                        const processingPromise = (async () => {
                            try {
                                const progressCallback = (progress) => {
                                    const percentage = (progress * 100).toFixed(0);
                                    showNotification(`📹 正在下载媒体文件... (${percentage}%)`, { type: 'info', duration: 0, id: MEDIA_PROCESS_ID });
                                };
                                if (mediaType === 'VIDEO') {
                                    const urls = await getVideoUrl(mediaId);
                                    if (!urls || !urls.videoUrl) throw new Error(`无法获取视频URL for ID ${mediaId}`);
                                    if (analyzeVideoFrames) {
                                        showNotification('📹 正在下载并准备视频文件以供画面分析...', { type: 'info', duration: 0, id: MEDIA_PROCESS_ID });
                                        const videoContent = await videoToBase64(urls.videoUrl, 'video/mp4', progressCallback);
                                        if (!videoContent) throw new Error('视频转Base64失败');
                                        return { type: 'video_data', video_data: videoContent };
                                    } else {
                                        showNotification('🎵 正在从视频中提取音轨...', { type: 'info', duration: 0, id: MEDIA_PROCESS_ID });
                                        const audioBlob = await extractAndEncodeAudio(urls.videoUrl, (progress, stage) => {
                                            const message = `🎵 提取音轨: ${stage}...(${(progress * 100).toFixed(0)}%)`;
                                            showNotification(message, { id: MEDIA_PROCESS_ID, type: 'info', duration: 0 });
                                        });
                                        if (!audioBlob) throw new Error('从视频提取音轨失败');
                                        const base64Audio = await new Promise((resolve, reject) => {
                                            const reader = new FileReader();
                                            reader.onloadend = () => resolve(reader.result.split(',')[1]);
                                            reader.onerror = reject;
                                            reader.readAsDataURL(audioBlob);
                                        });
                                        return { type: 'video_data', video_data: { base64: base64Audio, mimeType: 'audio/wav' } };
                                    }
                                } else {
                                    const audioUrl = await getAudioUrl(mediaId);
                                    if (!audioUrl) throw new Error(`无法获取音频URL for ID ${mediaId}`);
                                    const audioMimeType = audioUrl.includes('.mp3') ? 'audio/mp3' : (audioUrl.includes('.wav') ? 'audio/wav' : 'audio/mpeg');
                                    const audioContent = await videoToBase64(audioUrl, audioMimeType, progressCallback);
                                    if (!audioContent) throw new Error('音频转Base64失败');
                                    return { type: 'video_data', video_data: audioContent };
                                }
                            } finally {
                                delete videoProcessingLocks[mediaId];
                            }
                        })();
                        videoProcessingLocks[mediaId] = processingPromise;
                        const result = await processingPromise;
                        videoCache[mediaId] = result;
                        mediaDataForPrompt.push(result);
                    }
                    promptTemplate = `你是一个多模态AI助手。请结合提供的【媒体文件】（可能是音频或视频）和【文本问题】来生成答案。\n\n${promptTemplate}`;
                    showNotification('🎤 媒体文件已准备好，提交给AI...', { type: 'success', duration: 2000, id: MEDIA_PROCESS_ID });
                } else {
                    showNotification('未找到有效媒体文件。', { type: 'warning', duration: 2000, id: MEDIA_PROCESS_ID });
                }
            } catch (error) {
                console.error(`[多模态处理] 失败: ${error.message}`);
                showNotification(`媒体处理失败: ${error.message}`, { type: 'error', duration: 5000, id: MEDIA_PROCESS_ID });
                transcriptionText = "[媒体处理失败，无法直接分析]";
            }
        } else if ((hasAudio || (hasVideo && videoCheckEnabled)) && aiConfig.sttEnabled) {
            const STT_PROGRESS_ID = notificationId || `stt-progress-${question.id}`;
            console.log(`[STT流程] 题 ${question.id}: 使用独立STT服务处理媒体。通知ID: ${STT_PROGRESS_ID}`);
            try {
                let allMediaBlocks = [];
                const addedMediaIds = new Set();
                const collectMediaBlocks = (richText) => {
                    if (!richText) return;
                    try {
                        const jsonContent = JSON.parse(richText);
                        const mediaBlocks = jsonContent.blocks.filter(block =>
                            block.type === 'atomic' && block.data && (block.data.type === 'AUDIO' || (block.data.type === 'VIDEO' && videoCheckEnabled))
                        );
                        mediaBlocks.forEach(block => {
                            const mediaType = block.data.type;
                            const mediaId = (mediaType === 'AUDIO') ? block.data.data?.quote_id : block.data.data?.video_id;
                            if (mediaId && !addedMediaIds.has(mediaId)) {
                                allMediaBlocks.push(block);
                                addedMediaIds.add(mediaId);
                            }
                        });
                    } catch (e) { console.error('解析富文本失败:', e, richText); }
                };
                if (hasAudioInPaper || hasVideoInPaper) collectMediaBlocks(paperDescription);
                if (hasAudioInParent || hasVideoInParent) collectMediaBlocks(question.parentQuestion.title);
                if (hasAudioInSelf || hasVideoInSelf) collectMediaBlocks(question.title);
                if (allMediaBlocks.length > 0) {
                    const transcriptionPromises = allMediaBlocks.map(async (mediaBlock, mapIndex) => {
                        const mediaType = mediaBlock.data.type;
                        const mediaId = (mediaType === 'AUDIO') ? mediaBlock.data.data.quote_id : mediaBlock.data.data.video_id;
                        const cacheKey = `${mediaType.toLowerCase()}_transcription_${mediaId}`;
                        if (sttCache[cacheKey]) {
                            console.log(`[STT Cache] HIT for ${mediaType}: ${mediaId}`);
                            return sttCache[cacheKey];
                        }
                        if (mediaProcessingLocks[mediaId]) {
                            console.log(`[STT Lock] 题 ${questionIdForLog}: 媒体 ${mediaId} 正在被其他任务处理，等待结果...`);
                            return await mediaProcessingLocks[mediaId];
                        }
                        const processingPromise = (async () => {
                            try {
                                let mediaSource;
                                if (mediaType === 'AUDIO') {
                                    mediaSource = await getAudioUrl(mediaId);
                                } else {
                                    const urls = await getVideoUrl(mediaId);
                                    if (!urls || !urls.videoUrl) throw new Error(`无法获取Video ID ${mediaId}的播放地址`);
                                    const progressCallback = (progress, stage) => {
                                        const message = `🎬 [${mapIndex + 1}/${allMediaBlocks.length}] 提取视频音轨: ${stage}...(${(progress * 100).toFixed(0)}%)`;
                                        showNotification(message, { id: STT_PROGRESS_ID, type: 'info', duration: 0 });
                                    };
                                    mediaSource = await extractAndEncodeAudio(urls.videoUrl, progressCallback);
                                }
                                if (!mediaSource) throw new Error(`无法获取 ${mediaType} ID ${mediaId} 的媒体源`);
                                if (!signal?.aborted) {
                                    showNotification(`☁️ [${mapIndex + 1}/${allMediaBlocks.length}] 上传转录 ${mediaType}...`, { id: STT_PROGRESS_ID, type: 'info', duration: 0 });
                                    const transcription = await callSttApi(mediaSource, aiConfig);
                                    sttCache[cacheKey] = transcription;
                                    return transcription;
                                }
                                return `[${mediaType}转录取消]`;
                            } catch (err) {
                                console.error(`[STT Worker] 媒体 ${mediaId} 处理失败:`, err);
                                throw err;
                            } finally {
                                delete mediaProcessingLocks[mediaId];
                            }
                        })();
                        mediaProcessingLocks[mediaId] = processingPromise;
                        return await processingPromise;
                    });
                    const allTranscriptions = await Promise.all(transcriptionPromises);
                    showNotification('媒体处理完成', { id: STT_PROGRESS_ID, type: 'success', duration: 500 });
                    if (allTranscriptions.length === 1) {
                        transcriptionText = allTranscriptions[0];
                    } else {
                        transcriptionText = allTranscriptions
                            .map((text, i) => `【媒体内容 ${i + 1}】:\n${text}`)
                            .join('\n\n---\n\n');
                    }
                    console.log('[STT流程] 所有媒体处理完成，合并后的文本:', transcriptionText);
                } else {
                    console.warn(`[STT流程] 标记为有媒体但未找到有效的媒体块。`);
                }
            } catch (error) {
                showNotification(`媒体处理失败`, { id: STT_PROGRESS_ID, type: 'error', duration: 3000 });
                console.error(`[STT流程] 为题目 ${questionIdForLog} 处理媒体时发生严重错误: ${error.message}`);
                showNotification(`处理媒体失败，将仅使用题目文本进行AI辅助。`, { type: 'warning' });
                transcriptionText = "[语音/视频转录失败]";
            }
        }
        let finalPrompt;
        let effectiveConfig = { ...aiConfig };
        let effectiveProvider = aiConfig.provider;
        const allContentSources = [question.title, paperDescription, question.parentQuestion?.title].filter(Boolean);
        if (question.answer_items) {
            question.answer_items.forEach(item => allContentSources.push(item.value));
        }
        const hasImagesInContent = allContentSources.some(source => /"type":"IMAGE"/.test(source));
        const hasImages = hasImagesInContent || temporaryImages.length > 0;
        if (mediaDataForPrompt.length > 0) {
            finalPrompt = await buildMultimodalPrompt(effectiveProvider, question, promptTemplate, customPrompts, currentAnswerContent, '', paperDescription, temporaryPrompt, '', temporaryImages);
            finalPrompt.unshift(...mediaDataForPrompt);
        } else if (hasImages && aiConfig.visionEnabled) {
            if (aiConfig.visionProvider && aiConfig.visionProvider !== 'main_model') {
                console.log(`[AI流程] 检测到图片，使用独立的视觉模型: ${aiConfig.visionProvider}`);
                showNotification('👁️ 正在调用独立视觉模型...', { type: 'info' });
                const visionConfig = {
                    provider: aiConfig.visionProvider,
                    endpoint: aiConfig.visionEndpoint,
                    apiKey: aiConfig.visionApiKey,
                    model: aiConfig.visionModel
                };
                const allImages = [...temporaryImages];
                for (const source of allContentSources) {
                    const parsedContent = await parseRichTextToMultimodalContent(source);
                    parsedContent.forEach(part => {
                        if (part.type === 'image_url') {
                            if (!allImages.some(img => img.image_url.url.substring(0, 50) === part.image_url.url.substring(0, 50))) {
                                allImages.push(part);
                            }
                        }
                    });
                }
                console.log(`[AI流程] 共找到 ${allImages.length} 张图片送往视觉模型处理。`);
                const visionPromptText = "你将收到多张图片。请按顺序为每一张图片提供详细的内容描述，并准确转录其中包含的所有文字。使用 '[图片1]', '[图片2]' 等标记来区分每一张图片的描述。";
                const multiImagePrompt = [{ type: 'text', text: visionPromptText }];
                allImages.forEach(image => {
                    multiImagePrompt.push(image);
                });
                console.log(`[AI流程] 将 ${allImages.length} 张图片打包成一个请求发送给视觉模型。`);
                const combinedDescriptions = await new Promise((res, rej) => {
                    dispatchAICall(visionConfig, multiImagePrompt, null, (fullText) => res(fullText), (err) => rej(err), signal);
                });
                imageDescriptions = combinedDescriptions;
                finalPrompt = await buildMultimodalPrompt(effectiveProvider, question, promptTemplate, customPrompts, currentAnswerContent, transcriptionText, paperDescription, temporaryPrompt, imageDescriptions, []);
                finalPrompt = finalPrompt.map(p => p.text || '').join('');
            } else {
                console.log('[AI流程] 检测到图片，使用主AI模型的视觉能力');
                finalPrompt = await buildMultimodalPrompt(effectiveProvider, question, promptTemplate, customPrompts, currentAnswerContent, transcriptionText, paperDescription, temporaryPrompt, '', temporaryImages);
            }
        } else {
            console.log('[AI流程] 无图片或未启用视觉，纯文本模式');
            finalPrompt = await buildMultimodalPrompt(effectiveProvider, question, promptTemplate, customPrompts, currentAnswerContent, transcriptionText, paperDescription, temporaryPrompt);
            finalPrompt = finalPrompt.map(p => p.text || '').join('');
        }
        console.log(`[AI Helper] 题 ${question.id} (${questionType}) | Provider: ${effectiveProvider} | Final Prompt:`, finalPrompt);
        return new Promise(async (resolve, reject) => {
            const handleInternalComplete = (content) => {
                if (typeof onComplete === 'function') onComplete(content);
                resolve({ aiResult: content });
            };
            const handleInternalError = (error) => reject(error);
            try {
                if (signal?.aborted) { reject(new DOMException('请求在发送前被中止', 'AbortError')); return; }
                await dispatchAICall(effectiveConfig, finalPrompt, onChunk, handleInternalComplete, handleInternalError, signal);
            } catch (error) {
                reject(error);
            }
        });
    }
    async function promptReport(question) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.7); z-index: 10001;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.3s ease; backdrop-filter: blur(5px);
        `;
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #ffffff; padding: 32px 40px; border-radius: 20px;
            width: 500px; max-width: 90%;
            box-shadow: 0 20px 40px rgba(0,0,0,0.15);
            transform: scale(0.95); opacity: 0;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
        `;
        const title = document.createElement('h2');
        title.innerHTML = `
            <svg t="1749847738422" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5662" width="24" height="24">
                <path d="M316.5 894.3c-3.1 0-5.8-0.3-8.1-0.8-11-2.7-16.6-8.9-19.2-13.6-7.1-12.6-2.4-27.7 1.7-41 1.7-5.6 5.3-17.1 4.2-20.3-0.1-0.1-0.3-0.2-0.7-0.4-66-31.5-121.4-77.1-160.3-131.8-40.4-56.8-61.7-121.9-61.7-188.4 0-50.1 11.8-98.6 35-144.3 22.3-43.9 54.2-83.3 94.8-117 82.9-69 192.9-107 309.8-107 24.8 0 49.7 1.7 73.9 5.2 8.2 1.2 13.9 8.8 12.7 17s-8.7 13.9-17 12.7c-22.9-3.2-46.3-4.9-69.7-4.9-55.6 0-109.6 9.1-160.3 26.9-48.9 17.2-92.7 41.8-130.4 73.1-76.7 63.8-119 148.5-119 238.3 0 60.2 19.4 119.3 56.1 171 35.9 50.6 87.4 92.8 148.8 122.1 11.7 5.6 18 16.2 17.9 29.8-0.1 9-3 18.1-5.7 26.9-1.5 4.9-4 12.7-4.1 16.5 8.8 1.2 47-9.4 69.9-15.7 37.1-10.3 60.4-16.5 72.7-15.2 17.8 1.9 35.9 2.9 54 2.9 55.6 0 109.6-9.1 160.3-26.9 48.9-17.2 92.7-41.8 130.4-73.1 76.7-63.8 119-148.5 119-238.3 0-45.6-10.8-89.8-32.1-131.5-20.7-40.5-50.4-76.8-88.2-108-17.9-14.8-37.6-28.2-58.4-40-5.9-3.3-12-6.6-18-9.6-2.5-1.3-4.3-2.2-5.8-3-3.3-1.7-4.7-2.4-10.3-4.9-7.6-3.3-11.2-12.1-7.9-19.7 3.3-7.6 12.1-11.2 19.7-7.9 6.4 2.7 8.6 3.8 12.4 5.8 1.4 0.7 3.1 1.6 5.4 2.8 6.5 3.3 13 6.8 19.3 10.3 22.4 12.6 43.5 27.1 62.7 43 41 33.8 73.3 73.3 95.8 117.5 23.5 45.9 35.4 94.8 35.4 145.1 0 50.1-11.8 98.6-35 144.3-22.3 43.9-54.2 83.3-94.8 117-82.9 69-192.9 107-309.8 107-19.1 0-38.4-1-57.3-3.1-7.4-0.8-39.9 8.3-61.5 14.3-39.1 11-62.3 16.9-76.6 16.9z" fill="#06275B" p-id="5663"></path><path d="M369.9 803.6c-4.7-24.5-20-44.6-43-55.6-54.3-26-99.6-63-131-107.1-30.9-43.5-47.3-93-47.3-143.2 0-87.7 48-150.4 88.2-187.5 54-49.8 128.2-85.5 203.6-97.8 23.1-3.8 46.8-5.7 70.5-5.7 61.9 0 123.8 13 179.1 37.6 52.4 23.4 99.5 60.3 132.5 103.9 34.6 45.7 52.9 97.4 52.9 149.5 0 76.3-37 148.6-104.1 203.5-33.4 27.3-72.4 48.8-115.9 63.9-45.4 15.7-93.6 23.7-143.3 23.7-16.4 0-33-0.9-49.1-2.7-2.8-0.3-5.7-0.5-8.7-0.5-18.8 0-41.9 6.1-81 17-1.2 0.4-2.3 0.7-3.4 1z" fill="#5097FF" p-id="5664"></path><path d="M628.2 158.1c5.9 1.4-2.8-0.9 3.1 0.7" fill="#FFFFFF" p-id="5665"></path><path d="M631.3 173.8c-1.3 0-2.7-0.2-4-0.5-0.1 0-0.2-0.1-0.3-0.1h-0.2c-0.4-0.1-1-0.2-2-0.5-8.1-1.9-13.1-10-11.1-18 1.8-7.8 9.4-12.7 17.2-11.3 0.7 0.1 1.5 0.2 2.3 0.4 0.5 0.1 1 0.3 1.4 0.4 0.2 0.1 0.5 0.1 0.8 0.2 8 2.2 12.7 10.5 10.5 18.5-2 6.5-8 10.9-14.6 10.9z" fill="#06275B" p-id="5666"></path><path d="M576.2 377.5c17.6 15.4 26.4 36.5 26.4 62.9 0 21.6-5.7 39.6-16.7 53.7-4 4.8-16.3 16.3-37 34.3-8.4 7-14.5 15-18.5 22.9-4.8 8.8-7 18.5-7 29v7.5h-47.1v-7.5c0-16.3 2.6-30.4 8.8-41.8 5.7-12.3 22.4-30.4 49.7-54.6l7.5-8.4c7.9-10.1 12.3-20.7 12.3-32.1 0-15.4-4.4-27.3-12.8-36.1-8.8-8.8-21.6-13.2-37.4-13.2-19.8 0-34.3 6.2-43.1 18.9-7.9 10.6-11.9 25.5-11.9 44.9h-46.2c0-32.1 9.2-57.2 27.7-75.7 18.5-18.9 44-28.2 76.6-28.2 28.2 0.2 51.1 7.7 68.7 23.5zM523 620.4c6.2 5.7 9.2 13.2 9.2 22.4s-3.5 16.7-9.7 22.9c-6.2 5.7-14.1 8.8-22.9 8.8s-16.7-3.1-22.9-9.2c-6.2-6.2-9.2-13.6-9.2-22.4 0-9.2 3.1-16.7 9.2-22.4 6.2-6.2 14.1-8.8 22.9-8.8 9.3-0.1 17.2 2.5 23.4 8.7z" fill="#06275B" p-id="5667"></path>
            </svg>
            举报/纠错
        `;
        title.style.cssText = `margin-top: 0; margin-bottom: 25px; text-align: center; color: #1f2937; font-size: 22px;`;
        const description = document.createElement('p');
        description.textContent = '请选择问题类型，并提供简要说明（可选）：';
        description.style.cssText = 'margin-bottom: 20px; color: #4b5569; text-align: center; font-size: 15px;';
        const tipsContainer = document.createElement('div');
        tipsContainer.style.cssText = `
            margin-bottom: 25px;
            padding: 15px 20px;
            background-color: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 12px;
            font-size: 13.5px;
            color: #0c4a6e;
            line-height: 1.6;
        `;
        tipsContainer.innerHTML = `
            <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #075985; display: flex; align-items: center;">
                <span style="margin-right: 8px; font-size: 18px;">💡</span>
                <strong>温馨提示</strong>
            </h4>
            <ul style="margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 8px;">如果答案显示为空，这是正常现象，说明暂时还没有热心用户贡献该题答案。<strong>这种情况无需反馈，请尝试 AI 辅助。</strong></li>
                <li>在反馈“答案错误”时，<strong>强烈建议在下方说明中附上你认为正确的答案</strong>，这将极大地帮助我修正题库！专业知识五花八门，作者也不是万能的哦~ 😉</li>
            </ul>
        `;
        const reportTypes = [
            { id: 'wrong_answer', text: '答案错误' },
            { id: 'format_error', text: '格式问题' },
            { id: 'spam_or_abuse', text: '违规内容' },
            { id: 'other', text: '其他问题' }
        ];
        let selectedType = '';
        const typeContainer = document.createElement('div');
        typeContainer.style.cssText = 'display: flex; justify-content: center; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;';
        reportTypes.forEach(type => {
            const btn = document.createElement('button');
            btn.textContent = type.text;
            btn.dataset.type = type.id;
            btn.style.cssText = `
                padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 8px;
                cursor: pointer; background-color: #f9fafb; color: #374151;
                font-weight: 500; transition: all 0.2s ease;
            `;
            btn.onclick = () => {
                selectedType = type.id;
                typeContainer.querySelectorAll('button').forEach(b => {
                    b.style.backgroundColor = '#f9fafb';
                    b.style.color = '#374151';
                    b.style.borderColor = '#d1d5db';
                });
                btn.style.backgroundColor = '#eef2ff';
                btn.style.color = '#4f46e5';
                btn.style.borderColor = '#6366f1';
            };
            typeContainer.appendChild(btn);
        });
        const commentTextarea = document.createElement('textarea');
        commentTextarea.placeholder = '请在此处详细说明问题（选填）...';
        commentTextarea.rows = 4;
        commentTextarea.style.cssText = `
            width: 100%; padding: 12px; border: 1px solid #d1d5db;
            border-radius: 10px; font-size: 14px; resize: vertical; margin-bottom: 25px;
            box-sizing: border-box; outline: none; transition: all 0.2s ease;
        `;
        commentTextarea.onfocus = () => {
            commentTextarea.style.borderColor = '#6366f1';
            commentTextarea.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)';
        };
        commentTextarea.onblur = () => {
            commentTextarea.style.borderColor = '#d1d5db';
            commentTextarea.style.boxShadow = 'none';
        };
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; justify-content: flex-end; gap: 12px;';
        const submitButton = document.createElement('button');
        submitButton.textContent = '提交反馈';
        submitButton.style.cssText = `
            padding: 10px 20px; background: #ef4444; color: white;
            border: none; border-radius: 8px; cursor: pointer;
            font-weight: 600; transition: all 0.2s ease;
        `;
        submitButton.onmouseover = () => { submitButton.style.backgroundColor = '#dc2626'; };
        submitButton.onmouseout = () => { submitButton.style.backgroundColor = '#ef4444'; };
        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.style.cssText = `
            padding: 10px 20px; background-color: #f3f4f6; color: #4b5563;
            border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer;
            font-weight: 500; transition: all 0.2s ease;
        `;
        cancelButton.onmouseover = () => { cancelButton.style.backgroundColor = '#e5e7eb'; };
        cancelButton.onmouseout = () => { cancelButton.style.backgroundColor = '#f3f4f6'; };
        modal.appendChild(title);
        modal.appendChild(description);
        modal.appendChild(tipsContainer);
        modal.appendChild(typeContainer);
        modal.appendChild(commentTextarea);
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(submitButton);
        modal.appendChild(buttonContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            modal.style.opacity = '1';
            modal.style.transform = 'scale(1)';
        });
        const closeModal = () => {
            modal.style.transform = 'scale(0.95)';
            modal.style.opacity = '0';
            overlay.style.opacity = '0';
            setTimeout(() => document.body.removeChild(overlay), 300);
        };
        cancelButton.onclick = closeModal;
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
        submitButton.onclick = async () => {
            if (!selectedType) {
                showNotification('请至少选择一个问题类型！', { type: 'warning' });
                return;
            }
            const contentHash = generateContentHash(question);
            if (!contentHash) {
                showNotification('无法为此题生成唯一标识，举报失败。', { type: 'error' });
                return;
            }
            submitButton.disabled = true;
            submitButton.textContent = '提交中...';
            submitButton.style.opacity = '0.7';
            submitButton.style.cursor = 'not-allowed';
            try {
                const response = await authedFetch('reportAnswer', {
                    content_hash: contentHash,
                    report_type: selectedType,
                    comment: commentTextarea.value.trim()
                });
                if (response.success) {
                    showNotification(response.message, { type: 'success' });
                    closeModal();
                } else {
                    throw new Error(response.error);
                }
            } catch (error) {
                showNotification(`举报失败: ${error.message}`, { type: 'error' });
                submitButton.disabled = false;
                submitButton.textContent = '提交反馈';
                submitButton.style.opacity = '1';
                submitButton.style.cursor = 'pointer';
            }
        };
    }
    function createReportButton(question) {
        const reportButton = document.createElement('button');
        reportButton.textContent = '答案有误？';
        reportButton.style.cssText = `
            background: none; border: none; color: #9ca3af;
            font-size: 13px; cursor: pointer; transition: color 0.2s;
        `;
        reportButton.onmouseover = () => { reportButton.style.color = '#ef4444'; };
        reportButton.onmouseout = () => { reportButton.style.color = '#9ca3af'; };
        reportButton.onclick = async () => {
            if (await checkAccountConsistency()) {
                promptReport(question);
            } else {
                console.warn("[操作中止] 因账号不一致，已取消举报操作。");
            }
        };
        const actionsContainer = document.createElement('div');
        actionsContainer.style.textAlign = 'right';
        actionsContainer.style.marginTop = '15px';
        actionsContainer.appendChild(reportButton);
        return actionsContainer;
    }
    function attachSttOnlyButtonListeners(container) {
        const buttons = container.querySelectorAll('[id^="stt-only-btn-"]');
        buttons.forEach(button => {
            if (button.dataset.listenerAttached) return;
            button.dataset.listenerAttached = 'true';
            button.onclick = async () => {
                const fileId = button.dataset.fileId;
                const resultContainer = container.querySelector(`#stt-result-container-${fileId}`);
                const aiConfig = JSON.parse(localStorage.getItem('aiConfig') || '{}');
                if (!aiConfig.sttEnabled) {
                    showNotification('请先在 AI 设置中启用 STT 功能。', { type: 'warning' });
                    return;
                }
                button.disabled = true;
                button.textContent = '🔄 转录中...';
                try {
                    const audioUrl = await getAudioUrl(fileId);
                    if (!audioUrl) throw new Error("无法获取音频URL");
                    const transcription = await callSttApi(audioUrl, aiConfig);
                    const pre = document.createElement('pre');
                    pre.textContent = transcription;
                    pre.style.cssText = `white-space: pre-wrap; word-wrap: break-word; margin: 0; font-size: 14px; color: #334155; line-height: 1.6;`;
                    resultContainer.innerHTML = '';
                    resultContainer.appendChild(pre);
                    resultContainer.style.display = 'block';
                    button.textContent = '✅ 转录完成';
                } catch (error) {
                    console.error('仅转录音频时失败:', error);
                    showNotification(`转录失败: ${error.message}`, { type: 'error' });
                    button.disabled = false;
                    button.textContent = '🎤 重新尝试转录';
                }
            };
        });
    }
    function attachVideoSttButtonListeners(container) {
        const buttons = container.querySelectorAll('[id^="video-stt-btn-"]');
        buttons.forEach(button => {
            if (button.dataset.listenerAttached) return;
            button.dataset.listenerAttached = 'true';
            button.onclick = async () => {
                const videoId = button.id.replace('video-stt-btn-', '');
                const videoUrl = button.dataset.videoUrl;
                const resultContainer = container.querySelector(`#video-stt-result-container-${videoId}`);
                const aiConfig = JSON.parse(localStorage.getItem('aiConfig') || '{}');
                if (!aiConfig.sttEnabled) {
                    showNotification('请先在 AI 设置中启用 STT 功能。', { type: 'warning' });
                    return;
                }
                button.disabled = true;
                button.innerHTML = '🔄 <span class="progress-text">处理中...</span>';
                const progressTextSpan = button.querySelector('.progress-text');
                const updateProgress = (progress, stage) => {
                    if (progressTextSpan) {
                        const percentage = (progress * 100).toFixed(0);
                        progressTextSpan.textContent = `${stage}... (${percentage}%)`;
                    }
                };
                try {
                    if (!videoUrl) throw new Error("无效的视频URL");
                    const audioBlob = await extractAndEncodeAudio(videoUrl, updateProgress);
                    if (progressTextSpan) progressTextSpan.textContent = '上传转录中...';
                    const transcription = await callSttApi(audioBlob, aiConfig);
                    const pre = document.createElement('pre');
                    pre.textContent = transcription;
                    pre.style.cssText = `white-space: pre-wrap; word-wrap: break-word; margin: 0; font-size: 14px; color: #334155; line-height: 1.6;`;
                    resultContainer.innerHTML = '';
                    resultContainer.appendChild(pre);
                    resultContainer.style.display = 'block';
                    button.textContent = '✅ 转录完成';
                } catch (error) {
                    console.error('视频音频转录失败:', error);
                    showNotification(`视频音频转录失败: ${error.message}`, { type: 'error' });
                    button.disabled = false;
                    button.innerHTML = '🎬 重新尝试转录';
                }
            };
        });
    }
    function questionHasAnswer(question) {
        if (!question) return false;
        const richTextIsEffectivelyEmpty = (content) => {
            if (!content || typeof content !== 'string') return true;
            if (content.trim() === '' || content === '{}') return true;
            try {
                const parsed = JSON.parse(content);
                if (parsed.blocks && Array.isArray(parsed.blocks)) {
                    if (parsed.blocks.length === 0) return true;
                    if (parsed.blocks.length === 1 && parsed.blocks[0].text === '') {
                        return parsed.blocks[0].type !== 'atomic';
                    }
                }
            } catch (e) { }
            return false;
        };
        switch (question.type) {
            case 1:
            case 2:
            case 5:
                return question.answer_items && question.answer_items.some(item => item.answer_checked === 2);
            case 4:
                return question.answer_items && question.answer_items.some(item => !richTextIsEffectivelyEmpty(item.answer));
            case 6:
            case 10:
                return question.answer_items && question.answer_items.length > 0 && !richTextIsEffectivelyEmpty(question.answer_items[0].answer);
            case 12:
                return question.answer_items && question.answer_items.every(item => item.answer !== null && item.answer !== undefined && item.answer !== '');
            case 13:
                return question.answer_items && question.answer_items.some(item => !item.is_target_opt && item.answer !== null && item.answer !== undefined && item.answer !== '');
            case 9:
                return question.subQuestions && question.subQuestions.some(subQ => questionHasAnswer(subQ));
            default:
                return false;
        }
    }
    function showAnswerEditor() {
        if (!document.getElementById('custom-checkbox-style')) {
            const style = document.createElement('style');
            style.id = 'custom-checkbox-style';
            style.textContent = `
                .batch-ai-checkbox-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    user-select: none;
                    padding: 4px;
                    border-radius: 6px;
                    transition: background-color 0.2s ease;
                }
                .batch-ai-checkbox-wrapper:hover {
                    background-color: #f3f4f6;
                }
                .batch-ai-checkbox-custom {
                    width: 18px;
                    height: 18px;
                    border: 2px solid #a5b4fc;
                    background-color: #fff;
                    border-radius: 5px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    flex-shrink: 0;
                }
                .batch-ai-checkbox-custom svg {
                    width: 14px;
                    height: 14px;
                    stroke: #fff;
                    stroke-width: 3;
                    opacity: 0;
                    transform: scale(0.5);
                    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .batch-ai-checkbox:checked + .batch-ai-checkbox-custom {
                    background-color: #4f46e5;
                    border-color: #4f46e5;
                    transform: scale(1.1);
                }
                .batch-ai-checkbox:checked + .batch-ai-checkbox-custom svg {
                    opacity: 1;
                    transform: scale(1);
                }
                .batch-ai-checkbox {
                    display: none;
                }
            `;
            document.head.appendChild(style);
        }
        const questionTypeStyles = {
            '1': { text: '单选题', bg: '#eef2ff', color: '#4338ca' },
            '2': { text: '多选题', bg: '#e0f2fe', color: '#0369a1' },
            '4': { text: '填空题', bg: '#f0fdf4', color: '#15803d' },
            '5': { text: '判断题', bg: '#fdf2f8', color: '#9d174d' },
            '6': { text: '简答题', bg: '#fffbeb', color: '#b45309' },
            '9': { text: '数组题', bg: '#f3f4f6', color: '#475569' },
            '10': { text: '编程题', bg: '#1f2937', color: '#e5e7eb' },
            '12': { text: '排序题', bg: '#f5f3ff', color: '#6d28d9' },
            '13': { text: '匹配题', bg: '#fefce8', color: '#a16207' },
            'default': { text: '未知', bg: '#f1f5f9', color: '#475569' }
        };
        sttCache = {};
        videoCache = {}
        let storedData = localStorage.getItem('answerData');
        if (!storedData) {
            showNotification('未找到存储的数据，请先点击"获取答案"按钮。', { type: 'error', keywords: ['存储', '答案', '获取'], animation: 'fadeSlide' });
            return;
        }
        let isContentModified = false;
        let answerData = JSON.parse(storedData);
        let overlay = document.createElement('div');
        let modalContainer = document.createElement('div');
        let resizeHandle = document.createElement('div');
        let dragHandle = document.createElement('div');
        let closeButton = document.createElement('button');
        let modalContentWrapper = document.createElement('div');
        let title = document.createElement('h2');
        let saveButton = document.createElement('button');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'transparent';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '9999';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease-in-out';
        modalContainer.id = 'modal-container';
        modalContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            z-index: 10000;
            width: 90%;
            max-width: 1500px;
            height: 85vh;
            min-width: 400px;
            background-color: #ffffff;
            border-radius: 20px;
            padding: 48px 32px 32px 32px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            opacity: 0;
            transition: opacity 0.3s ease;
            display: flex;
            flex-direction: column;
        `;
        resizeHandle.style.cssText = `
            position: absolute;
            right: 2px;
            bottom: 2px;
            width: 20px;
            height: 20px;
            cursor: nw-resize;
            border-radius: 0 0 18px 0;
            background: linear-gradient(135deg,
                transparent 25%,
                #e2e8f0 25%,
                #e2e8f0 37%,
                #6366f1 37%,
                #6366f1 50%,
                transparent 50%,
                transparent 62%,
                #6366f1 62%,
                #6366f1 75%,
                transparent 75%
            );
            opacity: 0.6;
        `;
        resizeHandle.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
            resizeHandle.style.transform = 'scale(1.1)';
        });
        resizeHandle.addEventListener('mouseleave', () => {
            resizeHandle.style.opacity = '0.6';
            resizeHandle.style.transform = 'scale(1)';
        });
        let isResizing = false;
        let originalWidth, originalHeight, originalX, originalY;
        const onResizeStart = (e) => {
            isResizing = true;
            const point = e.touches ? e.touches[0] : e;
            const rect = modalContainer.getBoundingClientRect();
            originalWidth = rect.width;
            originalHeight = rect.height;
            originalX = point.clientX;
            originalY = point.clientY;
            modalContainer.style.transform = 'none';
            modalContainer.style.top = rect.top + 'px';
            modalContainer.style.left = rect.left + 'px';
            e.preventDefault();
        };
        const onResizeMove = (e) => {
            if (!isResizing) return;
            const point = e.touches ? e.touches[0] : e;
            const newWidth = originalWidth + (point.clientX - originalX);
            const newHeight = originalHeight + (point.clientY - originalY);
            const minWidth = 400;
            const minHeight = 300;
            if (newWidth >= minWidth) {
                modalContainer.style.width = newWidth + 'px';
            }
            if (newHeight >= minHeight) {
                modalContainer.style.height = newHeight + 'px';
            }
        };
        const onResizeEnd = () => {
            isResizing = false;
        };
        resizeHandle.addEventListener('mousedown', onResizeStart, false);
        document.addEventListener('mousemove', onResizeMove, false);
        document.addEventListener('mouseup', onResizeEnd, false);
        resizeHandle.addEventListener('touchstart', onResizeStart, { passive: false });
        document.addEventListener('touchmove', onResizeMove, { passive: false });
        document.addEventListener('touchend', onResizeEnd, false);
        dragHandle.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 48px;
            cursor: move;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            background: linear-gradient(to right, rgba(243, 244, 246, 0.95), rgba(243, 244, 246, 0.5));
            border-radius: 20px 20px 0 0;
            user-select: none;
            transition: all 0.3s ease;
        `;
        dragHandle.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; color: #6b7280; font-size: 13px;">
                <svg width="16" height="16" viewBox="0 0 24 24" style="opacity: 0.6;">
                    <path d="M8 6a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM8 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM8 18a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM14 6a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM14 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM14 18a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM20 6a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM20 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM20 18a2 2 0 1 0-4 0 2 2 0 0 0 4 0z"
                        fill="currentColor"/>
                </svg>
                <span>点击此处拖动窗口</span>
            </div>
        `;
        dragHandle.onmouseover = () => {
            dragHandle.style.background = 'linear-gradient(to right, rgba(243, 244, 246, 1), rgba(243, 244, 246, 0.8))';
            dragHandle.style.transform = 'translateY(1px)';
        };
        dragHandle.onmouseout = () => {
            dragHandle.style.background = 'linear-gradient(to right, rgba(243, 244, 246, 0.95), rgba(243, 244, 246, 0.5))';
            dragHandle.style.transform = 'translateY(0)';
        };
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        function onDragStart(e) {
            if (e.target !== dragHandle) return;
            isDragging = true;
            const point = e.touches ? e.touches[0] : e;
            const rect = modalContainer.getBoundingClientRect();
            initialX = point.clientX - rect.left;
            initialY = point.clientY - rect.top;
            modalContainer.style.transition = 'none';
            modalContainer.style.transform = 'none';
            modalContainer.style.left = `${rect.left}px`;
            modalContainer.style.top = `${rect.top}px`;
        }
        function onDragMove(e) {
            if (!isDragging) return;
            e.preventDefault();
            const point = e.touches ? e.touches[0] : e;
            currentX = point.clientX - initialX;
            currentY = point.clientY - initialY;
            const maxX = window.innerWidth - modalContainer.offsetWidth;
            const maxY = window.innerHeight - modalContainer.offsetHeight;
            currentX = Math.min(Math.max(0, currentX), maxX);
            currentY = Math.min(Math.max(0, currentY), maxY);
            modalContainer.style.left = `${currentX}px`;
            modalContainer.style.top = `${currentY}px`;
        }
        function onDragEnd() {
            isDragging = false;
            modalContainer.style.transition = 'opacity 0.3s ease';
        }
        dragHandle.addEventListener('mousedown', onDragStart, false);
        dragHandle.addEventListener('touchstart', onDragStart, { passive: false });
        document.addEventListener('mousemove', onDragMove, false);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('mouseup', onDragEnd, false);
        document.addEventListener('touchend', onDragEnd, false);
        function cleanup() {
            dragHandle.removeEventListener('mousedown', onDragStart);
            dragHandle.removeEventListener('touchstart', onDragStart);
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('touchmove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchend', onDragEnd);
        }
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                cleanup();
                closeModal();
            }
        };
        modalContentWrapper.id = 'modal-content-wrapper';
        modalContentWrapper.style.cssText = `
            display: flex;
            gap: 20px;
            flex: 1;
            overflow: hidden;
        `;
        closeButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        closeButton.style.cssText = `
            position: absolute;
            top: 15px;
            right: 15px;
            background: #f3f4f6;
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            cursor: pointer;
            color: #6b7280;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.08);
        `;
        const closeModal = async (forceClose = false) => {
            if (isContentModified && !forceClose) {
                const confirmed = await showConfirmNotification(
                    '你有未保存的修改，确定要关闭吗？所有改动将会丢失。',
                    {
                        animation: 'scale',
                        title: '确认关闭',
                        confirmText: '仍要关闭',
                        cancelText: '取消'
                    }
                );
                if (!confirmed) {
                    showNotification('操作已取消。', { type: 'info' });
                    return;
                }
            }
            if (areAITasksRunning()) {
                const confirmed = await showConfirmNotification(
                    'AI 任务正在进行中。确定要关闭并中止所有 AI 请求吗？',
                    { animation: 'scale' }
                );
                if (!confirmed) {
                    showNotification('操作已取消，AI 任务将继续。', { type: 'info' });
                    return;
                }
                cancelAllAITasks();
                showNotification('所有 AI 任务已中止。', { type: 'warning' });
            }
            modalContainer.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
            modalContainer.style.transform = 'none';
            modalContainer.style.left = '50%';
            modalContainer.style.top = '50%';
            requestAnimationFrame(() => {
                overlay.style.opacity = '0';
                modalContainer.style.opacity = '0';
                modalContainer.style.transform = 'translate(-50%, -50%) scale(0.95)';
            });
            sttCache = {};
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                if (document.body.contains(modalContainer)) {
                    document.body.removeChild(modalContainer);
                }
                document.removeEventListener('keydown', handleEscapeKey);
            }, 400);
        };
        function createAIButton(targetInput, question) {
            let aiButton = document.createElement('button');
            aiButton.innerHTML = '<span class="icon">🤖</span><span class="text">AI 辅助</span>';
            aiButton.className = 'ai-assist-btn';
            aiButton.title = '使用 AI 生成答案建议';
            let isLoading = false;
            aiButton.abortController = null;
            aiButton.onclick = async () => {
                if (isLoading) {
                    if (aiButton.abortController) {
                        aiButton.abortController.abort();
                        console.log("AI 请求已被用户取消。");
                    }
                    return;
                }
                const aiConfig = { provider: 'default', ...JSON.parse(localStorage.getItem('aiConfig') || '{}') };
                const customPrompts = JSON.parse(localStorage.getItem('aiCustomPrompts') || '{}');
                const provider = aiConfig.provider || 'default';
                const abortController = new AbortController();
                aiButton.abortController = abortController;
                registerAIController(abortController);
                isLoading = true;
                aiButton.className = 'ai-assist-btn xiaoya-loading';
                aiButton.innerHTML = '<span class="icon">⏳</span><span class="text">取消</span>';
                aiButton.title = '点击取消生成';
                try {
                    const temporaryPrompt = document.getElementById('temporary-ai-prompt-textarea')?.value.trim() || '';
                    const result = await callAIForQuestion(question, targetInput, aiConfig, customPrompts, abortController.signal, temporaryPrompt);
                    if (result.skipped) {
                        showNotification(`题型 "${getQuestionType(question.type)}" 暂不支持 AI 辅助`, { type: 'warning' });
                    } else if (result.success !== false && !result.cancelled) {
                        showNotification(`AI (${provider === 'default' ? '小雅' : provider}) 已成功生成答案建议。`, { type: 'success', animation: 'scale' });
                    }
                } catch (error) {
                    if (error.name === 'AbortError') {
                        showNotification('AI 生成已取消', { type: 'warning', animation: 'scale' });
                    } else {
                        console.error('AI 请求失败 (来自 createAIButton):', error);
                        showNotification(`AI 生成失败 (${provider}): ${error.message}`, { type: 'error' });
                    }
                } finally {
                    isLoading = false;
                    aiButton.className = 'ai-assist-btn';
                    aiButton.innerHTML = '<span class="icon">🤖</span><span class="text">AI 辅助</span>';
                    aiButton.title = '使用 AI 生成答案建议';
                    if (aiButton.abortController) {
                        activeAIControllers.delete(aiButton.abortController);
                    }
                    aiButton.abortController = null;
                }
            };
            return aiButton;
        }
        async function callAIForQuestion(question, targetElement, aiConfig, customPrompts, signal = null, temporaryPrompt = '', notificationId = null) {
            if (signal?.aborted) {
                console.log(`[AI辅助] 题 ${question.id} 请求在 callAIForQuestion 开始前已取消`);
                return { cancelled: true };
            }
            const questionTypeNum = question.type;
            let originalContent = null;
            let thinkingContainer = null;
            let confidenceContainer = null;
            if (targetElement) {
                const subQuestionContainer = targetElement.closest('div[data-subquestion-id]');
                let parentContainer;
                if (subQuestionContainer) {
                    parentContainer = subQuestionContainer;
                    console.log(`[思维链容器] 已定位到子题目容器:`, subQuestionContainer);
                } else {
                    parentContainer = targetElement.closest('.question-editor-container');
                    console.log(`[思维链容器] 已定位到主题目容器:`, parentContainer);
                }
                if (!parentContainer) {
                    parentContainer = targetElement.parentElement || document.body;
                    console.warn(`[思维链容器] 未找到标准容器，回退至父元素。`);
                }
                thinkingContainer = parentContainer;
                confidenceContainer = parentContainer.querySelector(`#confidence-display-${question.id}`);
                if (confidenceContainer) confidenceContainer.innerHTML = '';
                if (questionTypeNum === 4) {
                    originalContent = Array.from(targetElement.querySelectorAll('input')).map(input => input.value);
                } else if (questionTypeNum === 6) {
                    originalContent = targetElement.innerHTML || '';
                } else if (questionTypeNum === 10) {
                    originalContent = targetElement.value || '';
                }
            }
            if (!thinkingContainer) {
                console.warn(`[AI辅助] 题 ${question.id}: 未找到 thinkingContainer`);
                thinkingContainer = document.body;
            }
            const thinkingHandler = new ThinkingHandler(thinkingContainer, {
                autoScrollEnabled: aiConfig.autoScrollEnabled === true
            });
            thinkingHandler.reset();
            let isFinalized = false;
            const onUpdateTarget = (contentToAdd) => {
                if (questionTypeNum === 4) return;
                requestAnimationFrame(() => {
                    if (!targetElement) return;
                    if (isFinalized) return;
                    if (questionTypeNum === 6) {
                        targetElement.appendChild(document.createTextNode(contentToAdd));
                        targetElement.scrollTop = targetElement.scrollHeight;
                    } else if (questionTypeNum === 10) {
                        targetElement.value += contentToAdd;
                        targetElement.scrollTop = targetElement.scrollHeight;
                    }
                    if (targetElement.dispatchEvent) {
                        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
            };
            const onFinalizeTarget = (finalContent) => {
                isFinalized = true;
                console.log(`[AI辅助] 正在应用AI结果到题目 ${question.id}`);
                const { answer, confidence } = parseAIResponseWithConfidence(finalContent);
                question.ai_confidence = confidence;
                if (confidenceContainer) {
                    confidenceContainer.innerHTML = '';
                    confidenceContainer.appendChild(createConfidenceStars(confidence));
                }
                let targetTocLink = null;
                if (question.parentQuestion) {
                    const parentIndex = answerData.findIndex(q => q.id === question.parentQuestion.id);
                    const subIndex = question.parentQuestion.subQuestions.findIndex(sq => sq.id === question.id);
                    if (parentIndex !== -1 && subIndex !== -1) {
                        const questionNumber = `${parentIndex + 1}.${subIndex + 1}`;
                        targetTocLink = tocLinks.find(link => link.textContent === questionNumber);
                    }
                } else {
                    const questionIndex = answerData.findIndex(q => q.id === question.id);
                    if (questionIndex !== -1) {
                        targetTocLink = tocLinks.find(link => link.textContent === (questionIndex + 1).toString());
                    }
                }
                if (targetTocLink) {
                    const tocItem = targetTocLink.parentElement;
                    const oldDot = tocItem.querySelector('span[style*="position: absolute"]');
                    if (oldDot) {
                        oldDot.remove();
                    }
                    if (confidence !== null) {
                        const confidenceDot = document.createElement('span');
                        const colors = { 1: '#ef4444', 2: '#f97316', 3: '#facc15', 4: '#84cc16', 5: '#22c55e' };
                        confidenceDot.style.cssText = `
                            position: absolute; top: 2px; right: 2px; width: 10px; height: 10px;
                            background-color: ${colors[confidence] || '#9ca3af'};
                            border-radius: 50%; border: 1.5px solid white; box-shadow: 0 0 3px rgba(0,0,0,0.3);
                            pointer-events: none; animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                        `;
                        tocItem.appendChild(confidenceDot);
                        if (!document.getElementById('pop-in-animation')) {
                            const style = document.createElement('style');
                            style.id = 'pop-in-animation';
                            style.textContent = `@keyframes popIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }`;
                            document.head.appendChild(style);
                        }
                    }
                    if (!targetTocLink.isActive) {
                        targetTocLink.style.backgroundColor = '#22c55e';
                        targetTocLink.style.color = '#ffffff';
                        targetTocLink.style.fontWeight = '700';
                        targetTocLink.title = '此题已有答案';
                    }
                }
                if (questionTypeNum === 4) {
                    if (!targetElement) return { success: false, reason: "Target element for fill-in-blanks not found" };
                    try {
                        let cleanedContent = answer.trim();
                        const codeBlockMatch = cleanedContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
                        if (codeBlockMatch) {
                            cleanedContent = codeBlockMatch[1].trim();
                        }
                        const arrayMatch = cleanedContent.match(/\[[\s\S]*\]/);
                        if (arrayMatch) {
                            cleanedContent = arrayMatch[0];
                        }
                        const answers = JSON.parse(cleanedContent);
                        if (!Array.isArray(answers)) {
                            throw new Error("AI返回的不是一个数组");
                        }
                        const inputs = targetElement.querySelectorAll('input');
                        inputs.forEach((input, index) => {
                            if (answers[index] !== undefined) {
                                input.value = answers[index];
                                input.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        });
                        return { success: true };
                    } catch (error) {
                        console.error(`[AI填空题] 解析或应用答案失败 (题 ${question.id}):`, error, "原始返回:", answer);
                        showNotification('AI返回的填空题答案格式错误，无法应用。请检查是否为JSON数组。', { type: 'error' });
                        return { success: false, reason: "JSON parsing failed or invalid format" };
                    }
                } else if (questionTypeNum === 1 || questionTypeNum === 2 || questionTypeNum === 5) {
                    if (!targetElement) {
                        console.error(`[AI辅助] 题 ${question.id}: 无法最终确定选项，因为 targetElement 为空`);
                        return { success: false, reason: "Target element for choices not found during finalization" };
                    }
                    const selectedLetters = answer.toUpperCase().replace(/[^A-Z,]/g, '').split(',').filter(l => l);
                    if (selectedLetters.length > 0) {
                        const optionLabels = targetElement.querySelectorAll('.xiaoya-option-labels-container label');
                        let changed = false;
                        question.answer_items.forEach(item => { item.answer_checked = 1; });
                        optionLabels.forEach((label) => {
                            const input = label.querySelector('input');
                            if (input) input.checked = false;
                            const customCheckbox = label.querySelector('span[style*="background-color"]');
                            if (customCheckbox) {
                                customCheckbox.style.backgroundColor = '#e5e7eb';
                                const toggleCircle = customCheckbox.firstChild;
                                if (toggleCircle) toggleCircle.style.left = '2px';
                                const icon = toggleCircle ? toggleCircle.firstChild : null;
                                if (icon) icon.innerHTML = '';
                            }
                        });
                        optionLabels.forEach((label, idx) => {
                            const currentLetter = String.fromCharCode(65 + idx);
                            if (selectedLetters.includes(currentLetter)) {
                                question.answer_items[idx].answer_checked = 2;
                                const input = label.querySelector('input');
                                if (input) {
                                    input.checked = true;
                                }
                                changed = true;
                                const customCheckbox = label.querySelector('span[style*="background-color"]');
                                if (customCheckbox) {
                                    customCheckbox.style.backgroundColor = '#6366f1';
                                    const toggleCircle = customCheckbox.firstChild;
                                    if (toggleCircle) toggleCircle.style.left = '22px';
                                    const icon = toggleCircle ? toggleCircle.firstChild : null;
                                    if (icon) icon.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                                }
                            }
                        });
                        if (!changed) {
                            console.warn(`[AI辅助] 题 ${question.id}: AI 未能识别出有效选项字母: ${answer}`);
                            return { success: false, reason: `AI 未识别有效选项: ${answer}` };
                        }
                        return { success: true };
                    } else {
                        console.warn(`[AI辅助] 题 ${question.id}: AI 未能识别出有效选项字母: ${answer}`);
                        return { success: false, reason: `AI 未识别有效选项: ${answer}` };
                    }
                } else if (questionTypeNum === 10 && targetElement) {
                    let code = answer.trim();
                    const codeBlockMatch = code.match(/```[\w]*\s*([\s\S]*?)\s*```/i);
                    if (codeBlockMatch) {
                        code = codeBlockMatch[1].trim();
                    }
                    targetElement.value = code;
                    if (question.program_setting) {
                        question.program_setting.code_answer = code;
                    } else {
                        question.program_setting = { code_answer: code };
                    }
                    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                    const codeEditor = targetElement.closest('.code-editor-wrapper');
                    if (codeEditor) {
                        const event = new Event('input', { bubbles: true });
                        targetElement.dispatchEvent(event);
                    }
                } else if ([6].includes(questionTypeNum) && targetElement) {
                    targetElement.innerHTML = answer.replace(/\n/g, '<br>');
                    updateAnswerWithContent(question, targetElement.innerHTML);
                    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                } else if (questionTypeNum === 12 && targetElement) {
                    try {
                        let cleanedContent = answer.trim();
                        const codeBlockMatch = cleanedContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
                        if (codeBlockMatch) {
                            cleanedContent = codeBlockMatch[1].trim();
                        }
                        const arrayMatch = cleanedContent.match(/\[[\s\S]*\]/);
                        if (arrayMatch) {
                            cleanedContent = arrayMatch[0];
                        }
                        const orderedLetters = JSON.parse(cleanedContent);
                        if (!Array.isArray(orderedLetters)) {
                            throw new Error("AI返回的不是一个数组");
                        }
                        const itemMap = new Map(question.answer_items.map((item, index) => {
                            return [String.fromCharCode(65 + index), { id: item.id, item: item }];
                        }));
                        const newSortedItems = orderedLetters.map(letter => itemMap.get(letter.toUpperCase())?.item).filter(Boolean);
                        if (newSortedItems.length !== question.answer_items.length) {
                            console.warn(`[AI排序题] AI返回的项数量与原始项数量不匹配。AI: ${newSortedItems.length}, 原始: ${question.answer_items.length}`);
                        }
                        newSortedItems.forEach((item, newIndex) => {
                            item.answer = (newIndex + 1).toString();
                        });
                        const currentUiItems = Array.from(targetElement.children);
                        const uiItemMap = new Map(currentUiItems.map(uiItem => {
                            const itemText = uiItem.querySelector('div[style*="flex: 1"]').textContent.trim();
                            return [itemText, uiItem];
                        }));
                        targetElement.innerHTML = '';
                        newSortedItems.forEach((sortedItemData, index) => {
                            const itemTextContent = parseRichTextToPlainText(sortedItemData.value).trim();
                            const correspondingUiItem = uiItemMap.get(itemTextContent);
                            if (correspondingUiItem) {
                                correspondingUiItem.querySelector('div[style*="width: 28px"]').textContent = index + 1;
                                correspondingUiItem.dataset.index = index;
                                targetElement.appendChild(correspondingUiItem);
                            } else {
                                console.error(`[AI排序题] 无法在现有UI中找到与数据匹配的项: "${itemTextContent}"`);
                            }
                        });
                    } catch (error) {
                        console.error(`[AI排序题] 解析或应用排序题答案失败 (题 ${question.id}):`, error, "原始返回:", answer);
                        showNotification('AI返回的排序结果格式错误，无法应用。', { type: 'error' });
                        return { success: false, reason: "JSON parsing failed or invalid format" };
                    }
                } else if (questionTypeNum === 13 && targetElement) {
                    try {
                        let cleanedContent = answer.trim();
                        const codeBlockMatch = cleanedContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
                        if (codeBlockMatch) {
                            cleanedContent = codeBlockMatch[1].trim();
                        }
                        const jsonMatch = cleanedContent.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
                        if (jsonMatch) {
                            cleanedContent = jsonMatch[0];
                        }
                        const matches = JSON.parse(cleanedContent);
                        const leftItems = question.answer_items.filter(item => !item.is_target_opt);
                        const rightItems = question.answer_items.filter(item => item.is_target_opt);
                        Object.entries(matches).forEach(([leftLetter, rightLetter]) => {
                            const leftIndex = leftLetter.toUpperCase().charCodeAt(0) - 65;
                            const rightIndex = rightLetter.toLowerCase().charCodeAt(0) - 97;
                            if (leftItems[leftIndex] && rightItems[rightIndex]) {
                                leftItems[leftIndex].answer = rightItems[rightIndex].id;
                            }
                        });
                        const matchItemsUI = targetElement.querySelectorAll('div[data-matching-item="true"]');
                        matchItemsUI.forEach((matchItemUI, index) => {
                            if (typeof matchItemUI._updateUI === 'function') {
                                matchItemUI._updateUI();
                            }
                        });
                        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                    } catch (error) {
                        console.error(`[AI匹配题] 解析或应用匹配题答案失败:`, error, "原始返回:", answer);
                        showNotification('AI返回的匹配结果格式错误。', { type: 'error' });
                        return { success: false, reason: "JSON parsing failed" };
                    }
                }
                return { success: true };
            };
            const streamProcessor = new StreamProcessor(targetElement, questionTypeNum, thinkingHandler, onUpdateTarget, onFinalizeTarget);
            streamProcessor.reset();
            if (targetElement) {
                if (questionTypeNum === 4) {
                    targetElement.querySelectorAll('input').forEach(input => input.value = '');
                } else if (questionTypeNum === 6) {
                    targetElement.textContent = '';
                } else if (questionTypeNum === 10) {
                    targetElement.value = '';
                }
            }
            try {
                const result = await _getAIAnswer(
                    question,
                    aiConfig,
                    customPrompts,
                    temporaryPrompt,
                    originalContent,
                    streamProcessor.processChunk.bind(streamProcessor),
                    () => streamProcessor.processComplete(),
                    signal,
                    notificationId
                );
                if (signal?.aborted) {
                    console.log(`[AI辅助] 题 ${question.id} 请求在 _getAIAnswer 返回后检测到取消`);
                    return { cancelled: true };
                }
                if (result.cancelled) {
                    console.log(`[AI辅助] 题 ${question.id} 在 _getAIAnswer 中被取消`);
                    return { cancelled: true };
                }
                if (result.skipped) {
                    return { skipped: true, reason: result.reason };
                }
                isContentModified = true;
                const finalizationOutcome = onFinalizeTarget(result.aiResult);
                return finalizationOutcome || { success: true };
            } catch (error) {
                console.error(`[AI辅助] 题 ${question.id} (${getQuestionType(question.type)}) 处理失败:`, error);
                showNotification(`AI辅助失败: ${error.message}`, { type: 'error', animation: 'scale' });
                thinkingHandler.hide();
                const restoreOriginalContent = () => {
                    if (originalContent !== null && targetElement) {
                        console.log(`[AI辅助] 恢复问题 ${question.id} 的原始内容 (因错误或取消)`);
                        if (questionTypeNum === 4) {
                            targetElement.querySelectorAll('input').forEach((input, index) => {
                                if (originalContent[index] !== undefined) {
                                    input.value = originalContent[index];
                                    input.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            });
                        } else if (questionTypeNum === 6) {
                            targetElement.innerHTML = originalContent;
                        } else if (questionTypeNum === 10) {
                            targetElement.value = originalContent;
                        }
                        if (targetElement.dispatchEvent) {
                            targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                };
                restoreOriginalContent();
                if (error.name === 'AbortError') {
                    console.log(`[AI辅助] 题 ${question.id} 请求被取消 (捕获于 callAIForQuestion catch)`);
                    return { cancelled: true };
                }
                return { success: false, reason: error.message };
            }
        }
        async function startAIAssistAll(answerData, modalContainer) {
            const confirmed = await showConfirmNotification(
                '即将为所有勾选的题目触发 AI 请求。请确保你的 AI 设置正确。是否继续？',
                { animation: 'scale' }
            );
            if (!confirmed) return;
            if (currentBatchAbortController) {
                console.log("[AI辅助] 检测到正在进行的任务，正在取消...");
                currentBatchAbortController.abort();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            currentBatchAbortController = new AbortController();
            registerAIController(currentBatchAbortController);
            const signal = currentBatchAbortController.signal;
            const aiConfig = { provider: 'default', ...JSON.parse(localStorage.getItem('aiConfig') || '{}') };
            const provider = aiConfig.provider;
            if (provider !== 'default' && (!aiConfig.endpoint || !aiConfig.apiKey)) {
                showNotification('请先在 AI 设置中配置 API 地址和 Key', { type: 'error' });
                currentBatchAbortController = null;
                return;
            }
            const temporaryPrompt = document.getElementById('temporary-ai-prompt-textarea')?.value.trim() || '';
            if (temporaryPrompt) {
                showNotification('批量任务将使用你提供的临时提示词。', { type: 'info' });
            }
            const concurrencyValue = parseInt(aiConfig.batchConcurrency, 10) || 1;
            const customPrompts = JSON.parse(localStorage.getItem('aiCustomPrompts') || '{}');
            const BATCH_NOTIFICATION_ID = `batch-ai-process-${Date.now()}`;
            let runningTaskCount = 0;
            let processedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;
            let cancelledCount = 0;
            let stopProcessing = false;
            const questionElements = modalContainer.querySelectorAll('.question-editor-container');
            const questionsToProcess = [];
            const individualAiButtons = [];
            questionElements.forEach((qContainer, index) => {
                const question = answerData[index];
                if (!question) return;
                if (question.type === 9 && question.subQuestions) {
                    const subQuestionContainers = qContainer.querySelectorAll('div[data-subquestion-id]');
                    subQuestionContainers.forEach(subContainer => {
                        const checkbox = subContainer.querySelector('.batch-ai-checkbox');
                        if (checkbox && checkbox.checked) {
                            const subIndex = parseInt(subContainer.dataset.subquestionIndex, 10);
                            const subQuestion = question.subQuestions[subIndex];
                            if (!subQuestion) return;
                            let subTargetElement = null;
                            const subTypeNum = subQuestion.type;
                            if ([1, 2, 5].includes(subTypeNum)) {
                                subTargetElement = subContainer.querySelector('div[style*="display: grid"]');
                            } else if (subTypeNum === 4) {
                                subTargetElement = subContainer.querySelector('input[id^="blank-input-"]')?.closest('div[style*="display: flex; flex-direction: column;"]');
                            } else if (subTypeNum === 6) {
                                subTargetElement = subContainer.querySelector('div[contenteditable="true"]');
                            } else if (subTypeNum === 10) {
                                subTargetElement = subContainer.querySelector('textarea');
                            }
                            if (subTargetElement) {
                                questionsToProcess.push({ question: subQuestion, element: subTargetElement });
                            }
                        }
                    });
                } else {
                    const checkbox = qContainer.querySelector('.batch-ai-checkbox');
                    if (checkbox && checkbox.checked) {
                        let targetElement = null;
                        const questionTypeNum = question.type;
                        if ([1, 2, 5].includes(questionTypeNum)) {
                            targetElement = qContainer.querySelector('div[style*="display: grid"]');
                        } else if (questionTypeNum === 4) {
                            targetElement = qContainer.querySelector('input[id^="blank-input-"]')?.closest('div[style*="display: flex; flex-direction: column;"]');
                        } else if (questionTypeNum === 6) {
                            targetElement = qContainer.querySelector('div[contenteditable="true"]');
                        } else if (questionTypeNum === 10) {
                            targetElement = qContainer.querySelector('textarea');
                        } else if (questionTypeNum === 12) {
                            targetElement = qContainer.querySelector('div[data-sortable-container="true"]');
                        } else if (questionTypeNum === 13) {
                            targetElement = qContainer.querySelector('div[data-matching-container="true"]');
                        }
                        if (targetElement) {
                            questionsToProcess.push({ question, element: targetElement });
                        }
                    }
                }
            });
            modalContainer.querySelectorAll('.ai-assist-btn').forEach(aiButton => {
                aiButton.disabled = true;
                aiButton.style.opacity = '0.5';
                aiButton.style.cursor = 'not-allowed';
                individualAiButtons.push(aiButton);
            });
            const totalQuestions = questionsToProcess.length;
            if (totalQuestions === 0) {
                showNotification('没有选中任何要处理的题目。', { type: 'warning' });
                if (currentBatchAbortController) {
                    activeAIControllers.delete(currentBatchAbortController);
                    currentBatchAbortController = null;
                }
                return;
            }
            const progress = createProgressBar();
            progress.show();
            const aiAssistAllButton = modalContainer.querySelector('#ai-assist-all-btn');
            const saveButton = modalContainer.querySelector('button[style*="background-color: #4f46e5;"]');
            const originalButtonHTML = aiAssistAllButton.innerHTML;
            aiAssistAllButton.disabled = true;
            aiAssistAllButton.style.opacity = '0.6';
            aiAssistAllButton.style.cursor = 'not-allowed';
            aiAssistAllButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 6px; animation: spin 1s linear infinite;">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                处理中...
            `;
            if (!document.getElementById('spin-animation-style')) {
                const style = document.createElement('style');
                style.id = 'spin-animation-style';
                document.head.appendChild(style);
            }
            const cancelButton = document.createElement('button');
            cancelButton.textContent = '取消处理';
            cancelButton.style.cssText = `
                width: 100%; margin-bottom: 15px; padding: 12px 24px; font-size: 16px; border: none;
                border-radius: 12px; background-color: #ef4444; color: white; cursor: pointer;
                transition: all 0.3s ease; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.2);
            `;
            cancelButton.onclick = () => {
                stopProcessing = true;
                if (currentBatchAbortController) {
                    console.log('[AI辅助] 请求取消，发送 abort 信号...');
                    currentBatchAbortController.abort();
                } else {
                    console.log('[AI辅助] 请求取消，但没有进行中的批量任务。');
                }
                showNotification('AI 批量处理取消中...', { type: 'warning' });
                cancelButton.disabled = true;
                cancelButton.style.opacity = '0.6';
                cancelButton.style.cursor = 'not-allowed';
            };
            if (saveButton && saveButton.parentNode) {
                saveButton.parentNode.insertBefore(cancelButton, saveButton);
            } else {
                modalContainer.appendChild(cancelButton);
            }
            try {
                if (concurrencyValue <= 1) {
                    progress.update(0, totalQuestions, `开始顺序处理`);
                    aiAssistAllButton.innerHTML = `...顺序处理中...`;
                    for (let i = 0; i < totalQuestions; i++) {
                        if (stopProcessing || signal.aborted) {
                            showNotification('手动停止处理成功。', { type: 'warning' });
                            cancelledCount = totalQuestions - (processedCount + skippedCount + errorCount);
                            break;
                        }
                        const { question, element } = questionsToProcess[i];
                        if (aiConfig.autoScrollEnabled && element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                        const questionType = getQuestionType(question.type);
                        const currentProgress = i + 1;
                        progress.update(currentProgress, totalQuestions, `[顺序] 处理 ${questionType}`);
                        try {
                            const result = await callAIForQuestion(question, element, aiConfig, customPrompts, signal, temporaryPrompt, BATCH_NOTIFICATION_ID);
                            if (result.cancelled) {
                                cancelledCount++;
                                console.log(`[顺序] 问题 ${i + 1} 已取消`);
                            } else if (result.skipped) {
                                console.warn(`[顺序] callAIForQuestion 内部跳过了问题 ${i + 1}: ${result.reason}`);
                                errorCount++;
                            } else if (result.success === false) {
                                errorCount++;
                                console.error(`[顺序] 处理问题 ${i + 1} 失败: ${result.reason}`);
                            } else {
                                processedCount++;
                            }
                        } catch (error) {
                            if (error.name === 'AbortError') {
                                cancelledCount++;
                                console.log(`[顺序] 问题 ${i + 1} 请求被取消 (捕获于 startAIAssistAll loop catch)`);
                            } else {
                                errorCount++;
                                console.error(`[顺序] 处理问题 ${i + 1} 时发生严重错误:`, error);
                            }
                        }
                        const requestInterval = parseInt(aiConfig.requestInterval, 10) || 200;
                        if (requestInterval > 0 && !signal.aborted) {
                            await new Promise(resolve => setTimeout(resolve, requestInterval));
                        }
                    }
                } else {
                    progress.update(0, totalQuestions, `开始并发处理`);
                    aiAssistAllButton.innerHTML = `...并发处理中... (并发: 0/${concurrencyValue})`;
                    const queue = [...questionsToProcess];
                    let running = 0;
                    let resolveCompletion;
                    const completionPromise = new Promise(resolve => {
                        resolveCompletion = resolve;
                    });
                    const processNext = async () => {
                        while (running < concurrencyValue && queue.length > 0) {
                            if (stopProcessing || signal.aborted) return;
                            const task = queue.shift();
                            const completedCount = processedCount + errorCount + cancelledCount;
                            const { question, element } = task;
                            if (aiConfig.autoScrollEnabled && element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                            const questionType = getQuestionType(question.type);
                            running++;
                            progress.update(completedCount, totalQuestions, `[并发] 处理 ${questionType}`);
                            aiAssistAllButton.innerHTML = `...并发处理中... (并发: ${running}/${concurrencyValue})`;
                            function handleResult(result) {
                                if (result.cancelled) cancelledCount++;
                                else if (result.skipped) errorCount++;
                                else if (result.success === false) errorCount++;
                                else processedCount++;
                            }
                            function handleError(error) {
                                if (error.name === 'AbortError') cancelledCount++;
                                else errorCount++;
                            }
                            function handleFinally() {
                                running--;
                                const finalCompleted = processedCount + errorCount + cancelledCount;
                                progress.update(finalCompleted, totalQuestions, `[并发] 处理完成`);
                                aiAssistAllButton.innerHTML = `...并发处理中... (并发: ${running}/${concurrencyValue})`;
                                if (queue.length === 0 && running === 0) {
                                    if (resolveCompletion) resolveCompletion();
                                } else if (!stopProcessing && !signal.aborted) {
                                    processNext();
                                } else if (resolveCompletion) {
                                    resolveCompletion();
                                }
                            }
                            callAIForQuestion(question, element, aiConfig, customPrompts, signal, temporaryPrompt, BATCH_NOTIFICATION_ID)
                                .then(handleResult)
                                .catch(handleError)
                                .finally(handleFinally);
                        }
                    };
                    const initialTasks = Math.min(concurrencyValue, queue.length);
                    for (let i = 0; i < initialTasks; i++) {
                        if (signal.aborted) break;
                        processNext();
                    }
                    if (initialTasks === 0 && queue.length === 0) {
                        resolveCompletion();
                    }
                    await completionPromise;
                    if (stopProcessing || signal.aborted) {
                        cancelledCount = totalQuestions - (processedCount + errorCount);
                    }
                }
            } catch (e) {
                console.error("AI 批量处理主逻辑出错:", e);
                showNotification("AI 批量处理过程中发生意外错误。", { type: 'error' });
                errorCount = totalQuestions - processedCount - skippedCount - cancelledCount;
            } finally {
                progress.hide();
                aiAssistAllButton.disabled = false;
                aiAssistAllButton.style.opacity = '1';
                aiAssistAllButton.style.cursor = 'pointer';
                aiAssistAllButton.innerHTML = originalButtonHTML;
                if (cancelButton.parentNode) {
                    cancelButton.parentNode.removeChild(cancelButton);
                }
                individualAiButtons.forEach(btn => {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                });
                showNotification(`批量处理完成`, { id: BATCH_NOTIFICATION_ID, type: 'success', duration: 1000 });
                const finalProcessed = processedCount;
                const finalSkipped = skippedCount;
                const finalCancelled = cancelledCount;
                const finalError = errorCount;
                let summaryMessage = `AI 批量处理完成：成功 ${finalProcessed} 个`;
                if (finalSkipped > 0) summaryMessage += `，跳过 ${finalSkipped} 个`;
                if (finalCancelled > 0) summaryMessage += `，取消 ${finalCancelled} 个`;
                if (finalError > 0) summaryMessage += `，失败 ${finalError} 个`;
                summaryMessage += '。请检查结果。';
                showNotification(summaryMessage, {
                    type: finalError > 0 ? 'warning' : (finalCancelled > 0 ? 'info' : 'success'),
                    duration: 8000,
                    keywords: ['批量处理', '完成', '成功', '跳过', '取消', '失败']
                });
                if (currentBatchAbortController && !currentBatchAbortController.signal.aborted) {
                    activeAIControllers.delete(currentBatchAbortController);
                }
                currentBatchAbortController = null;
            }
        }
        async function handleChoiceQuestion(question, container) {
            let optionsContainer = document.createElement('div');
            optionsContainer.className = 'xiaoya-option-labels-container';
            optionsContainer.style.display = 'grid';
            optionsContainer.style.gap = '12px';
            const stats = question.statistics;
            let totalOptionVotes = 0;
            if (stats && stats.options) {
                totalOptionVotes = stats.options.reduce((sum, opt) => sum + opt.count, 0);
            }
            for (const [idx, item] of question.answer_items.entries()) {
                let optionLabel = document.createElement('label');
                optionLabel.style.cssText = `
                    display: flex;
                    align-items: center;
                    padding: 20px;
                    background-color: #ffffff;
                    border-radius: 16px;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    border: 2px solid #f1f5f9;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
                    overflow: hidden;
                    min-height: 60px;
                `;
                optionLabel.onmouseover = () => {
                    optionLabel.style.borderColor = '#c7d2fe';
                    optionLabel.style.transform = 'translateY(-2px)';
                    optionLabel.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.08)';
                };
                optionLabel.onmouseout = () => {
                    optionLabel.style.borderColor = '#f1f5f9';
                    optionLabel.style.transform = 'translateY(0)';
                    optionLabel.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)';
                };
                const stats = question.statistics;
                let percentage = 0;
                let count = 0;
                if (stats && stats.totalRespondents > 0) {
                    const optionStat = stats.options.find(opt => opt.id === item.id);
                    if (optionStat) {
                        count = optionStat.count;
                        if (totalOptionVotes > 0) {
                            percentage = (count / totalOptionVotes) * 100;
                        }
                    }
                }
                if (stats) {
                    const isCorrectAnswer = item.answer_checked === 2;
                    const statsBarContainer = document.createElement('div');
                    statsBarContainer.style.cssText = `
                        position: absolute;
                        left: 0;
                        top: 0;
                        height: 100%;
                        width: 100%;
                        background-color: transparent;
                        z-index: 0;
                    `;
                    const statsBarFill = document.createElement('div');
                    statsBarFill.style.cssText = `
                        height: 100%;
                        width: ${Math.max(percentage, 2)}%;
                        background: ${isCorrectAnswer
                            ? 'linear-gradient(90deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.15) 100%)'
                            : 'linear-gradient(90deg, rgba(148, 163, 184, 0.05) 0%, rgba(148, 163, 184, 0.12) 100%)'
                        };
                        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
                        border-radius: 16px;
                    `;
                    const statsText = document.createElement('div');
                    statsText.innerHTML = `
                        <span class="count">${count}</span>
                        <span class="percentage">${percentage.toFixed(1)}%</span>
                    `;
                    statsText.style.cssText = `
                        position: absolute;
                        right: 20px;
                        top: 50%;
                        transform: translateY(-50%);
                        display: flex;
                        flex-direction: column;
                        align-items: flex-end;
                        z-index: 2;
                        font-family: Microsoft YaHei;
                    `;
                    if (!document.querySelector('#choice-stats-styles')) {
                        const style = document.createElement('style');
                        style.id = 'choice-stats-styles';
                        style.textContent = `
                            .count {
                                font-size: 11px;
                                font-weight: 500;
                                color: #64748b;
                                line-height: 1.2;
                            }
                            .percentage {
                                font-size: 14px;
                                font-weight: 700;
                                color: ${isCorrectAnswer ? '#059669' : '#475569'};
                                line-height: 1.2;
                            }
                        `;
                        document.head.appendChild(style);
                    }
                    statsBarContainer.appendChild(statsBarFill);
                    optionLabel.appendChild(statsBarContainer);
                    optionLabel.appendChild(statsText);
                }
                let optionContentWrapper = document.createElement('div');
                optionContentWrapper.style.cssText = `
                    display: flex;
                    align-items: center;
                    position: relative;
                    z-index: 1;
                    width: 100%;
                    padding-right: ${stats ? '50px' : '0px'};
                `;
                let optionInput = document.createElement('input');
                optionInput.type = question.type === 2 ? 'checkbox' : 'radio';
                optionInput.name = `question_${question.id}`;
                optionInput.value = item.id;
                optionInput.checked = item.answer_checked === 2;
                optionInput.style.display = 'none';
                let customCheckbox = document.createElement('span');
                customCheckbox.style.cssText = `
                    width: 48px;
                    height: 28px;
                    background-color: ${optionInput.checked ? '#6366f1' : '#e5e7eb'};
                    border-radius: 28px;
                    position: relative;
                    margin-right: 20px;
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: ${optionInput.checked
                        ? '0 4px 12px rgba(99, 102, 241, 0.3)'
                        : '0 2px 6px rgba(0, 0, 0, 0.08)'
                    };
                    flex-shrink: 0;
                `;
                let toggleCircle = document.createElement('span');
                toggleCircle.style.cssText = `
                    width: 24px;
                    height: 24px;
                    background-color: #ffffff;
                    border-radius: 50%;
                    position: absolute;
                    top: 2px;
                    left: ${optionInput.checked ? '22px' : '2px'};
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
                    transform: ${optionInput.checked ? 'scale(1.05)' : 'scale(1)'};
                `;
                let icon = document.createElement('span');
                icon.style.cssText = `
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    transition: all 0.3s ease;
                    color: #6366f1;
                `;
                icon.innerHTML = optionInput.checked ?
                    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' :
                    '';
                toggleCircle.appendChild(icon);
                customCheckbox.appendChild(toggleCircle);
                optionLabel.onclick = () => {
                    isContentModified = true;
                    if (question.type !== 2) {
                        question.answer_items.forEach(answerItem => {
                            answerItem.answer_checked = 1;
                        });
                        item.answer_checked = 2;
                        let siblingInputs = optionsContainer.querySelectorAll(`input[name="question_${question.id}"]`);
                        siblingInputs.forEach(sibling => {
                            const siblingLabel = sibling.closest('label');
                            const siblingToggle = siblingLabel.querySelector('span[style*="background-color"]');
                            const siblingCircle = siblingToggle.firstChild;
                            const siblingIcon = siblingCircle.firstChild;
                            sibling.checked = false;
                            siblingToggle.style.backgroundColor = '#e5e7eb';
                            siblingToggle.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.08)';
                            siblingCircle.style.left = '2px';
                            siblingCircle.style.transform = 'scale(1)';
                            siblingIcon.innerHTML = '';
                        });
                        optionInput.checked = true;
                    } else {
                        optionInput.checked = !optionInput.checked;
                        item.answer_checked = optionInput.checked ? 2 : 1;
                    }
                    if (optionInput.checked) {
                        customCheckbox.style.backgroundColor = '#6366f1';
                        customCheckbox.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.3)';
                        toggleCircle.style.left = '22px';
                        toggleCircle.style.transform = 'scale(1.05)';
                        icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    } else {
                        customCheckbox.style.backgroundColor = '#e5e7eb';
                        customCheckbox.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.08)';
                        toggleCircle.style.left = '2px';
                        toggleCircle.style.transform = 'scale(1)';
                        icon.innerHTML = '';
                    }
                };
                let optionText = document.createElement('span');
                if (question.type === 5) {
                    optionText.textContent = idx === 0 ? '正确' : '错误';
                } else {
                    await setRichTextContent(optionText, item.value);
                }
                optionText.style.cssText = `
                    color: #1f2937;
                    flex: 1;
                    font-size: 16px;
                    font-weight: 500;
                    line-height: 1.5;
                    word-break: break-word;
                `;
                optionContentWrapper.appendChild(optionInput);
                optionContentWrapper.appendChild(customCheckbox);
                optionContentWrapper.appendChild(optionText);
                optionLabel.appendChild(optionContentWrapper);
                optionsContainer.appendChild(optionLabel);
            }
            container.appendChild(optionsContainer);
            return optionsContainer;
        }
        function handleFillInBlankQuestion(question, container, createAIButton) {
            const fillContainer = document.createElement('div');
            fillContainer.style.cssText = 'display: flex; flex-direction: column; gap: 15px; margin-top: 10px;';
            question.answer_items.forEach((item, index) => {
                const blankGroup = document.createElement('div');
                blankGroup.style.display = 'flex';
                blankGroup.style.alignItems = 'center';
                blankGroup.style.gap = '10px';
                const label = document.createElement('label');
                label.textContent = `空 ${index + 1}:`;
                label.style.fontWeight = '600';
                label.style.color = '#4f46e5';
                label.style.minWidth = '50px';
                label.htmlFor = `blank-input-${item.id}`;
                const input = document.createElement('input');
                input.type = 'text';
                input.id = `blank-input-${item.id}`;
                input.value = parseRichTextToPlainText(item.answer);
                input.style.cssText = `
                    flex-grow: 1;
                    padding: 10px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 14px;
                    transition: all 0.2s ease;
                    outline: none;
                `;
                input.onfocus = () => {
                    input.style.borderColor = '#6366f1';
                    input.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)';
                };
                input.onblur = () => {
                    input.style.borderColor = '#d1d5db';
                    input.style.boxShadow = 'none';
                };
                input.oninput = () => {
                    isContentModified = true;
                    const newText = input.value;
                    item.answer = JSON.stringify({
                        blocks: [{
                            key: `ans-${item.id}`,
                            text: newText,
                            type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}
                        }],
                        entityMap: {}
                    });
                };
                blankGroup.appendChild(label);
                blankGroup.appendChild(input);
                fillContainer.appendChild(blankGroup);
            });
            const aiButtonContainer = document.createElement('div');
            aiButtonContainer.style.display = 'flex';
            aiButtonContainer.style.gap = '10px';
            aiButtonContainer.style.textAlign = 'right';
            aiButtonContainer.style.marginTop = '10px';
            aiButtonContainer.style.marginBottom = '10px';
            const aiButton = createAIButton(fillContainer, question);
            if (aiButton) {
                aiButtonContainer.appendChild(aiButton);
                fillContainer.appendChild(aiButtonContainer);
            }
            container.appendChild(fillContainer);
            return fillContainer;
        }
        async function handleTextQuestion(question, container, createAIButton) {
            let inputContainer = document.createElement('div');
            inputContainer.style.position = 'relative';
            inputContainer.style.width = '100%';
            inputContainer.style.marginTop = '8px';
            inputContainer.style.paddingBottom = '40px';
            let answerInput = document.createElement('div');
            answerInput.contentEditable = true;
            answerInput.style.width = '100%';
            answerInput.style.minHeight = '160px';
            answerInput.style.maxHeight = '400px';
            answerInput.style.padding = '16px';
            answerInput.style.paddingTop = '24px';
            answerInput.style.border = '1px solid #e5e7eb';
            answerInput.style.borderRadius = '12px';
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
            answerInput.style.resize = 'vertical';
            answerInput.style.whiteSpace = 'pre-wrap';
            answerInput.style.wordBreak = 'break-word';
            const mathPreviewContainer = document.createElement('div');
            mathPreviewContainer.style.cssText = `
                margin-top: 48px;
                padding: 16px;
                border-radius: 12px;
                border: 1px dashed #c7d2fe;
                background-color: #f5f3ff;
                display: none;
            `;
            const mathPreviewHeader = document.createElement('div');
            mathPreviewHeader.textContent = '公式渲染预览';
            mathPreviewHeader.style.cssText = 'font-weight: 600; color: #4f46e5; margin-bottom: 8px; font-size: 14px;';
            const mathPreviewContent = document.createElement('div');
            mathPreviewContent.style.cssText = 'color: #1f2937; line-height: 1.6; font-size: 14px;';
            mathPreviewContainer.appendChild(mathPreviewHeader);
            mathPreviewContainer.appendChild(mathPreviewContent);
            let buttonContainer = document.createElement('div');
            buttonContainer.style.position = 'absolute';
            buttonContainer.style.bottom = '-5px';
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '12px';
            buttonContainer.style.alignItems = 'center';
            buttonContainer.style.width = '100%';
            buttonContainer.style.justifyContent = 'center';
            buttonContainer.style.zIndex = '10';
            let imageUploadButton = null;
            let fileInput = null;
            if (question.type !== 4) {
                imageUploadButton = document.createElement('button');
                imageUploadButton.innerHTML = '<span class="icon">🖼️</span><span class="text">插入图片</span>';
                imageUploadButton.className = 'image-upload-btn';
                imageUploadButton.title = '插入图片到答案中';
                fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.style.display = 'none';
                inputContainer.appendChild(fileInput);
                imageUploadButton.onclick = (e) => {
                    e.preventDefault();
                    fileInput.click();
                };
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (!file.type.startsWith('image/')) {
                        showNotification('请选择图片文件', {
                            type: 'error',
                            keywords: ['图片'],
                            animation: 'scale'
                        });
                        return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                        showNotification('图片大小不能超过5MB', {
                            type: 'error',
                            keywords: ['图片', '大小'],
                            animation: 'scale'
                        });
                        return;
                    }
                    try {
                        imageUploadButton.disabled = true;
                        imageUploadButton.className = 'image-upload-btn xiaoya-loading';
                        imageUploadButton.innerHTML = '<span class="icon">🔄</span><span class="text">上传中...</span>';
                        const imageUrl = await uploadImage(file);
                        if (imageUrl) {
                            insertImageToEditor(answerInput, imageUrl);
                            answerInput.dispatchEvent(new Event('input', { bubbles: true }));
                            showNotification('图片上传成功', {
                                type: 'success',
                                keywords: ['图片', '上传', '成功'],
                                animation: 'scale'
                            });
                        } else {
                            throw new Error('图片上传失败');
                        }
                    } catch (error) {
                        console.error('图片上传失败:', error);
                        showNotification(`图片上传失败: ${error.message}`, {
                            type: 'error',
                            keywords: ['图片', '上传', '失败'],
                            animation: 'scale'
                        });
                    } finally {
                        imageUploadButton.disabled = false;
                        imageUploadButton.className = 'image-upload-btn';
                        imageUploadButton.innerHTML = '<span class="icon">🖼️</span><span class="text">插入图片</span>';
                        fileInput.value = '';
                    }
                };
            }
            let charCount = document.createElement('div');
            charCount.className = 'char-count';
            charCount.style.pointerEvents = 'none';
            answerInput.onfocus = () => {
                answerInput.style.borderColor = '#6366f1';
                answerInput.style.backgroundColor = '#ffffff';
                answerInput.style.boxShadow = '0 4px 6px rgba(99, 102, 241, 0.1)';
                charCount.classList.add('active');
                const scrollPos = window.scrollY;
                setTimeout(() => {
                    window.scrollTo(0, scrollPos);
                }, 10);
            };
            answerInput.onblur = () => {
                answerInput.style.borderColor = '#e5e7eb';
                answerInput.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                charCount.classList.remove('active');
            };
            const updateMathPreview = () => {
                const html = answerInput.innerHTML;
                if (!html || !MATH_CONTENT_REGEX.test(html)) {
                    mathPreviewContainer.style.display = 'none';
                    mathPreviewContent.innerHTML = '';
                    return;
                }
                mathPreviewContainer.style.display = 'block';
                mathPreviewContent.innerHTML = html;
                applyMathRendering(mathPreviewContent);
            };
            answerInput.oninput = () => {
                isContentModified = true;
                let textLength = answerInput.textContent.length;
                charCount.textContent = `${textLength} 个字符`;
                updateAnswerWithContent(question, answerInput.innerHTML);
                updateMathPreview();
            };
            const answerFragments = [];
            for (const item of question.answer_items || []) {
                if (!item) continue;
                try {
                    const parsedHtml = await parseRichTextContentAsync(item.answer);
                    if (parsedHtml) {
                        answerFragments.push(parsedHtml.trim());
                    }
                } catch (error) {
                    console.warn('[富文本解析] 解析主观题答案时出错，使用原始内容回退。', error);
                    if (item.answer) {
                        answerFragments.push(escapeHtml(String(item.answer)).replace(/\n/g, '<br>'));
                    }
                }
            }
            answerInput.innerHTML = answerFragments.join('<br><br>').trim();
            let initialTextLength = answerInput.textContent.length;
            charCount.textContent = `${initialTextLength} 个字符`;
            let decorativeLine = document.createElement('div');
            decorativeLine.style.position = 'absolute';
            decorativeLine.style.left = '16px';
            decorativeLine.style.right = '16px';
            decorativeLine.style.bottom = '40px';
            decorativeLine.style.height = '1px';
            decorativeLine.style.background = 'linear-gradient(to right, #e5e7eb 50%, transparent)';
            decorativeLine.style.opacity = '0.5';
            if (imageUploadButton) {
                buttonContainer.appendChild(imageUploadButton);
            }
            if (createAIButton) {
                let aiButton = createAIButton(answerInput, question);
                buttonContainer.appendChild(aiButton);
            }
            const quarkButton = document.createElement('button');
            quarkButton.className = 'quark-search-btn';
            quarkButton.innerHTML = `
                <span class="icon">🔍</span>
                <span>夸克搜题</span>
            `;
            quarkButton.onclick = async () => {
                quarkButton.disabled = true;
                const originalContent = quarkButton.innerHTML;
                quarkButton.innerHTML = `
                    <span class="icon" style="display: inline-block; animation: spin 1s linear infinite;">🌐️</span>
                    <span>搜题中...</span>
                `;
                try {
                    const results = await QuarkSearchManager.search(container, question);
                    if (results && results.length > 0) {
                        displayQuarkResults(container, question, results);
                    }
                } finally {
                    quarkButton.disabled = false;
                    quarkButton.innerHTML = originalContent;
                }
            };
            buttonContainer.appendChild(quarkButton);
            buttonContainer.appendChild(charCount);
            inputContainer.appendChild(answerInput);
            inputContainer.appendChild(buttonContainer);
            inputContainer.appendChild(decorativeLine);
            inputContainer.appendChild(mathPreviewContainer);
            updateMathPreview();
            let thinkingProcessDiv = document.createElement('div');
            thinkingProcessDiv.className = 'ai-thinking-process';
            thinkingProcessDiv.style.marginTop = '15px';
            thinkingProcessDiv.style.display = 'none';
            inputContainer.appendChild(thinkingProcessDiv);
            container.appendChild(inputContainer);
            return answerInput;
        }
        closeButton.onmouseover = () => {
            closeButton.style.backgroundColor = '#e5e7eb';
            closeButton.style.transform = 'rotate(90deg)';
            closeButton.style.color = '#000';
            closeButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.12)';
        };
        closeButton.onmouseout = () => {
            closeButton.style.backgroundColor = '#f3f4f6';
            closeButton.style.transform = 'rotate(0deg)';
            closeButton.style.color = '#6b7280';
            closeButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.08)';
        };
        closeButton.onclick = (e) => {
            e.stopPropagation();
            cleanup();
            closeModal();
        };
        title.style.cssText = `
            margin: 20px 0 28px 0;
            color: #111827;
            font-size: 24px;
            font-weight: 600;
            text-align: center;
        `;
        title.textContent = '查看/编辑答案';
        saveButton.style.cssText = `
            width: 100%;
            margin-bottom: 24px;
            padding: 12px 24px;
            font-size: 16px;
            border: none;
            border-radius: 12px;
            background-color: #4f46e5;
            color: #ffffff;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.1), 0 2px 4px -1px rgba(79, 70, 229, 0.06);
        `;
        saveButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 6px;">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            保存修改
        `;
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
        saveButton.title = '保存修改后的答案到本地存储';
        let aiAssistAllButton = document.createElement('button');
        aiAssistAllButton.id = 'ai-assist-all-btn';
        aiAssistAllButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 6px;">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
            </svg>
            AI 批量处理
        `;
        aiAssistAllButton.style.cssText = `
            width: 100%;
            margin-bottom: 15px;
            padding: 12px 24px;
            font-size: 16px;
            border: none;
            border-radius: 12px;
            background: #10b981;
            color: #ffffff;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2), 0 2px 4px -1px rgba(16, 185, 129, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        aiAssistAllButton.title = '使用 AI 尝试完成所有勾选的题目（消耗 Token 较多）';
        aiAssistAllButton.onmouseover = () => {
            aiAssistAllButton.style.background = '#059669';
            aiAssistAllButton.style.transform = 'translateY(-1px)';
            aiAssistAllButton.style.boxShadow = '0 6px 8px -1px rgba(16, 185, 129, 0.2), 0 4px 6px -1px rgba(16, 185, 129, 0.1)';
        };
        aiAssistAllButton.onmouseout = () => {
            aiAssistAllButton.style.background = '#10b981';
            aiAssistAllButton.style.transform = 'translateY(0)';
            aiAssistAllButton.style.boxShadow = '0 4px 6px -1px rgba(16, 185, 129, 0.2), 0 2px 4px -1px rgba(16, 185, 129, 0.1)';
        };
        aiAssistAllButton.onclick = () => {
            startAIAssistAll(answerData, modalContainer);
        };
        saveButton.onclick = () => {
            answerData.forEach(question => {
                if (question.subQuestions && Array.isArray(question.subQuestions)) {
                    question.subQuestions.forEach(subQuestion => {
                        if (subQuestion.parentQuestion) {
                            delete subQuestion.parentQuestion;
                        }
                    });
                }
            });
            localStorage.setItem('answerData', JSON.stringify(answerData));
            showNotification('答案已保存，旧答案已被替换', { type: 'success', keywords: ['答案', '保存', '替换'], animation: 'scale' });
            closeModal(true);
        };
        let tocContainer = document.createElement('div');
        tocContainer.id = 'toc-container';
        tocContainer.style.cssText = `
            width: 230px;
            position: sticky;
            max-height: 680px;
            overflow-y: auto;
            padding: 16px;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            background: #f9fafb;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
        `;
        tocContainer.addEventListener('mouseenter', () => {
            tocContainer.style.borderColor = '#d1d5db';
            tocContainer.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
        });
        tocContainer.addEventListener('mouseleave', () => {
            tocContainer.style.borderColor = '#e5e7eb';
            tocContainer.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        });
        let tocTitle = document.createElement('h3');
        tocTitle.textContent = '目录';
        tocTitle.style.cssText = `
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 12px;
            color: #111827;
        `;
        let tocList = document.createElement('ul');
        tocList.style.cssText = `
            list-style: none;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        `;
        let tocLinks = [];
        let questionContainers = [];
        const updateTocLinkStyle = (tocLink, isActive) => {
            if (!tocLink) return;
            const questionIndex = parseInt(tocLink.dataset.questionIndex, 10);
            const subquestionIndex = tocLink.dataset.subquestionIndex !== undefined ? parseInt(tocLink.dataset.subquestionIndex, 10) : -1;
            const question = answerData[questionIndex];
            if (!question) return;
            const itemToStyle = subquestionIndex !== -1 ? question.subQuestions[subquestionIndex] : question;
            if (!itemToStyle) return;
            const hasAnswer = questionHasAnswer(itemToStyle);
            tocLink.isActive = isActive;
            if (isActive) {
                tocLink.style.backgroundColor = '#6366f1';
                tocLink.style.color = '#ffffff';
                tocLink.style.fontWeight = '700';
                tocLink.style.transform = 'scale(1.05)';
                tocLink.style.boxShadow = '0 4px 6px -1px rgba(99, 102, 241, 0.1)';
            } else {
                if (hasAnswer) {
                    tocLink.style.backgroundColor = '#22c55e';
                    tocLink.style.color = '#ffffff';
                    tocLink.style.fontWeight = '700';
                } else {
                    tocLink.style.backgroundColor = '#f3f4f6';
                    tocLink.style.color = '#1f2937';
                    tocLink.style.fontWeight = '600';
                }
                tocLink.style.transform = 'scale(1)';
                tocLink.style.boxShadow = 'none';
            }
        };
        answerData.forEach((question, index) => {
            if (question.type === 9 && question.subQuestions && question.subQuestions.length > 0) {
                question.subQuestions.forEach((subQuestion, subIndex) => {
                    const tocItem = document.createElement('li');
                    tocItem.style.position = 'relative';
                    const tocLink = document.createElement('a');
                    const questionNumber = `${index + 1}.${subIndex + 1}`;
                    tocLink.textContent = questionNumber;
                    tocLink.href = `#subquestion_${question.id}_${subQuestion.id}`;
                    tocLink.dataset.questionIndex = index;
                    tocLink.dataset.subquestionIndex = subIndex;
                    const hasAnswer = questionHasAnswer(subQuestion);
                    tocLink.style.cssText = `
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 40px;
                        height: 40px;
                        border-radius: 8px;
                        text-decoration: none;
                        transition: all 0.2s ease;
                        font-size: 14px;
                    `;
                    if (hasAnswer) {
                        tocLink.style.backgroundColor = '#22c55e';
                        tocLink.style.color = '#ffffff';
                        tocLink.style.fontWeight = '700';
                        tocLink.title = '此子题已有答案';
                    } else {
                        tocLink.style.backgroundColor = '#f3f4f6';
                        tocLink.style.color = '#1f2937';
                        tocLink.style.fontWeight = '600';
                    }
                    tocLink.isActive = false;
                    tocLink.onmouseover = () => { if (!tocLink.isActive) { tocLink.style.backgroundColor = questionHasAnswer(subQuestion) ? '#16a34a' : '#e5e7eb'; } };
                    tocLink.onmouseout = () => { updateTocLinkStyle(tocLink, tocLink.isActive); };
                    tocLink.onclick = (e) => {
                        e.preventDefault();
                        let targetSubQuestion = document.querySelector(`div[data-subquestion-id="${subQuestion.id}"]`);
                        if (targetSubQuestion) {
                            targetSubQuestion.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    };
                    tocItem.appendChild(tocLink);
                    if (subQuestion.ai_confidence !== undefined && subQuestion.ai_confidence !== null) {
                        const confidenceDot = document.createElement('span');
                        const colors = { 1: '#ef4444', 2: '#f97316', 3: '#facc15', 4: '#84cc16', 5: '#22c55e' };
                        confidenceDot.style.cssText = `
                            position: absolute; top: 2px; right: 2px; width: 10px; height: 10px;
                            background-color: ${colors[subQuestion.ai_confidence] || '#9ca3af'};
                            border-radius: 50%; border: 1.5px solid white; box-shadow: 0 0 3px rgba(0,0,0,0.3);
                            pointer-events: none;
                        `;
                        tocItem.appendChild(confidenceDot);
                    }
                    tocList.appendChild(tocItem);
                    tocLinks.push(tocLink);
                });
            } else {
                const tocItem = document.createElement('li');
                tocItem.style.position = 'relative';
                const tocLink = document.createElement('a');
                tocLink.textContent = `${index + 1}`;
                tocLink.href = `#question_${index}`;
                tocLink.dataset.questionIndex = index;
                const hasAnswer = questionHasAnswer(question);
                tocLink.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 40px;
                    height: 40px;
                    border-radius: 8px;
                    text-decoration: none;
                    transition: all 0.2s ease;
                `;
                if (hasAnswer) {
                    tocLink.style.backgroundColor = '#22c55e';
                    tocLink.style.color = '#ffffff';
                    tocLink.style.fontWeight = '700';
                    tocLink.title = '此题已有答案';
                } else {
                    tocLink.style.backgroundColor = '#f3f4f6';
                    tocLink.style.color = '#1f2937';
                    tocLink.style.fontWeight = '600';
                }
                tocLink.isActive = false;
                tocLink.onmouseover = () => { if (!tocLink.isActive) { tocLink.style.backgroundColor = questionHasAnswer(question) ? '#16a34a' : '#e5e7eb'; } };
                tocLink.onmouseout = () => { updateTocLinkStyle(tocLink, tocLink.isActive); };
                tocLink.onclick = (e) => {
                    e.preventDefault();
                    let targetQuestion = document.getElementById(`question_${index}`);
                    if (targetQuestion) {
                        targetQuestion.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                };
                tocItem.appendChild(tocLink);
                if (question.ai_confidence !== undefined && question.ai_confidence !== null) {
                    const confidenceDot = document.createElement('span');
                    const colors = { 1: '#ef4444', 2: '#f97316', 3: '#facc15', 4: '#84cc16', 5: '#22c55e' };
                    confidenceDot.style.cssText = `
                        position: absolute; top: 2px; right: 2px; width: 10px; height: 10px;
                        background-color: ${colors[question.ai_confidence] || '#9ca3af'};
                        border-radius: 50%; border: 1.5px solid white; box-shadow: 0 0 3px rgba(0,0,0,0.3);
                        pointer-events: none;
                    `;
                    tocItem.appendChild(confidenceDot);
                }
                tocList.appendChild(tocItem);
                tocLinks.push(tocLink);
            }
        });
        tocContainer.appendChild(tocTitle);
        tocContainer.appendChild(tocList);
        const selectionControls = document.createElement('div');
        selectionControls.style.cssText = `
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        const selectionTitle = document.createElement('h4');
        selectionTitle.textContent = '批量选择工具';
        selectionTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 15px; color: #374151; font-weight: 600;';
        selectionControls.appendChild(selectionTitle);
        const buttonGroup = document.createElement('div');
        buttonGroup.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';
        const btnSelectAll = document.createElement('button');
        btnSelectAll.textContent = '全选';
        const btnSelectNone = document.createElement('button');
        btnSelectNone.textContent = '全不选';
        const btnSelectUnanswered = document.createElement('button');
        btnSelectUnanswered.textContent = '仅选择无答案';
        [btnSelectAll, btnSelectNone, btnSelectUnanswered].forEach(btn => {
            btn.style.cssText = `
                padding: 6px 10px;
                font-size: 13px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                background-color: #fff;
                color: #4b5569;
                cursor: pointer;
                transition: all 0.2s ease;
                flex-grow: 1;
            `;
            btn.onmouseover = () => { btn.style.backgroundColor = '#f3f4f6'; btn.style.borderColor = '#a5b4fc'; };
            btn.onmouseout = () => { btn.style.backgroundColor = '#fff'; btn.style.borderColor = '#d1d5db'; };
        });
        btnSelectUnanswered.style.cssText += 'background-color: #eef2ff; color: #4f46e5; border-color: #c7d2fe; width: 100%;';
        btnSelectUnanswered.onmouseover = () => { btnSelectUnanswered.style.backgroundColor = '#e0e7ff'; };
        btnSelectUnanswered.onmouseout = () => { btnSelectUnanswered.style.backgroundColor = '#eef2ff'; };
        btnSelectAll.onclick = () => {
            modalContainer.querySelectorAll('.batch-ai-checkbox').forEach(cb => cb.checked = true);
        };
        btnSelectNone.onclick = () => {
            modalContainer.querySelectorAll('.batch-ai-checkbox').forEach(cb => cb.checked = false);
        };
        btnSelectUnanswered.onclick = () => {
            modalContainer.querySelectorAll('.question-editor-container, div[data-subquestion-id]').forEach(container => {
                const checkbox = container.querySelector('.batch-ai-checkbox');
                if (checkbox) {
                    checkbox.checked = container.dataset.hasAnswer === 'false';
                }
            });
        };
        buttonGroup.appendChild(btnSelectAll);
        buttonGroup.appendChild(btnSelectNone);
        selectionControls.appendChild(buttonGroup);
        selectionControls.appendChild(btnSelectUnanswered);
        tocContainer.appendChild(selectionControls);
        let content = document.createElement('div');
        content.style.cssText = `
            flex: 1;
            display: grid;
            gap: 20px;
            overflow-y: auto;
            padding-right: 16px;
        `;
        const renderTemporaryPromptUI = () => {
            const aiConfig = JSON.parse(localStorage.getItem('aiConfig') || '{}');
            const isVisionEnabled = aiConfig.visionEnabled === true;
            const promptContainer = document.createElement('div');
            promptContainer.id = 'temporary-prompt-container';
            promptContainer.style.cssText = `
                margin-bottom: 25px;
                border-radius: 16px;
                border: 1px dashed #a5b4fc;
                background-color: #fafaff;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
            `;
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.style.cssText = `
                padding: 16px 20px;
                font-size: 16px;
                font-weight: 600;
                color: #4338ca;
                cursor: pointer;
                list-style: none;
                display: flex;
                align-items: center;
                transition: background-color 0.2s ease;
            `;
            summary.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 12px; transition: transform 0.3s ease;">
                    <path d="M9 18l6-6-6-6"/>
                </svg>
                ✍️ 临时AI提示词 (对当前作业生效)
            `;
            const summaryArrow = summary.querySelector('svg');
            details.addEventListener('toggle', () => {
                summaryArrow.style.transform = details.open ? 'rotate(90deg)' : 'rotate(0deg)';
            });
            const promptContent = document.createElement('div');
            promptContent.style.cssText = `
                padding: 0 20px 20px 20px;
                border-top: 1px solid #ddd6fe;
                color: #374151;
            `;
            const description = document.createElement('p');
            description.textContent = '在此处输入补充信息或特定指令（如解题思路、关键公式等），AI在处理本页所有题目时都会参考。';
            description.style.cssText = 'font-size: 14px; color: #6b7280; margin-top: 15px; margin-bottom: 10px; line-height: 1.6;';
            const textarea = document.createElement('textarea');
            textarea.id = 'temporary-ai-prompt-textarea';
            textarea.rows = 4;
            textarea.placeholder = '例如：听力原文如下...，请根据内容回答后续问题。';
            textarea.style.cssText = `
                width: 100%;
                padding: 12px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                font-size: 14px;
                resize: vertical;
                box-sizing: border-box;
                outline: none;
                transition: all 0.2s ease;
                margin-bottom: 15px;
            `;
            textarea.onfocus = () => { textarea.style.borderColor = '#6366f1'; textarea.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)'; };
            textarea.onblur = () => { textarea.style.borderColor = '#d1d5db'; textarea.style.boxShadow = 'none'; };
            promptContent.appendChild(description);
            promptContent.appendChild(textarea);
            if (isVisionEnabled) {
                const imageUploadArea = document.createElement('div');
                imageUploadArea.id = 'temp-prompt-image-upload';
                imageUploadArea.style.cssText = `
                    border: 2px dashed #c7d2fe;
                    border-radius: 12px;
                    padding: 20px;
                    text-align: center;
                    color: #6b7280;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    background-color: #ffffff;
                `;
                imageUploadArea.innerHTML = `
                    <div style="font-weight: 600; color: #4f46e5; margin-bottom: 8px; display: flex; align-items: center; justify-content: center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 8px; opacity: 0.8;">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        上传补充图片
                    </div>
                    <div>点击选择文件，或直接粘贴图片 (Ctrl+V)</div>
                `;
                const imagePreviewContainer = document.createElement('div');
                imagePreviewContainer.id = 'temp-prompt-image-preview';
                imagePreviewContainer.style.cssText = 'margin-top: 15px; display: flex; flex-wrap: wrap; gap: 10px;';
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.multiple = true;
                fileInput.style.display = 'none';
                imageUploadArea.onclick = () => fileInput.click();
                const handleFiles = (files) => {
                    const aiConfig = JSON.parse(localStorage.getItem('aiConfig') || '{}');
                    if (!aiConfig.visionEnabled) {
                        showNotification('请先在AI设置中启用图像处理功能，才能上传图片。', { type: 'warning' });
                        return;
                    }
                    for (const file of files) {
                        if (file.type.startsWith('image/')) {
                            createImagePreview(file);
                        }
                    }
                };
                fileInput.onchange = (e) => handleFiles(e.target.files);
                imageUploadArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    imageUploadArea.style.backgroundColor = '#eef2ff';
                    imageUploadArea.style.borderColor = '#818cf8';
                });
                imageUploadArea.addEventListener('dragleave', (e) => {
                    e.preventDefault();
                    imageUploadArea.style.backgroundColor = '#ffffff';
                    imageUploadArea.style.borderColor = '#c7d2fe';
                });
                imageUploadArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    imageUploadArea.style.backgroundColor = '#ffffff';
                    imageUploadArea.style.borderColor = '#c7d2fe';
                    handleFiles(e.dataTransfer.files);
                });
                textarea.addEventListener('paste', (e) => {
                    handleFiles(e.clipboardData.files);
                });
                const createImagePreview = (file) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const previewWrapper = document.createElement('div');
                        previewWrapper.style.cssText = 'position: relative; width: 100px; height: 100px;';
                        const img = document.createElement('img');
                        img.src = e.target.result;
                        img.dataset.base64 = e.target.result;
                        img.style.cssText = `
                            width: 100%; height: 100%; object-fit: cover; border-radius: 8px;
                            border: 1px solid #ddd6fe; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        `;
                        const removeBtn = document.createElement('button');
                        removeBtn.innerHTML = '×';
                        removeBtn.style.cssText = `
                            position: absolute; top: -5px; right: -5px; width: 22px; height: 22px;
                            background-color: #ef4444; color: white; border: 2px solid white;
                            border-radius: 50%; cursor: pointer; display: flex; align-items: center;
                            justify-content: center; font-size: 16px; font-weight: bold; line-height: 1;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                        `;
                        removeBtn.onclick = () => previewWrapper.remove();
                        previewWrapper.appendChild(img);
                        previewWrapper.appendChild(removeBtn);
                        imagePreviewContainer.appendChild(previewWrapper);
                    };
                    reader.readAsDataURL(file);
                };
                promptContent.appendChild(imageUploadArea);
                promptContent.appendChild(fileInput);
                promptContent.appendChild(imagePreviewContainer);
            }
            details.appendChild(summary);
            details.appendChild(promptContent);
            promptContainer.appendChild(details);
            const descriptionContainer = content.querySelector('#paper-description-container');
            if (descriptionContainer) {
                descriptionContainer.insertAdjacentElement('afterend', promptContainer);
            } else {
                content.prepend(promptContainer);
            }
        };
        const renderQuestions = async () => {
            for (const [index, question] of answerData.entries()) {
                const questionContainer = document.createElement('div');
                questionContainer.id = `question_${index}`;
                questionContainer.className = 'question-editor-container';
                questionContainer.dataset.contentHash = generateContentHash(question);
                questionContainer.style.padding = '24px';
                questionContainer.style.backgroundColor = '#ffffff';
                questionContainer.style.borderRadius = '16px';
                questionContainer.style.border = '1px solid #e5e7eb';
                questionContainer.style.transition = 'box-shadow 0.3s ease, margin-top 0.3s ease';
                questionContainer.style.marginTop = '0';
                questionContainer.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)';
                questionContainer.dataset.hasAnswer = questionHasAnswer(question);
                const titleWrapper = document.createElement('div');
                titleWrapper.style.marginBottom = '12px';
                const headerLine = document.createElement('div');
                headerLine.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 8px;
                `;
                const batchAiCheckboxWrapper = document.createElement('label');
                batchAiCheckboxWrapper.className = 'batch-ai-checkbox-wrapper';
                batchAiCheckboxWrapper.title = '勾选此项，以将该题目加入到“AI批量处理”任务中';
                const batchAiCheckbox = document.createElement('input');
                batchAiCheckbox.type = 'checkbox';
                batchAiCheckbox.className = 'batch-ai-checkbox';
                batchAiCheckbox.checked = !questionHasAnswer(question);
                const customCheckbox = document.createElement('span');
                customCheckbox.className = 'batch-ai-checkbox-custom';
                customCheckbox.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                batchAiCheckboxWrapper.appendChild(batchAiCheckbox);
                batchAiCheckboxWrapper.appendChild(customCheckbox);
                headerLine.appendChild(batchAiCheckboxWrapper);
                const titleHeader = document.createElement('div');
                titleHeader.style.cssText = 'display: flex; align-items: center; white-space: nowrap; flex-shrink: 0;';
                const typeInfo = questionTypeStyles[question.type] || questionTypeStyles['default'];
                titleHeader.innerHTML = `
                    <strong style="font-size: 16px; color: #111827;">题目 ${index + 1}：</strong>
                    <span style="
                        display: inline-block;
                        vertical-align: middle;
                        margin: 0 8px;
                        padding: 3px 10px;
                        font-size: 13px;
                        font-weight: 600;
                        border-radius: 12px;
                        background-color: ${typeInfo.bg};
                        color: ${typeInfo.color};
                        border: 1px solid ${typeInfo.color}30;
                    ">${typeInfo.text}</span>
                `;
                headerLine.appendChild(titleHeader);
                titleWrapper.appendChild(headerLine);
                const titleContent = document.createElement('div');
                await setRichTextContent(titleContent, question.title);
                titleContent.style.cssText = `
                    font-size: 16px;
                    line-height: 1.6;
                    color: #111827;
                `;
                titleWrapper.appendChild(titleContent);
                questionContainer.appendChild(titleWrapper);
                const confidenceDisplay = document.createElement('div');
                confidenceDisplay.id = `confidence-display-${question.id}`;
                confidenceDisplay.style.cssText = `
                    display: flex;
                    align-items: center;
                `;
                if (question.ai_confidence !== undefined) {
                    confidenceDisplay.appendChild(createConfidenceStars(question.ai_confidence));
                }
                questionContainer.appendChild(confidenceDisplay);
                attachSttOnlyButtonListeners(questionContainer);
                attachVideoSttButtonListeners(questionContainer);
                if ([1, 2, 5].includes(question.type)) {
                    const aiButtonContainer = document.createElement('div');
                    aiButtonContainer.style.display = 'flex';
                    aiButtonContainer.style.gap = '10px';
                    aiButtonContainer.style.textAlign = 'right';
                    aiButtonContainer.style.marginTop = '10px';
                    aiButtonContainer.style.marginBottom = '10px';
                    const aiButton = createAIButton(questionContainer, question);
                    if (aiButton) {
                        aiButtonContainer.appendChild(aiButton);
                        questionContainer.appendChild(aiButtonContainer);
                    }
                    await handleChoiceQuestion(question, questionContainer);
                    let thinkingProcessDivChoice = document.createElement('div');
                    thinkingProcessDivChoice.className = 'ai-thinking-process';
                    thinkingProcessDivChoice.style.marginTop = '15px';
                    thinkingProcessDivChoice.style.display = 'none';
                    questionContainer.appendChild(thinkingProcessDivChoice);
                } else if (question.type === 4) {
                    handleFillInBlankQuestion(question, questionContainer, createAIButton);
                } else if ([6].includes(question.type)) {
                    await handleTextQuestion(question, questionContainer, createAIButton);
                } else if (question.type === 9 && question.subQuestions?.length) {
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
                    for (const [subIndex, subQuestion] of question.subQuestions.entries()) {
                        subQuestion.parentQuestion = question;
                        let subQuestionBox = document.createElement('div');
                        subQuestionBox.dataset.subquestionId = subQuestion.id;
                        subQuestionBox.dataset.subquestionIndex = subIndex;
                        subQuestionBox.style.padding = '20px';
                        subQuestionBox.style.backgroundColor = '#ffffff';
                        subQuestionBox.style.borderRadius = '10px';
                        subQuestionBox.style.border = '1px solid #e5e7eb';
                        subQuestionBox.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                        subQuestionBox.dataset.hasAnswer = questionHasAnswer(subQuestion);
                        const subTitleWrapper = document.createElement('div');
                        subTitleWrapper.style.marginBottom = '12px';
                        const subHeaderLine = document.createElement('div');
                        subHeaderLine.style.cssText = `
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            margin-bottom: 8px;
                        `;
                        const subBatchAiCheckboxWrapper = document.createElement('label');
                        subBatchAiCheckboxWrapper.className = 'batch-ai-checkbox-wrapper';
                        subBatchAiCheckboxWrapper.title = '勾选此项，以将该题目加入到“AI批量处理”任务中';
                        const subBatchAiCheckbox = document.createElement('input');
                        subBatchAiCheckbox.type = 'checkbox';
                        subBatchAiCheckbox.className = 'batch-ai-checkbox';
                        subBatchAiCheckbox.checked = !questionHasAnswer(subQuestion);
                        const subCustomCheckbox = document.createElement('span');
                        subCustomCheckbox.className = 'batch-ai-checkbox-custom';
                        subCustomCheckbox.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                        subBatchAiCheckboxWrapper.appendChild(subBatchAiCheckbox);
                        subBatchAiCheckboxWrapper.appendChild(subCustomCheckbox);
                        subHeaderLine.appendChild(subBatchAiCheckboxWrapper);
                        const subTitleHeader = document.createElement('div');
                        subTitleHeader.style.cssText = 'display: flex; align-items: center; white-space: nowrap; flex-shrink: 0;';
                        const subTypeInfo = questionTypeStyles[subQuestion.type] || questionTypeStyles['default'];
                        subTitleHeader.innerHTML = `
                            <strong style="font-size: 15px; color: #1e293b;">${subIndex + 1}. </strong>
                            <span style="
                                display: inline-block;
                                vertical-align: middle;
                                margin: 0 8px;
                                padding: 3px 10px;
                                font-size: 13px;
                                font-weight: 600;
                                border-radius: 12px;
                                background-color: ${subTypeInfo.bg};
                                color: ${subTypeInfo.color};
                                border: 1px solid ${subTypeInfo.color}30;
                            ">${subTypeInfo.text}</span>
                        `;
                        subHeaderLine.appendChild(subTitleHeader);
                        subTitleWrapper.appendChild(subHeaderLine);
                        const subTitleContent = document.createElement('div');
                        await setRichTextContent(subTitleContent, subQuestion.title);
                        subTitleContent.style.cssText = `
                            font-size: 15px;
                            line-height: 1.6;
                            color: #1e293b;
                        `;
                        subTitleWrapper.appendChild(subTitleContent);
                        subQuestionBox.appendChild(subTitleWrapper);
                        const subConfidenceDisplay = document.createElement('div');
                        subConfidenceDisplay.id = `confidence-display-${subQuestion.id}`;
                        subConfidenceDisplay.style.cssText = `
                            display: flex;
                            align-items: center;
                        `;
                        if (subQuestion.ai_confidence !== undefined) {
                            subConfidenceDisplay.appendChild(createConfidenceStars(subQuestion.ai_confidence));
                        }
                        subQuestionBox.appendChild(subConfidenceDisplay);
                        attachSttOnlyButtonListeners(subQuestionBox);
                        attachVideoSttButtonListeners(subQuestionBox);
                        if ([1, 2, 5].includes(subQuestion.type)) {
                            const aiButtonContainer = document.createElement('div');
                            aiButtonContainer.style.display = 'flex';
                            aiButtonContainer.style.gap = '10px';
                            aiButtonContainer.style.marginTop = '10px';
                            aiButtonContainer.style.marginBottom = '10px';
                            aiButtonContainer.style.textAlign = 'right';
                            const aiButton = createAIButton(subQuestionBox, subQuestion);
                            if (aiButton) {
                                aiButtonContainer.appendChild(aiButton);
                                subQuestionBox.appendChild(aiButtonContainer);
                            }
                            await handleChoiceQuestion(subQuestion, subQuestionBox);
                        } else if (subQuestion.type === 4) {
                            handleFillInBlankQuestion(subQuestion, subQuestionBox, createAIButton);
                        } else if ([6].includes(subQuestion.type)) {
                            await handleTextQuestion(subQuestion, subQuestionBox, createAIButton);
                        }
                        subQuestionBox.appendChild(createReportButton(subQuestion));
                        subQuestionsContainer.appendChild(subQuestionBox);
                        const quarkButtonForSub = document.createElement('button');
                        quarkButtonForSub.className = 'quark-search-btn';
                        quarkButtonForSub.innerHTML = `
                            <span class="icon">🔍</span>
                            <span>夸克搜题</span>
                        `;
                        quarkButtonForSub.onclick = async () => {
                            quarkButtonForSub.disabled = true;
                            const originalContent = quarkButtonForSub.innerHTML;
                            quarkButtonForSub.innerHTML = `
                                <span class="icon" style="display: inline-block; animation: spin 1s linear infinite;">🌐</span>
                                <span>搜题中...</span>
                            `;
                            try {
                                const results = await QuarkSearchManager.search(subQuestionBox, subQuestion);
                                if (results && results.length > 0) {
                                    displayQuarkResults(subQuestionBox, subQuestion, results);
                                }
                            } finally {
                                quarkButtonForSub.disabled = false;
                                quarkButtonForSub.innerHTML = originalContent;
                            }
                        };
                        let actionsContainer = subQuestionBox.querySelector('.ai-assist-btn')?.parentElement;
                        if (actionsContainer) {
                            actionsContainer.style.display = 'flex';
                            actionsContainer.style.gap = '10px';
                            actionsContainer.style.justifyContent = 'flex-end';
                            actionsContainer.appendChild(quarkButtonForSub);
                        } else {
                            const newActionsContainer = document.createElement('div');
                            newActionsContainer.style.display = 'flex';
                            newActionsContainer.style.gap = '10px';
                            newActionsContainer.style.marginTop = '15px';
                            newActionsContainer.style.justifyContent = 'flex-end';
                            newActionsContainer.appendChild(quarkButtonForSub);
                            subQuestionBox.appendChild(newActionsContainer);
                        }
                    }
                    questionContainer.appendChild(subQuestionsContainer);
                }
                else if (question.type === 10) {
                    let programmingContainer = document.createElement('div');
                    programmingContainer.style.display = 'flex';
                    programmingContainer.style.flexDirection = 'column';
                    programmingContainer.style.gap = '16px';
                    programmingContainer.style.marginTop = '16px';
                    const progSetting = question.program_setting;
                    let infoContainer = document.createElement('div');
                    infoContainer.style.display = 'flex';
                    infoContainer.style.gap = '16px';
                    infoContainer.style.fontSize = '14px';
                    infoContainer.style.color = '#4b5563';
                    infoContainer.style.padding = '10px';
                    infoContainer.style.backgroundColor = '#f9fafb';
                    infoContainer.style.borderRadius = '8px';
                    infoContainer.style.border = '1px solid #e5e7eb';
                    infoContainer.innerHTML = `
                        <span><strong>语言:</strong> ${progSetting?.language?.join(', ') || 'N/A'}</span>
                        <span><strong>时间限制:</strong> ${progSetting?.max_time || 'N/A'} ms</span>
                        <span><strong>内存限制:</strong> ${progSetting?.max_memory || 'N/A'} KB</span>
                    `;
                    programmingContainer.appendChild(infoContainer);
                    if (progSetting?.example_code) {
                        let exampleCodeContainer = document.createElement('div');
                        exampleCodeContainer.innerHTML = '<strong>示例代码:</strong>';
                        exampleCodeContainer.style.fontWeight = '600';
                        exampleCodeContainer.style.marginBottom = '8px';
                        let exampleCodeBlock = document.createElement('pre');
                        exampleCodeBlock.textContent = progSetting.example_code;
                        exampleCodeBlock.style.padding = '12px';
                        exampleCodeBlock.style.backgroundColor = '#f3f4f6';
                        exampleCodeBlock.style.borderRadius = '8px';
                        exampleCodeBlock.style.border = '1px solid #e5e7eb';
                        exampleCodeBlock.style.whiteSpace = 'pre-wrap';
                        exampleCodeBlock.style.wordBreak = 'break-all';
                        exampleCodeBlock.style.maxHeight = '200px';
                        exampleCodeBlock.style.overflowY = 'auto';
                        exampleCodeContainer.appendChild(exampleCodeBlock);
                        programmingContainer.appendChild(exampleCodeContainer);
                    }
                    let answerCodeContainer = document.createElement('div');
                    answerCodeContainer.innerHTML = '<strong>答案代码:</strong>';
                    answerCodeContainer.style.fontWeight = '600';
                    answerCodeContainer.style.marginBottom = '8px';
                    const codeEditorWrapper = document.createElement('div');
                    codeEditorWrapper.className = 'code-editor-wrapper';
                    codeEditorWrapper.setAttribute('data-language', progSetting?.language?.[0] || 'Code');
                    codeEditorWrapper.style.cssText = `
                        width: 100%;
                        border: 1px solid #d1d5db;
                        border-radius: 8px;
                        overflow: hidden;
                        background-color: #1e1e1e;
                        position: relative;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    `;
                    const lineNumbers = document.createElement('div');
                    lineNumbers.className = 'code-line-numbers';
                    lineNumbers.style.cssText = `
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 50px;
                        height: 100%;
                        background-color: #252526;
                        color: #858585;
                        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                        font-size: 14px;
                        line-height: 1.6;
                        padding: 12px 8px;
                        text-align: right;
                        border-right: 1px solid #3e3e3e;
                        user-select: none;
                        overflow: hidden;
                    `;
                    let answerCodeInput = document.createElement('textarea');
                    answerCodeInput.value = progSetting?.code_answer || '';
                    answerCodeInput.style.cssText = `
                        width: 100%;
                        min-height: 350px;
                        padding: 12px 12px 12px 62px;
                        border: none;
                        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                        font-size: 14px;
                        line-height: 1.6;
                        resize: vertical;
                        box-sizing: border-box;
                        background-color: transparent;
                        color: #d4d4d4;
                        tab-size: 4;
                        outline: none;
                        position: relative;
                        z-index: 1;
                    `;
                    answerCodeInput.setAttribute('spellcheck', 'false');
                    answerCodeInput.setAttribute('autocomplete', 'off');
                    answerCodeInput.setAttribute('autocorrect', 'off');
                    answerCodeInput.setAttribute('autocapitalize', 'off');
                    function updateLineNumbers() {
                        const lines = answerCodeInput.value.split('\n');
                        const lineCount = lines.length;
                        lineNumbers.innerHTML = Array.from({ length: lineCount }, (_, i) => i + 1).join('<br>');
                    }
                    updateLineNumbers();
                    answerCodeInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Tab') {
                            e.preventDefault();
                            const start = answerCodeInput.selectionStart;
                            const end = answerCodeInput.selectionEnd;
                            const selectedText = answerCodeInput.value.substring(start, end);
                            if (selectedText.includes('\n')) {
                                const before = answerCodeInput.value.substring(0, start);
                                const after = answerCodeInput.value.substring(end);
                                const lines = selectedText.split('\n');
                                const indented = e.shiftKey
                                    ? lines.map(line => line.startsWith('    ') ? line.slice(4) : line).join('\n')
                                    : lines.map(line => '    ' + line).join('\n');
                                answerCodeInput.value = before + indented + after;
                                answerCodeInput.selectionStart = start;
                                answerCodeInput.selectionEnd = start + indented.length;
                            } else {
                                if (e.shiftKey) {
                                    const lineStart = answerCodeInput.value.lastIndexOf('\n', start - 1) + 1;
                                    const lineEnd = answerCodeInput.value.indexOf('\n', start);
                                    const currentLine = answerCodeInput.value.substring(lineStart, lineEnd === -1 ? undefined : lineEnd);
                                    if (currentLine.startsWith('    ')) {
                                        const before = answerCodeInput.value.substring(0, lineStart);
                                        const after = answerCodeInput.value.substring(lineEnd === -1 ? answerCodeInput.value.length : lineEnd);
                                        answerCodeInput.value = before + currentLine.slice(4) + after;
                                        answerCodeInput.selectionStart = answerCodeInput.selectionEnd = Math.max(lineStart, start - 4);
                                    }
                                } else {
                                    answerCodeInput.value = answerCodeInput.value.substring(0, start) + '    ' + answerCodeInput.value.substring(end);
                                    answerCodeInput.selectionStart = answerCodeInput.selectionEnd = start + 4;
                                }
                            }
                            updateLineNumbers();
                            answerCodeInput.dispatchEvent(new Event('input'));
                        }
                    });
                    answerCodeInput.addEventListener('input', () => {
                        isContentModified = true;
                        if (question.program_setting) {
                            question.program_setting.code_answer = answerCodeInput.value;
                        } else {
                            question.program_setting = { code_answer: answerCodeInput.value };
                        }
                        updateLineNumbers();
                    });
                    answerCodeInput.addEventListener('scroll', () => {
                        lineNumbers.scrollTop = answerCodeInput.scrollTop;
                    });
                    codeEditorWrapper.appendChild(lineNumbers);
                    codeEditorWrapper.appendChild(answerCodeInput);
                    answerCodeContainer.appendChild(codeEditorWrapper);
                    programmingContainer.appendChild(answerCodeContainer);
                    let aiButtonContainer = document.createElement('div');
                    aiButtonContainer.style.display = 'flex';
                    aiButtonContainer.style.gap = '10px';
                    aiButtonContainer.style.textAlign = 'right';
                    aiButtonContainer.style.marginTop = '10px';
                    aiButtonContainer.style.marginBottom = '10px';
                    let aiButton = createAIButton(answerCodeInput, question);
                    aiButtonContainer.appendChild(aiButton);
                    programmingContainer.appendChild(aiButtonContainer);
                    if (question.answer_items?.[0]?.answer) {
                        let testCasesContainer = document.createElement('div');
                        testCasesContainer.innerHTML = '<strong>测试用例:</strong>';
                        testCasesContainer.style.fontWeight = '600';
                        testCasesContainer.style.marginBottom = '8px';
                        let testCasesBlock = document.createElement('div');
                        testCasesBlock.style.padding = '12px';
                        testCasesBlock.style.backgroundColor = '#f3f4f6';
                        testCasesBlock.style.borderRadius = '8px';
                        testCasesBlock.style.border = '1px solid #e5e7eb';
                        testCasesBlock.style.maxHeight = '150px';
                        testCasesBlock.style.overflowY = 'auto';
                        try {
                            const testCases = JSON.parse(question.answer_items[0].answer);
                            if (Array.isArray(testCases)) {
                                testCases.forEach((tc, i) => {
                                    let tcDiv = document.createElement('div');
                                    tcDiv.style.marginBottom = '8px';
                                    tcDiv.innerHTML = `
                                        <div><strong>用例 ${i + 1}:</strong></div>
                                        <pre style="margin: 4px 0; padding: 4px; background: #e5e7eb; border-radius: 4px;">输入: ${tc.in}</pre>
                                        <pre style="margin: 4px 0; padding: 4px; background: #e5e7eb; border-radius: 4px;">输出: ${tc.out}</pre>
                                    `;
                                    testCasesBlock.appendChild(tcDiv);
                                });
                            } else {
                                testCasesBlock.textContent = question.answer_items[0].answer;
                            }
                        } catch (e) {
                            testCasesBlock.textContent = question.answer_items[0].answer;
                        }
                        testCasesContainer.appendChild(testCasesBlock);
                        programmingContainer.appendChild(testCasesContainer);
                    }
                    questionContainer.appendChild(programmingContainer);
                    let thinkingProcessDivProg = document.createElement('div');
                    thinkingProcessDivProg.className = 'ai-thinking-process';
                    thinkingProcessDivProg.style.marginTop = '15px';
                    thinkingProcessDivProg.style.display = 'none';
                    questionContainer.appendChild(thinkingProcessDivProg);
                } else if (question.type === 12) {
                    question.answer_items.sort((a, b) => {
                        const answerA = parseInt(a.answer, 10);
                        const answerB = parseInt(b.answer, 10);
                        if (isNaN(answerA) || isNaN(answerB)) {
                            return 0;
                        }
                        return answerA - answerB;
                    });
                    let sortableContainer = document.createElement('div');
                    sortableContainer.dataset.sortableContainer = "true";
                    sortableContainer.style.display = 'flex';
                    sortableContainer.style.flexDirection = 'column';
                    sortableContainer.style.gap = '12px';
                    sortableContainer.style.marginTop = '16px';
                    for (const [index, item] of question.answer_items.entries()) {
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
                        await setRichTextContent(itemText, item.value);
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
                                isContentModified = true;
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
                    }
                    const aiButtonContainer = document.createElement('div');
                    aiButtonContainer.style.display = 'flex';
                    aiButtonContainer.style.gap = '10px';
                    aiButtonContainer.style.textAlign = 'right';
                    aiButtonContainer.style.marginTop = '10px';
                    aiButtonContainer.style.marginBottom = '10px';
                    const aiButton = createAIButton(sortableContainer, question);
                    if (aiButton) {
                        aiButtonContainer.appendChild(aiButton);
                        questionContainer.appendChild(aiButtonContainer);
                    }
                    questionContainer.appendChild(sortableContainer);
                } else if (question.type === 13) {
                    let matchingContainer = document.createElement('div');
                    matchingContainer.dataset.matchingContainer = "true";
                    matchingContainer.style.cssText = `
                        display: flex; flex-direction: column; gap: 16px; margin-top: 20px;
                        padding: 16px; background-color: #f8fafc; border-radius: 16px;
                    `;
                    const leftItems = question.answer_items.filter(item => !item.is_target_opt);
                    const rightItems = question.answer_items.filter(item => item.is_target_opt);
                    const rightItemMap = new Map(rightItems.map((item, idx) => [item.id, {
                        letter: String.fromCharCode(97 + idx),
                        content: item.value
                    }]));
                    for (const [idx, leftItem] of leftItems.entries()) {
                        let matchItem = document.createElement('div');
                        matchItem.dataset.matchingItem = "true";
                        matchItem.style.cssText = `
                            display: flex; flex-direction: column; padding: 20px; background-color: #ffffff;
                            border-radius: 12px; border: 1px solid #e2e8f0;
                            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
                            transition: all 0.3s ease; position: relative;
                        `;
                        let headerContainer = document.createElement('div');
                        headerContainer.style.cssText = 'display: flex; align-items: flex-start; margin-bottom: 16px;';
                        let leftLabel = document.createElement('div');
                        leftLabel.textContent = String.fromCharCode(65 + idx) + '.';
                        leftLabel.style.cssText = 'margin-right: 12px; font-weight: 600; color: #6366f1; font-size: 16px; width: 24px;';
                        let leftContent = document.createElement('div');
                        await setRichTextContent(leftContent, leftItem.value);
                        leftContent.style.cssText = 'flex: 1; color: #1e293b; font-size: 15px; font-weight: 500; line-height: 1.6;';
                        let chipContainer = document.createElement('div');
                        chipContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';
                        let dropdownButton = document.createElement('button');
                        dropdownButton.innerHTML = `
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            添加匹配项
                        `;
                        dropdownButton.style.cssText = `
                            display: flex; align-items: center; justify-content: center; margin-top: 16px;
                            padding: 10px 16px; background-color: #4f46e5; color: #ffffff;
                            border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s ease;
                            font-size: 14px; font-weight: 500; width: 100%;
                        `;
                        dropdownButton.onmouseover = () => { dropdownButton.style.backgroundColor = '#4338ca'; dropdownButton.style.transform = 'translateY(-1px)'; };
                        dropdownButton.onmouseout = () => { dropdownButton.style.backgroundColor = '#4f46e5'; dropdownButton.style.transform = 'translateY(0)'; };
                        let dropdownList = document.createElement('div');
                        dropdownList.style.cssText = `
                            position: absolute; top: 100%; left: 0; width: 100%; max-height: 300px;
                            overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 12px;
                            background-color: #ffffff; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
                            z-index: 1000; margin-top: 8px; display: none; opacity: 0;
                            transform: scaleY(0.9) translateY(-10px); transform-origin: top;
                            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                        `;
                        const updateUI = async () => {
                            const currentAnswerIds = new Set(leftItem.answer ? String(leftItem.answer).split(',').filter(id => id) : []);
                            chipContainer.innerHTML = '';
                            for (const answerId of currentAnswerIds) {
                                if (rightItemMap.has(answerId)) {
                                    const rightItemData = rightItemMap.get(answerId);
                                    let chip = document.createElement('div');
                                    chip.style.cssText = `
                                        display: flex;
                                        align-items: center;
                                        padding: 6px 12px;
                                        background-color: #eef2ff;
                                        border: 1px solid #e0e7ff;
                                        border-radius: 8px;
                                        color: #4f46e5;
                                        font-size: 14px;
                                        font-weight: 500;
                                        transition: all 0.2s ease;
                                    `;
                                    const chipLetter = document.createElement('div');
                                    chipLetter.textContent = `${rightItemData.letter}.`;
                                    chipLetter.style.cssText = 'margin-right: 8px; flex-shrink: 0;';
                                    const chipContent = document.createElement('div');
                                    await setRichTextContent(chipContent, rightItemData.content);
                                    chipContent.style.flex = '1';
                                    const innerDivs = chipContent.querySelectorAll('div');
                                    innerDivs.forEach(div => {
                                        div.style.margin = '0';
                                        div.style.padding = '0';
                                        div.style.display = 'inline';
                                    });
                                    let removeIcon = document.createElement('span');
                                    removeIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                                    removeIcon.style.cssText = 'cursor: pointer; display: flex; align-items: center; padding: 2px; border-radius: 4px; transition: all 0.2s ease; margin-left: 8px;';
                                    removeIcon.onmouseover = () => { removeIcon.style.backgroundColor = '#e0e7ff'; };
                                    removeIcon.onmouseout = () => { removeIcon.style.backgroundColor = 'transparent'; };
                                    removeIcon.onclick = (e) => {
                                        e.stopPropagation();
                                        const ids = new Set(leftItem.answer ? String(leftItem.answer).split(',') : []);
                                        ids.delete(answerId);
                                        leftItem.answer = Array.from(ids).join(',');
                                        isContentModified = true;
                                        updateUI();
                                    };
                                    chip.appendChild(chipLetter);
                                    chip.appendChild(chipContent);
                                    chip.appendChild(removeIcon);
                                    chipContainer.appendChild(chip);
                                }
                            }
                            const checkboxes = dropdownList.querySelectorAll('input[type="checkbox"]');
                            checkboxes.forEach((cb, cbIndex) => {
                                const rightItemId = rightItems[cbIndex].id;
                                cb.checked = currentAnswerIds.has(rightItemId);
                            });
                        };
                        matchItem._updateUI = updateUI;
                        for (const [rIdx, rightItem] of rightItems.entries()) {
                            let dropdownOption = document.createElement('div');
                            dropdownOption.style.cssText = `
                                padding: 12px 16px; cursor: pointer; display: flex; align-items: center;
                                transition: all 0.2s ease; position: relative;
                                border-bottom: ${rIdx < rightItems.length - 1 ? '1px solid #f1f5f9' : 'none'};
                            `;
                            dropdownOption.onmouseover = () => { dropdownOption.style.backgroundColor = '#f8fafc'; };
                            dropdownOption.onmouseout = () => { dropdownOption.style.backgroundColor = '#ffffff'; };
                            let checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.style.cssText = 'margin-right: 12px; width: 16px; height: 16px; accent-color: #4f46e5;';
                            checkbox.onchange = (e) => {
                                isContentModified = true;
                                e.stopPropagation();
                                const selectedIds = new Set(leftItem.answer ? String(leftItem.answer).split(',').filter(id => id) : []);
                                if (checkbox.checked) {
                                    selectedIds.add(rightItem.id);
                                } else {
                                    selectedIds.delete(rightItem.id);
                                }
                                leftItem.answer = Array.from(selectedIds).join(',');
                                updateUI();
                            };
                            let optionContent = document.createElement('div');
                            optionContent.style.cssText = 'flex: 1; display: flex; align-items: center;';
                            const optionLetter = document.createElement('span');
                            optionLetter.style.cssText = 'font-weight:600; color:#6366f1; margin-right:12px; font-size:14px;';
                            optionLetter.textContent = `${String.fromCharCode(97 + rIdx)}.`;
                            const optionValue = document.createElement('span');
                            optionValue.style.cssText = 'color:#1e293b; font-size:14px; font-weight:500;';
                            await setRichTextContent(optionValue, rightItem.value);
                            optionValue.querySelectorAll('div').forEach(div => {
                                div.style.margin = '0';
                                div.style.padding = '0';
                                div.style.display = 'inline';
                            });
                            optionContent.appendChild(optionLetter);
                            optionContent.appendChild(optionValue);
                            dropdownOption.appendChild(checkbox);
                            dropdownOption.appendChild(optionContent);
                            dropdownOption.onclick = (e) => {
                                if (e.target !== checkbox) {
                                    checkbox.checked = !checkbox.checked;
                                    checkbox.dispatchEvent(new Event('change'));
                                }
                            };
                            dropdownList.appendChild(dropdownOption);
                        }
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
                                setTimeout(() => { dropdownList.style.display = 'none'; }, 200);
                            }
                        };
                        document.addEventListener('click', (e) => {
                            if (!matchItem.contains(e.target)) {
                                dropdownList.style.opacity = '0';
                                dropdownList.style.transform = 'scaleY(0.9) translateY(-10px)';
                                setTimeout(() => { dropdownList.style.display = 'none'; }, 200);
                            }
                        });
                        headerContainer.appendChild(leftLabel);
                        headerContainer.appendChild(leftContent);
                        matchItem.appendChild(headerContainer);
                        matchItem.appendChild(chipContainer);
                        matchItem.appendChild(dropdownButton);
                        matchItem.appendChild(dropdownList);
                        matchingContainer.appendChild(matchItem);
                        updateUI();
                    }
                    const aiButtonContainer = document.createElement('div');
                    aiButtonContainer.style.display = 'flex';
                    aiButtonContainer.style.gap = '10px';
                    aiButtonContainer.style.textAlign = 'right';
                    aiButtonContainer.style.marginTop = '10px';
                    aiButtonContainer.style.marginBottom = '10px';
                    const aiButton = createAIButton(matchingContainer, question);
                    if (aiButton) {
                        aiButtonContainer.appendChild(aiButton);
                    }
                    if (aiButton) {
                        questionContainer.appendChild(aiButtonContainer);
                    }
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
                        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8 1L1 14H15L8 1Z" fill="#FFC107"/><rect x="7" y="5" width="2" height="5" fill="black"/><rect x="7" y="11" width="2" height="2" fill="black"/></svg>
                            <p style="margin: 0;">该题型暂不支持查看答案</p>
                        </div>
                    `;
                    questionContainer.appendChild(notSupportedMessage);
                }
                content.appendChild(questionContainer);
                questionContainers.push(questionContainer);
                if (SUPPORTED_CONTRIBUTION_TYPES.includes(question.type)) {
                    questionContainer.appendChild(createReportButton(question));
                }
                if (![6, 9].includes(question.type)) {
                    const quarkButton = document.createElement('button');
                    quarkButton.className = 'quark-search-btn';
                    quarkButton.innerHTML = `
                        <span class="icon">🔍</span>
                        <span>夸克搜题</span>
                    `;
                    quarkButton.onclick = async () => {
                        quarkButton.disabled = true;
                        const originalContent = quarkButton.innerHTML;
                        quarkButton.innerHTML = `
                            <span class="icon" style="display: inline-block; animation: spin 1s linear infinite;">🌐</span>
                            <span>搜题中...</span>
                        `;
                        try {
                            const results = await QuarkSearchManager.search(questionContainer, question);
                            if (results && results.length > 0) {
                                displayQuarkResults(questionContainer, question, results);
                            }
                        } finally {
                            quarkButton.disabled = false;
                            quarkButton.innerHTML = originalContent;
                        }
                    };
                    const aiButtonContainer = questionContainer.querySelector('.ai-assist-btn')?.parentElement;
                    if (aiButtonContainer) {
                        aiButtonContainer.appendChild(quarkButton);
                    }
                }
            }
        };
        modalContainer.appendChild(resizeHandle);
        modalContainer.appendChild(dragHandle);
        modalContainer.appendChild(closeButton);
        modalContainer.appendChild(title);
        modalContainer.appendChild(aiAssistAllButton);
        modalContainer.appendChild(saveButton);
        modalContainer.appendChild(modalContentWrapper);
        modalContentWrapper.appendChild(tocContainer);
        modalContentWrapper.appendChild(content);
        const handleEscapeKey = (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        };
        function displayQuarkResults(container, question, results) {
            const oldQuarkResult = container.querySelector('.quark-result-display');
            if (oldQuarkResult) {
                oldQuarkResult.remove();
            }
            const resultContainer = document.createElement('div');
            resultContainer.className = 'quark-result-display';
            resultContainer.style.cssText = `
                margin-top: 16px;
                padding: 0;
                background: transparent;
                animation: quarkResultFadeIn 0.4s ease-out;
            `;
            const renderRichContent = (content) => {
                if (!content) return '';
                let processed = content
                    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
                    .replace(/^## (.*?)$/gm, '<h3>$1</h3>')
                    .replace(/^# (.*?)$/gm, '<h3>$1</h3>')
                    .replace(/^#### (.*?)$/gm, '<h4>$1</h4>');
                processed = processed.replace(/^---+$/gm, '<hr>');
                processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                processed = processed.replace(/^[•\-\*]\s+(.*?)$/gm, '<li>$1</li>');
                processed = processed.replace(/(<li>.*?<\/li>\s*)+/gs, (match) => {
                    return '<ul>' + match + '</ul>';
                });
                const lines = processed.split('\n');
                let inBlock = false;
                let result = [];
                for (let line of lines) {
                    line = line.trim();
                    if (!line) {
                        inBlock = false;
                        continue;
                    }
                    if (line.match(/^<(h[1-6]|ul|li|hr|div)/)) {
                        result.push(line);
                        inBlock = false;
                    } else {
                        if (!inBlock) {
                            result.push('<p>' + line);
                            inBlock = true;
                        } else {
                            result.push(' ' + line);
                        }
                    }
                }
                if (inBlock) {
                    result.push('</p>');
                }
                processed = result.join('\n');
                processed = processed.replace(/\\boxed{([^}]+)}/g, '$\\boxed{$1}$');
                if (window.renderMathInElement) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = processed;
                    window.renderMathInElement(tempDiv, {
                        delimiters: [
                            { left: "$$", right: "$$", display: true },
                            { left: "\\[", right: "\\]", display: true },
                            { left: "$", right: "$", display: false },
                            { left: "\\(", right: "\\)", display: false }
                        ],
                        throwOnError: false,
                        trust: true
                    });
                    return tempDiv.innerHTML;
                }
                return processed;
            };
            if (!document.getElementById('quark-result-animation')) {
                const style = document.createElement('style');
                style.id = 'quark-result-animation';
                style.textContent = `
                    @keyframes quarkResultFadeIn {
                        from {
                            opacity: 0;
                            transform: translateY(-10px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                    .quark-tab-item {
                        padding: 10px 16px;
                        background: #f1f5f9;
                        border: 1px solid #e2e8f0;
                        border-bottom: none;
                        border-radius: 8px 8px 0 0;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        font-size: 13px;
                        font-weight: 600;
                        color: #64748b;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        user-select: none;
                    }
                    .quark-tab-item:hover {
                        background: #e2e8f0;
                        color: #475569;
                    }
                    .quark-tab-item.active {
                        background: white;
                        border-color: #0ea5e9;
                        border-bottom: 2px solid white;
                        color: #0369a1;
                        transform: translateY(1px);
                        box-shadow: 0 -2px 8px rgba(14, 165, 233, 0.15);
                    }
                    .quark-result-item {
                        display: none;
                        animation: fadeInContent 0.3s ease-out;
                    }
                    .quark-result-item.active {
                        display: block;
                    }
                    @keyframes fadeInContent {
                        from {
                            opacity: 0;
                            transform: translateY(10px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                    .quark-content-rendered h3,
                    .quark-content-rendered h4 {
                        margin: 16px 0 8px 0;
                        font-weight: 600;
                        color: #1e293b;
                    }
                    .quark-content-rendered h3 {
                        font-size: 16px;
                        border-bottom: 2px solid #e2e8f0;
                        padding-bottom: 4px;
                    }
                    .quark-content-rendered h4 {
                        font-size: 14px;
                    }
                    .quark-content-rendered p {
                        margin: 8px 0;
                        line-height: 1.7;
                    }
                    .quark-content-rendered ul,
                    .quark-content-rendered ol {
                        margin: 8px 0;
                        padding-left: 24px;
                    }
                    .quark-content-rendered li {
                        margin: 6px 0;
                        line-height: 1.6;
                    }
                    .quark-content-rendered strong,
                    .quark-content-rendered b {
                        font-weight: 600;
                        color: #0f172a;
                    }
                    .quark-content-rendered code {
                        background: #f1f5f9;
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-family: 'Consolas', 'Monaco', monospace;
                        font-size: 0.9em;
                    }
                    .quark-content-rendered hr {
                        border: none;
                        border-top: 1px solid #e2e8f0;
                        margin: 12px 0;
                    }
                    .quark-content-rendered blockquote {
                        border-left: 3px solid #94a3b8;
                        padding-left: 12px;
                        margin: 8px 0;
                        color: #475569;
                        font-style: italic;
                    }
                    .quark-result-display img {
                        max-width: 100%;
                        height: auto;
                        border-radius: 8px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                        margin: 8px 0;
                    }
                `;
                document.head.appendChild(style);
            }
            const mainHeader = document.createElement('div');
            mainHeader.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 12px;
                padding: 12px 16px;
                background: linear-gradient(145deg, #f0f9ff 0%, #e0f2fe 100%);
                border: 1px solid #bae6fd;
                border-radius: 12px;
                box-shadow: 0 2px 6px rgba(3, 105, 161, 0.08);
            `;
            mainHeader.innerHTML = `
                <div style="display: flex; align-items: center; color: #0369a1; font-weight: 600; font-size: 15px;">
                    <span style="margin-right: 8px; font-size: 20px;">🔍</span>
                    <span>夸克搜题结果</span>
                </div>
                <div style="font-size: 13px; color: #0284c7; background: white; padding: 4px 12px; border-radius: 12px; font-weight: 500;">
                    找到 ${results.length} 个相关结果
                </div>
            `;
            resultContainer.appendChild(mainHeader);
            const tabContainer = document.createElement('div');
            tabContainer.style.cssText = `
                display: flex;
                gap: 4px;
                margin-bottom: 0;
                padding-bottom: 0;
            `;
            tabContainer.style.scrollbarWidth = 'thin';
            const contentWrapper = document.createElement('div');
            contentWrapper.style.cssText = `
                border: 1px solid #0ea5e9;
                border-radius: 0 10px 10px 10px;
                background: white;
                overflow: hidden;
            `;
            resultContainer.appendChild(tabContainer);
            resultContainer.appendChild(contentWrapper);
            results.forEach((result, index) => {
                const tab = document.createElement('div');
                tab.className = 'quark-tab-item';
                if (index === 0) tab.classList.add('active');
                tab.dataset.tabIndex = index;
                const tabNumber = document.createElement('span');
                tabNumber.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 20px;
                    height: 20px;
                    padding: 0 4px;
                    background: ${index === 0 ? 'linear-gradient(135deg, #0ea5e9, #0284c7)' : '#cbd5e1'};
                    color: white;
                    font-size: 11px;
                    font-weight: 700;
                    border-radius: 4px;
                `;
                tabNumber.textContent = index + 1;
                tab.appendChild(tabNumber);
                const tabText = document.createElement('span');
                tabText.textContent = result.question_type || '未知题型';
                tab.appendChild(tabText);
                if (index === 0) {
                    const starIcon = document.createElement('span');
                    starIcon.textContent = '⭐';
                    starIcon.style.fontSize = '14px';
                    tab.appendChild(starIcon);
                }
                tab.onclick = () => {
                    document.querySelectorAll('.quark-tab-item').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.quark-result-item').forEach(r => r.classList.remove('active'));
                    tab.classList.add('active');
                    contentWrapper.querySelector(`[data-result-index="${index}"]`).classList.add('active');
                };
                tabContainer.appendChild(tab);
                const resultItem = document.createElement('div');
                resultItem.className = 'quark-result-item';
                if (index === 0) resultItem.classList.add('active');
                resultItem.dataset.resultIndex = index;
                resultItem.style.cssText = `
                    padding: 16px 20px;
                `;
                const resultHeader = document.createElement('div');
                resultHeader.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 10px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid #f1f5f9;
                `;
                const headerLeft = document.createElement('div');
                headerLeft.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                const resultNumber = document.createElement('span');
                resultNumber.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 24px;
                    height: 24px;
                    padding: 0 6px;
                    background: linear-gradient(135deg, #0ea5e9, #0284c7);
                    color: white;
                    font-size: 12px;
                    font-weight: 700;
                    border-radius: 6px;
                `;
                resultNumber.textContent = `#${index + 1}`;
                const questionType = document.createElement('span');
                questionType.style.cssText = `
                    font-size: 13px;
                    color: #0369a1;
                    font-weight: 600;
                `;
                questionType.textContent = result.question_type || '未知题型';
                headerLeft.appendChild(resultNumber);
                headerLeft.appendChild(questionType);
                if (index === 0) {
                    const recommendTag = document.createElement('span');
                    recommendTag.style.cssText = `
                        font-size: 11px;
                        color: #0ea5e9;
                        background: #e0f2fe;
                        padding: 2px 8px;
                        border-radius: 10px;
                        font-weight: 600;
                    `;
                    recommendTag.textContent = '推荐';
                    headerLeft.appendChild(recommendTag);
                }
                resultHeader.appendChild(headerLeft);
                const questionContent = document.createElement('div');
                questionContent.style.cssText = `
                    margin-bottom: 12px;
                    padding: 10px 12px;
                    background: #f8fafc;
                    border-radius: 6px;
                    font-size: 14px;
                    color: #334155;
                    line-height: 1.6;
                    max-height: 300px;
                    overflow-y: auto;
                `;
                questionContent.innerHTML = renderRichContent(result.content || '（题目内容未获取）');
                questionContent.querySelectorAll('img').forEach(img => {
                    img.style.cssText = `
                        max-width: 100%;
                        height: auto;
                        display: block;
                        margin: 8px 0;
                        border-radius: 6px;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    `;
                });
                const metaInfoBar = document.createElement('div');
                metaInfoBar.style.cssText = `
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 12px;
                    padding: 10px 12px;
                    background: #f8fafc;
                    border-radius: 8px;
                    font-size: 12px;
                `;
                const metaItems = [
                    { label: '年级', value: result.grade_new || result.grade, icon: '🎓', color: '#3b82f6' },
                    { label: '科目', value: result.course_new || result.course, icon: '📚', color: '#8b5cf6' },
                    { label: '题型', value: result.question_type, icon: '📝', color: '#10b981' }
                ];
                metaItems.forEach(item => {
                    if (item.value && item.value.trim()) {
                        const metaTag = document.createElement('span');
                        metaTag.style.cssText = `
                            display: inline-flex;
                            align-items: center;
                            gap: 4px;
                            padding: 4px 10px;
                            background: white;
                            border: 1px solid ${item.color}30;
                            border-radius: 6px;
                            color: ${item.color};
                            font-weight: 600;
                        `;
                        metaTag.innerHTML = `${item.icon} <span>${item.label}: ${item.value}</span>`;
                        metaInfoBar.appendChild(metaTag);
                    }
                });
                const answerSection = document.createElement('div');
                answerSection.style.cssText = `
                    margin-bottom: ${result.solution ? '10px' : '0'};
                `;
                const answerLabel = document.createElement('div');
                answerLabel.style.cssText = `
                    font-size: 12px;
                    color: #64748b;
                    margin-bottom: 6px;
                    font-weight: 600;
                `;
                answerLabel.textContent = '✓ 参考答案';
                const answerContent = document.createElement('div');
                answerContent.className = 'quark-content-rendered';
                answerContent.style.cssText = `
                    padding: 14px 16px;
                    background: #f0fdf4;
                    border-left: 3px solid #22c55e;
                    border-radius: 6px;
                    font-size: 14px;
                    color: #166534;
                    line-height: 1.7;
                `;
                const renderedAnswer = renderRichContent(result.answer);
                answerContent.innerHTML = renderedAnswer;
                answerSection.appendChild(answerLabel);
                answerSection.appendChild(answerContent);
                let solutionSection = null;
                if (result.solution && result.solution.trim()) {
                    solutionSection = document.createElement('details');
                    solutionSection.style.cssText = `
                        margin-top: 10px;
                    `;
                    solutionSection.setAttribute('open', 'true');
                    const solutionSummary = document.createElement('summary');
                    solutionSummary.style.cssText = `
                        font-size: 12px;
                        color: #64748b;
                        font-weight: 600;
                        cursor: pointer;
                        list-style: none;
                        display: flex;
                        align-items: center;
                        user-select: none;
                        padding: 6px 0;
                    `;
                    solutionSummary.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px; transition: transform 0.3s ease; transform: rotate(90deg);">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                        💡 详细解析
                    `;
                    const solutionContent = document.createElement('div');
                    solutionContent.className = 'quark-content-rendered';
                    solutionContent.style.cssText = `
                        margin-top: 6px;
                        padding: 14px 16px;
                        background: #fffbeb;
                        border-left: 3px solid #f59e0b;
                        border-radius: 6px;
                        font-size: 13px;
                        color: #78350f;
                        line-height: 1.8;
                    `;
                    const renderedSolution = renderRichContent(result.solution);
                    solutionContent.innerHTML = renderedSolution;
                    solutionSection.addEventListener('toggle', () => {
                        const arrow = solutionSummary.querySelector('svg');
                        arrow.style.transform = solutionSection.open ? 'rotate(90deg)' : 'rotate(0deg)';
                    });
                    solutionSection.appendChild(solutionSummary);
                    solutionSection.appendChild(solutionContent);
                }
                let aiAnalysisSection = null;
                try {
                    const aiAnalysis = result.ai_analysis_content ? JSON.parse(result.ai_analysis_content) : null;
                    if (aiAnalysis && (typeof aiAnalysis === 'string' || (typeof aiAnalysis === 'object' && Object.keys(aiAnalysis).length > 0))) {
                        aiAnalysisSection = document.createElement('details');
                        aiAnalysisSection.style.cssText = `margin-top: 10px;`;
                        const aiSummary = document.createElement('summary');
                        aiSummary.style.cssText = `
                            font-size: 12px;
                            color: #64748b;
                            font-weight: 600;
                            cursor: pointer;
                            list-style: none;
                            display: flex;
                            align-items: center;
                            user-select: none;
                            padding: 6px 0;
                        `;
                        aiSummary.innerHTML = `
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px; transition: transform 0.3s ease;">
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                            🤖 AI 分析
                        `;
                        const aiContent = document.createElement('div');
                        aiContent.className = 'quark-content-rendered';
                        aiContent.style.cssText = `
                            margin-top: 6px;
                            padding: 14px 16px;
                            background: #eff6ff;
                            border-left: 3px solid #3b82f6;
                            border-radius: 6px;
                            font-size: 13px;
                            color: #1e3a8a;
                            line-height: 1.8;
                        `;
                        let aiAnalysisText = '';
                        if (typeof aiAnalysis === 'string') {
                            aiAnalysisText = aiAnalysis;
                        } else if (typeof aiAnalysis === 'object') {
                            const fieldsToShow = [
                                { key: 'answer', label: '答案', priority: 1 },
                                { key: 'ai_analysis_content', label: '详细分析', priority: 2 },
                                { key: 'course', label: '科目', priority: 3 },
                                { key: 'version', label: '版本', priority: 4 }
                            ];
                            fieldsToShow.sort((a, b) => a.priority - b.priority);
                            const parts = [];
                            fieldsToShow.forEach(field => {
                                if (aiAnalysis[field.key] && aiAnalysis[field.key].toString().trim()) {
                                    const value = aiAnalysis[field.key].toString().trim();
                                    if (field.key === 'ai_analysis_content') {
                                        parts.push(`### ${field.label}\n\n${value}`);
                                    } else if (field.key === 'answer' && value) {
                                        parts.push(`**${field.label}:** ${value}`);
                                    } else {
                                        parts.push(`**${field.label}:** ${value}`);
                                    }
                                }
                            });
                            if (parts.length === 0) {
                                for (const [key, value] of Object.entries(aiAnalysis)) {
                                    if (value && value.toString().trim()) {
                                        parts.push(`**${key}:** ${value}`);
                                    }
                                }
                            }
                            aiAnalysisText = parts.join('\n\n');
                        }
                        aiContent.innerHTML = renderRichContent(aiAnalysisText || 'AI 分析内容为空');
                        aiAnalysisSection.addEventListener('toggle', () => {
                            const arrow = aiSummary.querySelector('svg');
                            arrow.style.transform = aiAnalysisSection.open ? 'rotate(90deg)' : 'rotate(0deg)';
                        });
                        aiAnalysisSection.appendChild(aiSummary);
                        aiAnalysisSection.appendChild(aiContent);
                    }
                } catch (e) {
                    console.warn('解析 ai_analysis_content 失败:', e);
                    if (result.ai_analysis_content && result.ai_analysis_content.trim()) {
                        aiAnalysisSection = document.createElement('details');
                        aiAnalysisSection.style.cssText = `margin-top: 10px;`;
                        const aiSummary = document.createElement('summary');
                        aiSummary.style.cssText = `
                            font-size: 12px;
                            color: #64748b;
                            font-weight: 600;
                            cursor: pointer;
                            list-style: none;
                            display: flex;
                            align-items: center;
                            user-select: none;
                            padding: 6px 0;
                        `;
                        aiSummary.innerHTML = `
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px; transition: transform 0.3s ease;">
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                            🤖 AI 分析
                        `;
                        const aiContent = document.createElement('div');
                        aiContent.className = 'quark-content-rendered';
                        aiContent.style.cssText = `
                            margin-top: 6px;
                            padding: 14px 16px;
                            background: #eff6ff;
                            border-left: 3px solid #3b82f6;
                            border-radius: 6px;
                            font-size: 13px;
                            color: #1e3a8a;
                            line-height: 1.8;
                        `;
                        aiContent.innerHTML = renderRichContent(result.ai_analysis_content);
                        aiAnalysisSection.addEventListener('toggle', () => {
                            const arrow = aiSummary.querySelector('svg');
                            arrow.style.transform = aiAnalysisSection.open ? 'rotate(90deg)' : 'rotate(0deg)';
                        });
                        aiAnalysisSection.appendChild(aiSummary);
                        aiAnalysisSection.appendChild(aiContent);
                    }
                }
                resultItem.appendChild(resultHeader);
                resultItem.appendChild(questionContent);
                if (metaInfoBar.children.length > 0) {
                    resultItem.appendChild(metaInfoBar);
                }
                resultItem.appendChild(answerSection);
                if (solutionSection) {
                    resultItem.appendChild(solutionSection);
                }
                if (aiAnalysisSection) {
                    resultItem.appendChild(aiAnalysisSection);
                }
                contentWrapper.appendChild(resultItem);
            });
            const aiThinkingProcess = container.querySelector('.ai-thinking-process');
            const questionOptionsArea = container.querySelector('.question-options, .matching-container, textarea');
            if (aiThinkingProcess) {
                aiThinkingProcess.parentNode.insertBefore(resultContainer, aiThinkingProcess.nextSibling);
            } else if (questionOptionsArea) {
                questionOptionsArea.parentNode.insertBefore(resultContainer, questionOptionsArea.nextSibling);
            } else {
                container.appendChild(resultContainer);
            }
            showNotification(`夸克搜题成功！找到 ${results.length} 个相关结果。`, { type: 'success', duration: 2000 });
        }
        document.addEventListener('keydown', handleEscapeKey);
        document.body.appendChild(overlay);
        document.body.appendChild(modalContainer);
        function updateCurrentQuestionHighlight() {
            const contentRect = content.getBoundingClientRect();
            const viewportTop = contentRect.top;
            const viewportHeight = contentRect.height;
            const viewportCenter = viewportTop + (viewportHeight / 2);
            let currentActiveElement = null;
            let minDistance = Infinity;
            const allQuestionElements = document.querySelectorAll('.question-editor-container, div[data-subquestion-id]');
            allQuestionElements.forEach(el => {
                const elRect = el.getBoundingClientRect();
                const elementCenter = elRect.top + (elRect.height / 2);
                let distance = Math.abs(elementCenter - viewportCenter);
                if (elRect.bottom < viewportTop || elRect.top > viewportTop + viewportHeight) {
                    distance += viewportHeight * 2;
                }
                if (distance < minDistance) {
                    minDistance = distance;
                    currentActiveElement = el;
                }
            });
            let activeQuestionIndex = -1;
            let activeSubquestionIndex = -1;
            if (currentActiveElement) {
                if (currentActiveElement.dataset.subquestionId) {
                    const parentContainer = currentActiveElement.closest('.question-editor-container');
                    activeQuestionIndex = parseInt(parentContainer.id.split('_')[1], 10);
                    activeSubquestionIndex = parseInt(currentActiveElement.dataset.subquestionIndex, 10);
                } else {
                    activeQuestionIndex = parseInt(currentActiveElement.id.split('_')[1], 10);
                }
            }
            tocLinks.forEach((tocLink) => {
                const linkQuestionIndex = parseInt(tocLink.dataset.questionIndex, 10);
                const linkSubquestionIndex = tocLink.dataset.subquestionIndex !== undefined ? parseInt(tocLink.dataset.subquestionIndex, 10) : -1;
                const isCurrent = (linkQuestionIndex === activeQuestionIndex) && (linkSubquestionIndex === activeSubquestionIndex);
                updateTocLinkStyle(tocLink, isCurrent);
            });
        }
        content.addEventListener('scroll', updateCurrentQuestionHighlight)
        const renderPaperDescription = async () => {
            const paperDescription = localStorage.getItem('paperDescription');
            if (!paperDescription || paperDescription === '{}') {
                return;
            }
            const descriptionContainer = document.createElement('div');
            descriptionContainer.id = 'paper-description-container';
            descriptionContainer.style.cssText = `
                margin-bottom: 25px;
                border-radius: 16px;
                border: 1px solid #c7d2fe;
                background-color: #f5f3ff;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            `;
            const details = document.createElement('details');
            details.open = containsAudio(paperDescription);
            const summary = document.createElement('summary');
            summary.style.cssText = `
                padding: 16px 20px;
                font-size: 16px;
                font-weight: 600;
                color: #4338ca;
                cursor: pointer;
                list-style: none;
                display: flex;
                align-items: center;
                transition: background-color 0.2s ease;
            `;
            summary.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 12px; transition: transform 0.3s ease;">
                    <path d="M9 18l6-6-6-6"/>
                </svg>
                作业头部材料
            `;
            const summaryArrow = summary.querySelector('svg');
            details.addEventListener('toggle', () => {
                summaryArrow.style.transform = details.open ? 'rotate(90deg)' : 'rotate(0deg)';
            });
            const descriptionContent = document.createElement('div');
            descriptionContent.style.cssText = `
                padding: 20px;
                border-top: 1px solid #ddd6fe;
                line-height: 1.7;
                color: #374151;
                font-size: 15px;
            `;
            await setRichTextContent(descriptionContent, paperDescription);
            attachSttOnlyButtonListeners(descriptionContent);
            attachVideoSttButtonListeners(descriptionContent);
            details.appendChild(summary);
            details.appendChild(descriptionContent);
            descriptionContainer.appendChild(details);
            content.prepend(descriptionContainer);
        };
        renderQuestions().then(() => {
            renderPaperDescription().then(() => {
                renderTemporaryPromptUI();
                updateCurrentQuestionHighlight();
                requestAnimationFrame(() => {
                    overlay.style.opacity = '1';
                    modalContainer.style.transform = 'translate(-50%, -50%) scale(1)';
                    modalContainer.style.opacity = '1';
                });
            });
        });
    }
    async function exportHomework() {
        console.log('调用 exportHomework 函数');
        let storedData = localStorage.getItem('answerData');
        if (!storedData) {
            showNotification('未找到存储的数据，请先点击"获取答案"按钮。', {
                type: 'error',
                keywords: ['存储', '答案', '获取'],
                animation: 'fadeSlide'
            });
            return;
        }
        const answerData = JSON.parse(storedData);
        let assignmentTitle = localStorage.getItem('assignmentTitle') || '作业答案';
        const paperDescription = localStorage.getItem('paperDescription');
        const progress = createProgressBar();
        progress.show();
        try {
            const docContent = [];
            showNotification('开始导出作业，正在准备内容...', {
                type: 'info',
                keywords: ['导出', '准备'],
                animation: 'scale'
            });
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
            if (paperDescription && paperDescription !== '{}' && !isEmptyRichText(paperDescription)) {
                console.log('发现作业头部信息，开始处理并添加到文档...');
                progress.update(0, answerData.length, '正在处理头部信息');
                docContent.push(new Paragraph({
                    text: "作业说明 / 公共材料",
                    heading: HeadingLevel.HEADING_1,
                    style: "Heading1",
                    spacing: { before: 400, after: 200 },
                }));
                const descriptionParagraphs = await parseRichTextToParagraphs(paperDescription);
                docContent.push(...descriptionParagraphs);
                docContent.push(new Paragraph({
                    children: [new TextRun("__________________________________________________________")],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 600 },
                }));
                docContent.push(new Paragraph({
                    children: [new TextRun("__________________________________________________________")],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 600 },
                }));
            }
            for (let index = 0; index < answerData.length; index++) {
                try {
                    const question = answerData[index];
                    const questionNumber = `${index + 1}、`;
                    const titleRuns = await parseRichTextToRuns(question.title);
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
                                const options = question.answer_items.map((item, idx) => ({
                                    letter: String.fromCharCode(65 + idx),
                                    content: item.value,
                                }));
                                for (const option of options) {
                                    const optionRuns = await parseRichTextToRuns(option.content);
                                    docContent.push(new Paragraph({
                                        children: [
                                            new TextRun({ text: `${option.letter}. `, bold: true }),
                                            ...optionRuns,
                                        ],
                                    }));
                                }
                                const correctOptions = question.answer_items
                                    .map((item, idx) => (item.answer_checked === 2 ? String.fromCharCode(65 + idx) : null))
                                    .filter(Boolean)
                                    .join('');
                                docContent.push(new Paragraph({ text: `答案：${correctOptions}`, spacing: { before: 100, after: 100 } }));
                                if (question.description && question.description !== '{}' && !isEmptyRichText(question.description)) {
                                    docContent.push(new Paragraph({
                                        children: [new TextRun({ text: '解析：', bold: true })],
                                        spacing: { before: 100, after: 0 },
                                    }));
                                    const descriptionParagraphs = await parseRichTextToParagraphs(question.description);
                                    docContent.push(...descriptionParagraphs);
                                }
                                break;
                            }
                        case 5:
                            {
                                const isCorrect = question.answer_items.some(item => item.answer_checked === 2 && (item.value === '正确' || item.value.toLowerCase() === 'true'));
                                docContent.push(new Paragraph({ text: `答案：${isCorrect ? '对' : '错'}`, spacing: { before: 100, after: 100 } }));
                                if (question.description && question.description !== '{}' && !isEmptyRichText(question.description)) {
                                    const descriptionRuns = await parseRichTextToRuns(question.description);
                                    docContent.push(new Paragraph({
                                        children: [
                                            new TextRun({ text: '解析：', bold: true }),
                                            ...descriptionRuns,
                                        ],
                                        spacing: { before: 100, after: 100 },
                                    }));
                                }
                                break;
                            }
                        case 4:
                            {
                                let blanks = '（____）'.repeat(question.answer_items.length);
                                docContent.push(new Paragraph({ text: blanks, spacing: { before: 100, after: 100 } }));
                                const answers = question.answer_items.map(item => parseRichTextToPlainText(item.answer)).join(' | ');
                                docContent.push(new Paragraph({ text: `答案：${answers}`, spacing: { before: 100, after: 100 } }));
                                if (question.description && question.description !== '{}' && !isEmptyRichText(question.description)) {
                                    const descriptionRuns = await parseRichTextToRuns(question.description);
                                    docContent.push(new Paragraph({
                                        children: [
                                            new TextRun({ text: '解析：', bold: true }),
                                            ...descriptionRuns,
                                        ],
                                        spacing: { before: 100, after: 100 },
                                    }));
                                }
                                break;
                            }
                        case 6:
                            {
                                for (const item of question.answer_items) {
                                    const answerRuns = await parseRichTextToRuns(item.answer);
                                    docContent.push(new Paragraph({
                                        children: [
                                            new TextRun({ text: '答案：', bold: true }),
                                            ...answerRuns,
                                        ],
                                        spacing: { before: 100, after: 100 },
                                    }));
                                }
                                if (question.description && question.description !== '{}' && !isEmptyRichText(question.description)) {
                                    const descriptionRuns = await parseRichTextToRuns(question.description);
                                    docContent.push(new Paragraph({
                                        children: [
                                            new TextRun({ text: '解析：', bold: true }),
                                            ...descriptionRuns,
                                        ],
                                        spacing: { before: 100, after: 100 },
                                    }));
                                }
                                break;
                            }
                        case 9:
                            {
                                if (question.subQuestions && question.subQuestions.length > 0) {
                                    for (let subIndex = 0; subIndex < question.subQuestions.length; subIndex++) {
                                        const subQuestion = question.subQuestions[subIndex];
                                        const subQuestionNumber = `${index + 1}.${subIndex + 1}、`;
                                        const subTitleRuns = await parseRichTextToRuns(subQuestion.title);
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
                                                for (const [idx, item] of subQuestion.answer_items.entries()) {
                                                    const optionLetter = String.fromCharCode(65 + idx);
                                                    const optionRuns = await parseRichTextToRuns(item.value);
                                                    const optionParagraph = new Paragraph({
                                                        children: [
                                                            new TextRun({
                                                                text: `${optionLetter}. `,
                                                                bold: true,
                                                            }),
                                                            ...optionRuns,
                                                        ],
                                                    });
                                                    docContent.push(optionParagraph);
                                                }
                                                const correctOptions = subQuestion.answer_items
                                                    .map((item, idx) => item.answer_checked === 2 ? String.fromCharCode(65 + idx) : null)
                                                    .filter(item => item !== null)
                                                    .join('');
                                                docContent.push(
                                                    new Paragraph({
                                                        text: `答案：${correctOptions}`,
                                                        spacing: { before: 100, after: 100 },
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
                                            const descriptionRuns = await parseRichTextToRuns(subQuestion.description);
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
                        case 10:
                            {
                                docContent.push(
                                    new Paragraph({
                                        text: `语言：${question.program_setting?.language?.join(', ') || '未指定'}`,
                                        spacing: { before: 100, after: 100 },
                                    })
                                );
                                if (question.program_setting?.example_code) {
                                    docContent.push(
                                        new Paragraph({ text: "示例代码：", bold: true, spacing: { before: 100 } }),
                                        new Paragraph({ text: question.program_setting.example_code, style: "CodeStyle" })
                                    );
                                }
                                if (question.program_setting?.code_answer) {
                                    docContent.push(
                                        new Paragraph({ text: "答案代码：", bold: true, spacing: { before: 100 } }),
                                        new Paragraph({ text: question.program_setting.code_answer, style: "CodeStyle" })
                                    );
                                }
                                if (question.answer_items?.[0]?.answer) {
                                    try {
                                        const testCases = JSON.parse(question.answer_items[0].answer);
                                        if (Array.isArray(testCases) && testCases.length > 0) {
                                            docContent.push(new Paragraph({ text: "测试用例：", bold: true, spacing: { before: 100 } }));
                                            testCases.forEach((tc, i) => {
                                                docContent.push(new Paragraph({ text: `  用例 ${i + 1}:`, spacing: { before: 50 } }));
                                                docContent.push(new Paragraph({ text: `    输入: ${tc.in}`, style: "CodeStyle" }));
                                                docContent.push(new Paragraph({ text: `    输出: ${tc.out}`, style: "CodeStyle" }));
                                            });
                                        }
                                    } catch (e) {
                                        console.warn("解析测试用例失败:", e);
                                        docContent.push(new Paragraph({ text: `测试用例数据：${question.answer_items[0].answer}`, spacing: { before: 100 } }));
                                    }
                                }
                                if (question.description && question.description !== '{}' && !isEmptyRichText(question.description)) {
                                    const descriptionRuns = await parseRichTextToRuns(question.description);
                                    const descriptionParagraph = new Paragraph({
                                        children: [
                                            new TextRun({ text: '解析：', bold: true }),
                                            ...descriptionRuns,
                                        ],
                                        spacing: { before: 100, after: 100 },
                                    });
                                    docContent.push(descriptionParagraph);
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
                                    const optionRuns = await parseRichTextToRuns(option.content);
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
                                if (question.description && question.description !== '{}' && !isEmptyRichText(question.description)) {
                                    const descriptionRuns = await parseRichTextToRuns(question.description);
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
                                if (question.description && question.description !== '{}' && !isEmptyRichText(question.description)) {
                                    const descriptionRuns = await parseRichTextToRuns(question.description);
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
                                if (question.description && question.description !== '{}' && !isEmptyRichText(question.description)) {
                                    const descriptionRuns = await parseRichTextToRuns(question.description);
                                    docContent.push(new Paragraph({
                                        children: [
                                            new TextRun({ text: '解析：', bold: true }),
                                            ...descriptionRuns,
                                        ],
                                        spacing: { before: 100, after: 100 },
                                    }));
                                }
                                break;
                            }
                    }
                } catch (questionError) {
                    console.error(`处理第 ${index + 1} 题时发生错误:`, questionError, "题目数据:", answerData[index]);
                    docContent.push(new Paragraph({
                        children: [
                            new TextRun({ text: `${index + 1}、`, bold: true }),
                            new TextRun({
                                text: "处理此题时发生错误，已跳过。请打开浏览器控制台(F12)查看详细错误信息。",
                                color: "FF0000",
                                italics: true
                            })
                        ]
                    }));
                }
                progress.update(index + 1, answerData.length, '正在导出');
                docContent.push(new Paragraph({ text: "", spacing: { after: 200 } }));
            }
            console.log("所有题目处理完毕，准备生成文档...");
            progress.update(answerData.length, answerData.length, '正在生成文档');
            const doc = new Document({
                creator: "小雅答答答",
                description: `导出的作业答案 - ${assignmentTitle}`,
                title: assignmentTitle,
                styles: {
                    paragraphStyles: [
                        {
                            id: "Normal",
                            name: "Normal",
                            run: { font: "Microsoft YaHei", size: 24 },
                            paragraph: { spacing: { line: 360, before: 0, after: 0 } },
                        },
                        {
                            id: "Heading1",
                            name: "Heading 1",
                            basedOn: "Normal",
                            next: "Normal",
                            run: { font: "Microsoft YaHei", size: 32, bold: true },
                            paragraph: { spacing: { before: 240, after: 120 } },
                        },
                        {
                            id: "CodeStyle",
                            name: "Code Style",
                            basedOn: "Normal",
                            run: { font: "Consolas", size: 20 },
                            paragraph: {
                                indentation: { left: 400 },
                                spacing: { before: 100, after: 100 }
                            },
                        },
                    ],
                },
                sections: [
                    {
                        properties: {},
                        children: docContent,
                    },
                ],
            });
            const blob = await Packer.toBlob(doc);
            let safeTitle = assignmentTitle.replace(/[\\/:*?"<>|]/g, '_');
            window.saveAs(blob, `${safeTitle}.docx`);
            progress.hide();
            showNotification('作业导出成功,如需导入其他题库，请手动编辑保存一次以确保被准确识别。', {
                type: 'success',
                keywords: ['导出', '成功', '题库'],
                animation: 'fadeSlide'
            });
        } catch (error) {
            progress.hide();
            console.error('导出作业时发生严重错误 (非题目处理阶段):', error);
            showNotification('导出失败，请查看控制台日志以获取详细信息。', {
                type: 'error',
                keywords: ['导出', '失败', '日志'],
                animation: 'scale'
            });
        }
    }
    function mdEscape(text) {
        if (text == null) return '';
        const sanitized = String(text).replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '');
        return sanitized.replace(/([`*_{}\[\]()#+.!>])/g, '\\$1');
    }
    function normalizeInlineMath(tex) {
        const trimmed = (tex || '').trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
            const inner = trimmed.slice(2, -2).trim();
            return inner ? `$${inner}$` : '';
        }
        if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
            const inner = trimmed.slice(2, -2).trim();
            return inner ? `$${inner}$` : '';
        }
        if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length >= 2) {
            return trimmed;
        }
        return `$${trimmed}$`;
    }
    function normalizeDisplayMath(tex) {
        const trimmed = (tex || '').trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
            const inner = trimmed.slice(2, -2).trim();
            return inner ? `$$\n${inner}\n$$` : '';
        }
        if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
            const inner = trimmed.slice(2, -2).trim();
            return inner ? `$$\n${inner}\n$$` : '';
        }
        if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
            const inner = trimmed.slice(2, -2).trim();
            return inner ? `$$\n${inner}\n$$` : '';
        }
        return `$$\n${trimmed}\n$$`;
    }
    async function parseRichTextToMarkdown(content) {
        if (!content || typeof content !== 'string' || content === '{}' || isEmptyRichText(content)) {
            return '';
        }
        try {
            let jsonContent;
            try {
                jsonContent = JSON.parse(content);
            } catch (parseErr) {
                return mdEscape(String(content));
            }
            if (!jsonContent.blocks || !Array.isArray(jsonContent.blocks)) {
                return mdEscape(String(content));
            }
            const entityMap = jsonContent.entityMap || {};
            const parts = [];
            for (const block of jsonContent.blocks) {
                if (!block) continue;
                if (block.type === 'atomic' && block.data) {
                    const mathAtomic = getMathInfoFromAtomicBlock(block);
                    if (mathAtomic) {
                        const normalized = mathAtomic.display ? normalizeDisplayMath(mathAtomic.tex) : normalizeInlineMath(mathAtomic.tex);
                        if (normalized) {
                            parts.push(normalized);
                        }
                        continue;
                    }
                    if (block.data.type === 'IMAGE') {
                        const imageSrc = block.data.src;
                        const fileIdMatch = imageSrc && imageSrc.match(/.*cloud\/file_access\/(\d+)/);
                        if (fileIdMatch && fileIdMatch[1]) {
                            const fileId = fileIdMatch[1];
                            const randomParam = Date.now();
                            const imageUrl = `${window.location.origin}/api/jx-oresource/cloud/file_access/${fileId}?random=${randomParam}`;
                            parts.push(`![图片](${imageUrl})`);
                        } else {
                            parts.push('[无法解析图片链接]');
                        }
                        continue;
                    }
                    if (block.data.type === 'AUDIO' || block.data.type === 'VIDEO') {
                        let mediaUrl = null;
                        if (block.data.type === 'AUDIO' && block.data.data && block.data.data.quote_id) {
                            const fileId = block.data.data.quote_id;
                            const cacheKey = `audio_url_${fileId}`;
                            mediaUrl = sessionStorage.getItem(cacheKey);
                            if (!mediaUrl) {
                                mediaUrl = await getAudioUrl(fileId);
                                if (mediaUrl) sessionStorage.setItem(cacheKey, mediaUrl);
                            }
                        } else if (block.data.type === 'VIDEO' && block.data.data && block.data.data.video_id) {
                            const videoId = block.data.data.video_id;
                            const cacheKey = `video_urls_${videoId}`;
                            let urls = null;
                            try {
                                urls = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
                            } catch (err) {
                                urls = null;
                            }
                            if (!urls) {
                                urls = await getVideoUrl(videoId);
                                if (urls && urls.videoUrl) sessionStorage.setItem(cacheKey, JSON.stringify(urls));
                            }
                            mediaUrl = urls && urls.videoUrl ? urls.videoUrl : null;
                        }
                        if (!mediaUrl) {
                            const fallbackSrc = block.data.src || block.data.url || (block.data.data && (block.data.data.src || block.data.data.url));
                            if (fallbackSrc) {
                                const match = String(fallbackSrc).match(/.*cloud\/file_access\/(\d+)/);
                                if (match && match[1]) {
                                    const randomParam = Date.now();
                                    mediaUrl = `${window.location.origin}/api/jx-oresource/cloud/file_access/${match[1]}?random=${randomParam}`;
                                } else if (/^https?:\/\//i.test(String(fallbackSrc))) {
                                    mediaUrl = String(fallbackSrc);
                                }
                            }
                        }
                        const label = block.data.type === 'AUDIO' ? '音频' : '视频';
                        parts.push(mediaUrl ? `[${label}](${mediaUrl})` : `[${label}] 未提供可访问链接`);
                        continue;
                    }
                }
                const segments = extractSegmentsFromBlock(block, entityMap);
                if (!segments.length) {
                    continue;
                }
                const blockPieces = [];
                let inlineBuffer = '';
                if (block.type === 'unordered-list-item') {
                    inlineBuffer += '- ';
                } else if (block.type === 'ordered-list-item') {
                    inlineBuffer += '1. ';
                }
                segments.forEach(segment => {
                    switch (segment.type) {
                        case 'text':
                            inlineBuffer += mdEscape(segment.text);
                            break;
                        case 'inlineMath':
                            {
                                const normalized = normalizeInlineMath(segment.text);
                                if (normalized) {
                                    inlineBuffer += normalized;
                                }
                            }
                            break;
                        case 'displayMath':
                            if (inlineBuffer.trim().length > 0) {
                                blockPieces.push(inlineBuffer);
                                inlineBuffer = '';
                            }
                            {
                                const displayMath = normalizeDisplayMath(segment.text);
                                if (displayMath) {
                                    blockPieces.push(displayMath);
                                }
                            }
                            break;
                        case 'lineBreak':
                            inlineBuffer += '  \n';
                            break;
                        default:
                            break;
                    }
                });
                if (inlineBuffer.trim().length > 0 || /\S/.test(inlineBuffer)) {
                    blockPieces.push(inlineBuffer);
                }
                if (blockPieces.length > 0) {
                    parts.push(blockPieces.join('\n\n'));
                }
            }
            return parts.join('\n\n');
        } catch (e) {
            return mdEscape(String(content));
        }
    }
    async function exportHomeworkMarkdown() {
        console.log('调用 exportHomeworkMarkdown 函数');
        let storedData = localStorage.getItem('answerData');
        if (!storedData) {
            showNotification('未找到存储的数据，请先点击"获取答案"按钮。', {
                type: 'error',
                keywords: ['存储', '答案', '获取'],
                animation: 'fadeSlide'
            });
            return;
        }
        const answerData = JSON.parse(storedData);
        let assignmentTitle = localStorage.getItem('assignmentTitle') || '作业答案';
        const paperDescription = localStorage.getItem('paperDescription');
        const progress = createProgressBar();
        progress.show();
        try {
            const lines = [];
            showNotification('开始导出 Markdown，正在准备内容...', { type: 'info', animation: 'scale' });
            lines.push(`# ${mdEscape(assignmentTitle)}`);
            lines.push(`> 导出时间：${new Date().toLocaleString()}`);
            if (paperDescription && paperDescription !== '{}' && !isEmptyRichText(paperDescription)) {
                progress.update(0, answerData.length, '正在处理头部信息');
                lines.push('', '## 作业说明 / 公共材料');
                const descMd = await parseRichTextToMarkdown(paperDescription);
                if (descMd) lines.push(descMd, '', '---', '');
            }
            for (let index = 0; index < answerData.length; index++) {
                const q = answerData[index];
                const qNo = `${index + 1}`;
                const titlePlain = parseRichTextToPlainText(q.title);
                lines.push('', `### ${qNo}. ${mdEscape(titlePlain)}`);
                const titleMdFull = await parseRichTextToMarkdown(q.title);
                if (titleMdFull && titleMdFull.trim() !== mdEscape(titlePlain).trim()) {
                    lines.push(titleMdFull);
                }
                switch (q.type) {
                    case 1:
                    case 2: {
                        const options = q.answer_items.map((item, idx) => ({
                            letter: String.fromCharCode(65 + idx),
                            content: item.value,
                        }));
                        for (const opt of options) {
                            const md = await parseRichTextToMarkdown(opt.content);
                            const mdLines = (md || '').split(/\r?\n/);
                            lines.push(`- ${opt.letter}. ${mdLines[0] || ''}`);
                            if (mdLines.length > 1) lines.push(...mdLines.slice(1).map(l => `  ${l}`));
                        }
                        const correct = q.answer_items
                            .map((item, idx) => (item.answer_checked === 2 ? String.fromCharCode(65 + idx) : null))
                            .filter(Boolean)
                            .join('');
                        lines.push(``, `答案：${correct}`);
                        if (q.description && q.description !== '{}' && !isEmptyRichText(q.description)) {
                            const d = await parseRichTextToMarkdown(q.description);
                            if (d) {
                                lines.push('> 解析：');
                                d.split(/\r?\n/).forEach(l => lines.push(`> ${l}`));
                            }
                        }
                        break;
                    }
                    case 5: {
                        const isCorrect = q.answer_items.some(item => item.answer_checked === 2 && (item.value === '正确' || String(item.value).toLowerCase() === 'true'));
                        lines.push(``, `答案：${isCorrect ? '对' : '错'}`);
                        if (q.description && q.description !== '{}' && !isEmptyRichText(q.description)) {
                            const d = await parseRichTextToMarkdown(q.description);
                            if (d) {
                                lines.push('> 解析：');
                                d.split(/\r?\n/).forEach(l => lines.push(`> ${l}`));
                            }
                        }
                        break;
                    }
                    case 4: {
                        const blanks = '（____）'.repeat(q.answer_items.length);
                        lines.push(blanks);
                        const answers = q.answer_items.map(item => mdEscape(parseRichTextToPlainText(item.answer))).join(' | ');
                        lines.push(`答案：${answers}`);
                        if (q.description && q.description !== '{}' && !isEmptyRichText(q.description)) {
                            const d = await parseRichTextToMarkdown(q.description);
                            if (d) {
                                lines.push('> 解析：');
                                d.split(/\r?\n/).forEach(l => lines.push(`> ${l}`));
                            }
                        }
                        break;
                    }
                    case 6: {
                        for (const item of q.answer_items) {
                            const a = await parseRichTextToMarkdown(item.answer);
                            if (a) {
                                lines.push('答案：');
                                lines.push(a);
                            }
                        }
                        if (q.description && q.description !== '{}' && !isEmptyRichText(q.description)) {
                            const d = await parseRichTextToMarkdown(q.description);
                            if (d) {
                                lines.push('> 解析：');
                                d.split(/\r?\n/).forEach(l => lines.push(`> ${l}`));
                            }
                        }
                        break;
                    }
                    case 9: {
                        if (q.subQuestions && q.subQuestions.length > 0) {
                            for (let si = 0; si < q.subQuestions.length; si++) {
                                const sq = q.subQuestions[si];
                                lines.push('', `#### ${index + 1}.${si + 1}`);
                                const stPlain = parseRichTextToPlainText(sq.title);
                                lines.push(mdEscape(stPlain));
                                const stMd = await parseRichTextToMarkdown(sq.title);
                                if (stMd && stMd.trim() !== mdEscape(stPlain).trim()) {
                                    lines.push(stMd);
                                }
                                switch (sq.type) {
                                    case 1:
                                    case 2: {
                                        for (const [idx, item] of sq.answer_items.entries()) {
                                            const letter = String.fromCharCode(65 + idx);
                                            const md = await parseRichTextToMarkdown(item.value);
                                            const mdLines = (md || '').split(/\r?\n/);
                                            lines.push(`- ${letter}. ${mdLines[0] || ''}`);
                                            if (mdLines.length > 1) lines.push(...mdLines.slice(1).map(l => `  ${l}`));
                                        }
                                        const correct = sq.answer_items
                                            .map((item, idx) => (item.answer_checked === 2 ? String.fromCharCode(65 + idx) : null))
                                            .filter(Boolean)
                                            .join('');
                                        lines.push(`答案：${correct}`);
                                        break;
                                    }
                                    case 4: {
                                        const blanks = '（____）'.repeat(sq.answer_items.length);
                                        lines.push(blanks);
                                        const answers = sq.answer_items.map(item => mdEscape(parseRichTextToPlainText(item.answer))).join('|');
                                        lines.push(`答案：${answers}`);
                                        break;
                                    }
                                    case 5: {
                                        const isCorrect = sq.answer_items.some(item => item.answer_checked === 2 && (item.value === '正确' || String(item.value).toLowerCase() === 'true'));
                                        lines.push(`答案：${isCorrect ? '对' : '错'}`);
                                        break;
                                    }
                                    case 6: {
                                        const answers = sq.answer_items.map(item => mdEscape(parseRichTextToPlainText(item.answer))).join('；');
                                        lines.push(`答案：${answers}`);
                                        break;
                                    }
                                }
                                if (sq.description && sq.description !== '{}') {
                                    const d = await parseRichTextToMarkdown(sq.description);
                                    if (d) {
                                        lines.push('> 解析：');
                                        d.split(/\r?\n/).forEach(l => lines.push(`> ${l}`));
                                    }
                                }
                            }
                        }
                        break;
                    }
                    case 10: {
                        const lang = (q.program_setting?.language?.[0] || '').toLowerCase();
                        if (lang) lines.push(`语言：${lang}`);
                        if (q.program_setting?.example_code) {
                            lines.push('示例代码：', '```' + lang, q.program_setting.example_code, '```');
                        }
                        if (q.program_setting?.code_answer) {
                            lines.push('答案代码：', '```' + lang, q.program_setting.code_answer, '```');
                        }
                        if (q.answer_items?.[0]?.answer) {
                            try {
                                const tcs = JSON.parse(q.answer_items[0].answer);
                                if (Array.isArray(tcs) && tcs.length > 0) {
                                    lines.push('测试用例：');
                                    tcs.forEach((tc, i) => {
                                        lines.push(`- 用例 ${i + 1}:`);
                                        lines.push(`  - 输入: ${tc.in}`);
                                        lines.push(`  - 输出: ${tc.out}`);
                                    });
                                }
                            } catch (e) {
                                lines.push(`测试用例数据：${q.answer_items[0].answer}`);
                            }
                        }
                        if (q.description && q.description !== '{}' && !isEmptyRichText(q.description)) {
                            const d = await parseRichTextToMarkdown(q.description);
                            if (d) {
                                lines.push('> 解析：');
                                d.split(/\r?\n/).forEach(l => lines.push(`> ${l}`));
                            }
                        }
                        break;
                    }
                    case 12: {
                        const options = q.answer_items.map((item, idx) => ({
                            letter: String.fromCharCode(65 + idx),
                            content: item.value,
                            originalIndex: idx,
                        }));
                        for (const opt of options) {
                            const md = await parseRichTextToMarkdown(opt.content);
                            const mdLines = (md || '').split(/\r?\n/);
                            lines.push(`- ${opt.letter}. ${mdLines[0] || ''}`);
                            if (mdLines.length > 1) lines.push(...mdLines.slice(1).map(l => `  ${l}`));
                        }
                        const sorted = q.answer_items.slice().sort((a, b) => parseInt(a.answer) - parseInt(b.answer));
                        const answerLetters = sorted.map(item => String.fromCharCode(65 + q.answer_items.indexOf(item))).join('');
                        lines.push(`答案：${answerLetters}`);
                        if (q.description && q.description !== '{}' && !isEmptyRichText(q.description)) {
                            const d = await parseRichTextToMarkdown(q.description);
                            if (d) {
                                lines.push('> 解析：');
                                d.split(/\r?\n/).forEach(l => lines.push(`> ${l}`));
                            }
                        }
                        break;
                    }
                    case 13: {
                        const leftItems = q.answer_items.filter(item => !item.is_target_opt);
                        const rightItems = q.answer_items.filter(item => item.is_target_opt);
                        lines.push('左侧选项：');
                        for (let i = 0; i < leftItems.length; i++) {
                            const leftContent = parseRichTextToPlainText(leftItems[i].value);
                            lines.push(`- 左${i + 1}：${mdEscape(leftContent)}`);
                        }
                        lines.push('右侧选项：');
                        for (let i = 0; i < rightItems.length; i++) {
                            const rightContent = parseRichTextToPlainText(rightItems[i].value);
                            lines.push(`- 右${i + 1}：${mdEscape(rightContent)}`);
                        }
                        const answerText = leftItems.map((leftItem, leftIndex) => {
                            const leftLabel = `左${leftIndex + 1}`;
                            const matchedRightIds = leftItem.answer ? leftItem.answer.toString().split(',') : [];
                            const matched = matchedRightIds.map((id) => {
                                const rIndex = rightItems.findIndex(item => item.id === id);
                                return rIndex >= 0 ? `右${rIndex + 1}` : '';
                            }).filter(Boolean).join('、');
                            return `${leftLabel} - ${matched}`;
                        }).join('|');
                        lines.push(`答案：${answerText}`);
                        if (q.description && q.description !== '{}' && !isEmptyRichText(q.description)) {
                            const d = await parseRichTextToMarkdown(q.description);
                            if (d) {
                                lines.push('> 解析：');
                                d.split(/\r?\n/).forEach(l => lines.push(`> ${l}`));
                            }
                        }
                        break;
                    }
                    default: {
                        lines.push('该题型暂不支持查看答案。');
                        if (q.description && q.description !== '{}' && !isEmptyRichText(q.description)) {
                            const d = await parseRichTextToMarkdown(q.description);
                            if (d) {
                                lines.push('> 解析：');
                                d.split(/\r?\n/).forEach(l => lines.push(`> ${l}`));
                            }
                        }
                        break;
                    }
                }
                progress.update(index + 1, answerData.length, '正在导出(MD)');
            }
            const md = lines.join('\n');
            const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
            let safeTitle = (assignmentTitle || '作业答案').replace(/[\\\/:*?"<>|]/g, '_');
            window.saveAs(blob, `${safeTitle}.md`);
            progress.hide();
            showNotification('Markdown 导出成功。', { type: 'success', animation: 'fadeSlide' });
        } catch (error) {
            progress.hide();
            console.error('导出 Markdown 时发生错误:', error);
            showNotification('导出 Markdown 失败，请查看控制台日志。', { type: 'error', animation: 'scale' });
        }
    }
    function extractTexContent(source) {
        if (!source) return '';
        if (typeof source === 'string') return source;
        if (typeof source === 'object') {
            return source.teX || source.tex || source.value || source.content || '';
        }
        return '';
    }
    function isInlineMathEntity(type) {
        const normalized = (type || '').toUpperCase();
        return normalized === 'INLINETEX' || normalized === 'INLINE_TEX' || normalized === 'TEX';
    }
    function isDisplayMathEntity(type) {
        const normalized = (type || '').toUpperCase();
        return normalized === 'BLOCKTEX' || normalized === 'TEXBLOCK' || normalized === 'DISPLAYTEX';
    }
    function getMathInfoFromEntity(entity) {
        if (!entity) return null;
        const mathPayload = extractTexContent(entity.data) || extractTexContent(entity.data?.data);
        if (!mathPayload) return null;
        if (isInlineMathEntity(entity.type)) {
            return { tex: mathPayload, display: false };
        }
        if (isDisplayMathEntity(entity.type)) {
            return { tex: mathPayload, display: true };
        }
        return null;
    }
    function getMathInfoFromAtomicBlock(block) {
        if (!block || !block.data) return null;
        const type = (block.data.type || '').toUpperCase();
        if (!type) return null;
        if (type === 'MATH' || type === 'TEX' || type === 'TEXBLOCK' || type === 'DISPLAYTEX') {
            const tex = extractTexContent(block.data) || extractTexContent(block.data.data);
            if (!tex) return null;
            return { tex, display: true };
        }
        if (type === 'INLINETEX' || type === 'INLINE_TEX') {
            const tex = extractTexContent(block.data) || extractTexContent(block.data.data);
            if (!tex) return null;
            return { tex, display: false };
        }
        return null;
    }
    function extractSegmentsFromBlock(block, entityMap) {
        const segments = [];
        const text = typeof block.text === 'string' ? block.text : '';
        const breakpoints = new Set([0, text.length]);
        const zeroLengthMathRanges = [];
        if (Array.isArray(block.entityRanges)) {
            block.entityRanges.forEach(range => {
                if (!range || typeof range.offset !== 'number' || typeof range.length !== 'number') return;
                breakpoints.add(range.offset);
                breakpoints.add(range.offset + range.length);
                if (range.length === 0) {
                    zeroLengthMathRanges.push(range);
                }
            });
        }
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '\n') {
                breakpoints.add(i);
                breakpoints.add(i + 1);
            }
        }
        const sortedBreakpoints = Array.from(breakpoints)
            .filter(index => index >= 0 && index <= text.length)
            .sort((a, b) => a - b);
        for (let i = 0; i < sortedBreakpoints.length - 1; i++) {
            const start = sortedBreakpoints[i];
            const end = sortedBreakpoints[i + 1];
            if (start >= end) continue;
            const segmentText = text.slice(start, end);
            if (!segmentText) continue;
            if (segmentText === '\n') {
                segments.push({ type: 'lineBreak' });
                continue;
            }
            const entity = findEntityCoveringRange(block.entityRanges || [], start, end, entityMap);
            const mathInfo = getMathInfoFromEntity(entity);
            if (mathInfo) {
                segments.push({ type: mathInfo.display ? 'displayMath' : 'inlineMath', text: mathInfo.tex });
                continue;
            }
            const sanitized = segmentText.replace(/[\x00-\x1F\x7F]/g, '');
            if (sanitized) {
                segments.push({ type: 'text', text: sanitized });
            }
        }
        zeroLengthMathRanges.forEach(range => {
            const entity = getEntityByKey(entityMap, range.key);
            const mathInfo = getMathInfoFromEntity(entity);
            if (mathInfo) {
                segments.push({ type: mathInfo.display ? 'displayMath' : 'inlineMath', text: mathInfo.tex });
            }
        });
        return segments;
    }
    async function parseRichTextToParagraphs(content) {
        if (!content || typeof content !== 'string' || content === '{}' || isEmptyRichText(content)) {
            return [];
        }
        const paragraphs = [];
        try {
            let jsonContent;
            try {
                jsonContent = JSON.parse(content);
            } catch (parseError) {
                const sanitizedContent = content.replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '');
                if (sanitizedContent) {
                    paragraphs.push(new Paragraph({
                        children: [new TextRun({ text: sanitizedContent, font: "Microsoft YaHei" })],
                    }));
                }
                return paragraphs;
            }
            if (!jsonContent.blocks || !Array.isArray(jsonContent.blocks)) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: content, font: "Microsoft YaHei" })],
                }));
                return paragraphs;
            }
            const entityMap = jsonContent.entityMap || {};
            for (const block of jsonContent.blocks) {
                if (!block) continue;
                if (block.type === 'atomic' && block.data) {
                    const mathAtomic = getMathInfoFromAtomicBlock(block);
                    if (mathAtomic) {
                        const mathImage = await createLatexImageRun(mathAtomic.tex, mathAtomic.display);
                        if (mathImage) {
                            paragraphs.push(new Paragraph({
                                children: [mathImage],
                                alignment: mathAtomic.display ? AlignmentType.CENTER : AlignmentType.LEFT,
                            }));
                        } else {
                            paragraphs.push(new Paragraph({
                                children: [new TextRun({
                                    text: mathAtomic.display ? `\\[${mathAtomic.tex}\\]` : `\\(${mathAtomic.tex}\\)`,
                                    font: "Cambria Math"
                                })],
                                alignment: mathAtomic.display ? AlignmentType.CENTER : AlignmentType.LEFT,
                            }));
                        }
                        continue;
                    }
                    if (block.data.type === 'IMAGE') {
                        const imageSrc = block.data.src;
                        const fileIdMatch = imageSrc && imageSrc.match(/.*cloud\/file_access\/(\d+)/);
                        if (fileIdMatch && fileIdMatch[1]) {
                            const fileId = fileIdMatch[1];
                            const randomParam = Date.now();
                            const imageUrl = `${window.location.origin}/api/jx-oresource/cloud/file_access/${fileId}?random=${randomParam}`;
                            const imageData = await fetchImageData(imageUrl);
                            if (imageData) {
                                const imageSize = await getImageSize(imageData);
                                if (imageSize) {
                                    let { width, height } = imageSize;
                                    const maxWidth = 450;
                                    if (width > maxWidth) {
                                        const ratio = maxWidth / width;
                                        width = maxWidth;
                                        height = height * ratio;
                                    }
                                    paragraphs.push(new Paragraph({
                                        children: [new ImageRun({ data: imageData, transformation: { width, height } })],
                                        alignment: AlignmentType.CENTER,
                                    }));
                                } else {
                                    paragraphs.push(new Paragraph({ text: '[图片加载失败]' }));
                                }
                            } else {
                                paragraphs.push(new Paragraph({ text: '[图片加载失败]' }));
                            }
                        } else {
                            paragraphs.push(new Paragraph({ text: '[无法解析图片链接]' }));
                        }
                        continue;
                    }
                    if (block.data.type === 'AUDIO' || block.data.type === 'VIDEO') {
                        let mediaUrl = null;
                        if (block.data.type === 'AUDIO' && block.data.data && block.data.data.quote_id) {
                            const fileId = block.data.data.quote_id;
                            const cacheKey = `audio_url_${fileId}`;
                            mediaUrl = sessionStorage.getItem(cacheKey);
                            if (!mediaUrl) {
                                mediaUrl = await getAudioUrl(fileId);
                                if (mediaUrl) sessionStorage.setItem(cacheKey, mediaUrl);
                            }
                        } else if (block.data.type === 'VIDEO' && block.data.data && block.data.data.video_id) {
                            const videoId = block.data.data.video_id;
                            const cacheKey = `video_urls_${videoId}`;
                            let urls = null;
                            try {
                                urls = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
                            } catch (err) {
                                urls = null;
                            }
                            if (!urls) {
                                urls = await getVideoUrl(videoId);
                                if (urls && urls.videoUrl) sessionStorage.setItem(cacheKey, JSON.stringify(urls));
                            }
                            mediaUrl = urls && urls.videoUrl ? urls.videoUrl : null;
                        }
                        if (!mediaUrl) {
                            const fallbackSrc = block.data.src || block.data.url || (block.data.data && (block.data.data.src || block.data.data.url));
                            if (fallbackSrc) {
                                const match = String(fallbackSrc).match(/.*cloud\/file_access\/(\d+)/);
                                if (match && match[1]) {
                                    const randomParam = Date.now();
                                    mediaUrl = `${window.location.origin}/api/jx-oresource/cloud/file_access/${match[1]}?random=${randomParam}`;
                                } else if (/^https?:\/\//i.test(String(fallbackSrc))) {
                                    mediaUrl = String(fallbackSrc);
                                }
                            }
                        }
                        const label = block.data.type === 'AUDIO' ? '音频' : '视频';
                        if (mediaUrl) {
                            paragraphs.push(new Paragraph({
                                children: [
                                    new TextRun({ text: `[${label}] `, bold: true }),
                                    createDocxHyperlink(mediaUrl)
                                ]
                            }));
                        } else {
                            const idHint = block.data.data && (block.data.data.quote_id || block.data.data.id) ? ` (ID: ${block.data.data.quote_id || block.data.data.id})` : '';
                            paragraphs.push(new Paragraph({ text: `[${label}] 未提供可访问链接${idHint}` }));
                        }
                        continue;
                    }
                }
                const segments = extractSegmentsFromBlock(block, entityMap);
                if (!segments.length) {
                    continue;
                }
                let currentRuns = [];
                const flushCurrentParagraph = () => {
                    if (currentRuns.length === 0) return;
                    paragraphs.push(new Paragraph({ children: currentRuns }));
                    currentRuns = [];
                };
                if (block.type === 'unordered-list-item') {
                    currentRuns.push(new TextRun({ text: '• ', font: "Microsoft YaHei", eastAsia: "Microsoft YaHei" }));
                } else if (block.type === 'ordered-list-item') {
                    currentRuns.push(new TextRun({ text: '1. ', font: "Microsoft YaHei", eastAsia: "Microsoft YaHei" }));
                }
                for (const segment of segments) {
                    switch (segment.type) {
                        case 'text':
                            currentRuns.push(new TextRun({ text: segment.text, font: "Microsoft YaHei", eastAsia: "Microsoft YaHei" }));
                            break;
                        case 'inlineMath': {
                            const mathImage = await createLatexImageRun(segment.text, false);
                            if (mathImage) {
                                currentRuns.push(mathImage);
                            } else {
                                currentRuns.push(new TextRun({ text: `\\(${segment.text}\\)`, font: "Cambria Math" }));
                            }
                            break;
                        }
                        case 'displayMath': {
                            flushCurrentParagraph();
                            const mathImage = await createLatexImageRun(segment.text, true);
                            if (mathImage) {
                                paragraphs.push(new Paragraph({
                                    children: [mathImage],
                                    alignment: AlignmentType.CENTER,
                                }));
                            } else {
                                paragraphs.push(new Paragraph({
                                    children: [new TextRun({ text: `\\[${segment.text}\\]`, font: "Cambria Math" })],
                                    alignment: AlignmentType.CENTER,
                                }));
                            }
                            break;
                        }
                        case 'lineBreak':
                            currentRuns.push(new TextRun({ break: 1 }));
                            break;
                        default:
                            break;
                    }
                }
                flushCurrentParagraph();
            }
        } catch (e) {
            console.error("解析富文本到段落时出错:", e, "原始内容:", content);
            const sanitizedContent = content.replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '');
            if (sanitizedContent) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: `[解析错误] ${sanitizedContent}`, font: "Microsoft YaHei" })],
                }));
            }
        }
        return paragraphs;
    }
    async function parseRichTextToRuns(content) {
        if (!content || typeof content !== 'string' || content === '{}' || isEmptyRichText(content)) {
            return [];
        }
        const runs = [];
        try {
            let jsonContent;
            try {
                jsonContent = JSON.parse(content);
            } catch (parseErr) {
                const sanitized = content.replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '');
                if (sanitized) {
                    runs.push(new TextRun({ text: sanitized, font: "Microsoft YaHei", eastAsia: "Microsoft YaHei" }));
                }
                return runs;
            }
            if (!jsonContent.blocks || !Array.isArray(jsonContent.blocks)) {
                const sanitized = String(content).replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '');
                if (sanitized) {
                    runs.push(new TextRun({ text: sanitized, font: "Microsoft YaHei", eastAsia: "Microsoft YaHei" }));
                }
                return runs;
            }
            const entityMap = jsonContent.entityMap || {};
            let isFirstBlock = true;
            for (const block of jsonContent.blocks) {
                if (!block) continue;
                const prependLineBreak = () => {
                    if (!isFirstBlock) {
                        runs.push(new TextRun({ break: 1 }));
                    }
                    isFirstBlock = false;
                };
                if (block.type === 'atomic' && block.data) {
                    const mathAtomic = getMathInfoFromAtomicBlock(block);
                    if (mathAtomic) {
                        prependLineBreak();
                        const mathImage = await createLatexImageRun(mathAtomic.tex, mathAtomic.display);
                        if (mathImage) {
                            runs.push(mathImage);
                        } else {
                            runs.push(new TextRun({
                                text: mathAtomic.display ? `\\[${mathAtomic.tex}\\]` : `\\(${mathAtomic.tex}\\)`,
                                font: "Cambria Math"
                            }));
                        }
                        continue;
                    }
                    if (block.data.type === 'IMAGE') {
                        prependLineBreak();
                        const imageSrc = block.data.src;
                        const fileIdMatch = imageSrc && imageSrc.match(/.*cloud\/file_access\/(\d+)/);
                        if (fileIdMatch && fileIdMatch[1]) {
                            const fileId = fileIdMatch[1];
                            const randomParam = Date.now();
                            const imageUrl = `${window.location.origin}/api/jx-oresource/cloud/file_access/${fileId}?random=${randomParam}`;
                            const imageData = await fetchImageData(imageUrl);
                            if (imageData) {
                                const imageSize = await getImageSize(imageData);
                                if (imageSize) {
                                    let { width, height } = imageSize;
                                    const maxWidth = 450;
                                    if (width > maxWidth) {
                                        const ratio = maxWidth / width;
                                        width = maxWidth;
                                        height = height * ratio;
                                    }
                                    runs.push(new ImageRun({ data: imageData, transformation: { width, height } }));
                                } else {
                                    runs.push(new TextRun({ text: '[图片加载失败]' }));
                                }
                            } else {
                                runs.push(new TextRun({ text: '[图片加载失败]' }));
                            }
                        } else {
                            runs.push(new TextRun({ text: '[无法解析图片链接]' }));
                        }
                        continue;
                    }
                    if (block.data.type === 'AUDIO' || block.data.type === 'VIDEO') {
                        prependLineBreak();
                        let mediaUrl = null;
                        if (block.data.type === 'AUDIO' && block.data.data && block.data.data.quote_id) {
                            const fileId = block.data.data.quote_id;
                            const cacheKey = `audio_url_${fileId}`;
                            mediaUrl = sessionStorage.getItem(cacheKey);
                            if (!mediaUrl) {
                                mediaUrl = await getAudioUrl(fileId);
                                if (mediaUrl) sessionStorage.setItem(cacheKey, mediaUrl);
                            }
                        } else if (block.data.type === 'VIDEO' && block.data.data && block.data.data.video_id) {
                            const videoId = block.data.data.video_id;
                            const cacheKey = `video_urls_${videoId}`;
                            let urls = null;
                            try {
                                urls = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
                            } catch (err) {
                                urls = null;
                            }
                            if (!urls) {
                                urls = await getVideoUrl(videoId);
                                if (urls && urls.videoUrl) sessionStorage.setItem(cacheKey, JSON.stringify(urls));
                            }
                            mediaUrl = urls && urls.videoUrl ? urls.videoUrl : null;
                        }
                        if (!mediaUrl) {
                            const fallbackSrc = block.data.src || block.data.url || (block.data.data && (block.data.data.src || block.data.data.url));
                            if (fallbackSrc) {
                                const match = String(fallbackSrc).match(/.*cloud\/file_access\/(\d+)/);
                                if (match && match[1]) {
                                    const randomParam = Date.now();
                                    mediaUrl = `${window.location.origin}/api/jx-oresource/cloud/file_access/${match[1]}?random=${randomParam}`;
                                } else if (/^https?:\/\//i.test(String(fallbackSrc))) {
                                    mediaUrl = String(fallbackSrc);
                                }
                            }
                        }
                        const label = block.data.type === 'AUDIO' ? '音频' : '视频';
                        if (mediaUrl) {
                            runs.push(new TextRun({ text: `[${label}] `, bold: true }));
                            runs.push(createDocxHyperlink(mediaUrl));
                        } else {
                            const idHint = block.data.data && (block.data.data.quote_id || block.data.data.id) ? ` (ID: ${block.data.data.quote_id || block.data.data.id})` : '';
                            runs.push(new TextRun({ text: `[${label}] 未提供可访问链接${idHint}` }));
                        }
                        continue;
                    }
                }
                const segments = extractSegmentsFromBlock(block, entityMap);
                if (!segments.length) {
                    prependLineBreak();
                    continue;
                }
                prependLineBreak();
                if (block.type === 'unordered-list-item') {
                    runs.push(new TextRun({ text: '• ', font: "Microsoft YaHei", eastAsia: "Microsoft YaHei" }));
                } else if (block.type === 'ordered-list-item') {
                    runs.push(new TextRun({ text: '1. ', font: "Microsoft YaHei", eastAsia: "Microsoft YaHei" }));
                }
                for (const segment of segments) {
                    switch (segment.type) {
                        case 'text':
                            runs.push(new TextRun({ text: segment.text, font: "Microsoft YaHei", eastAsia: "Microsoft YaHei" }));
                            break;
                        case 'inlineMath': {
                            const mathImage = await createLatexImageRun(segment.text, false);
                            if (mathImage) {
                                runs.push(mathImage);
                            } else {
                                runs.push(new TextRun({ text: `\\(${segment.text}\\)`, font: "Cambria Math" }));
                            }
                            break;
                        }
                        case 'displayMath': {
                            const mathImage = await createLatexImageRun(segment.text, true);
                            if (mathImage) {
                                runs.push(mathImage);
                            } else {
                                runs.push(new TextRun({ text: `\\[${segment.text}\\]`, font: "Cambria Math" }));
                            }
                            break;
                        }
                        case 'lineBreak':
                            runs.push(new TextRun({ break: 1 }));
                            break;
                        default:
                            break;
                    }
                }
            }
        } catch (e) {
            console.error("解析富文本到行内Runs时出错:", e, "原始内容:", content);
            const sanitized = String(content).replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '');
            if (sanitized) {
                runs.push(new TextRun({ text: sanitized, font: "Microsoft YaHei", eastAsia: "Microsoft YaHei" }));
            }
        }
        return runs;
    }
    function parseRichTextToPlainText(content) {
        if (!content) return '';
        try {
            const jsonContent = JSON.parse(content);
            if (!jsonContent || !Array.isArray(jsonContent.blocks)) {
                return String(content).trim();
            }
            const entityMap = jsonContent.entityMap || {};
            let activeListType = null;
            let orderedListCounter = 0;
            const resultParts = [];
            const closeList = () => {
                if (activeListType) {
                    resultParts.push('');
                    activeListType = null;
                    orderedListCounter = 0;
                }
            };
            jsonContent.blocks.forEach(block => {
                if (!block) return;
                const blockType = block.type || 'unstyled';
                if (blockType === 'atomic') {
                    closeList();
                    const dataType = (block.data?.type || '').toUpperCase();
                    if (dataType === 'IMAGE' && block.data?.src) {
                        const fileIdMatch = block.data.src.match(/file_access\/(\d+)/);
                        resultParts.push(fileIdMatch ? `[图片:${fileIdMatch[1]}]` : '[图片]');
                    } else if (dataType === 'VIDEO' && block.data?.data?.video_id) {
                        resultParts.push(`[视频:${block.data.data.video_id}]`);
                    } else if (dataType === 'AUDIO' && block.data?.data?.quote_id) {
                        resultParts.push(`[音频:${block.data.data.quote_id}]`);
                    }
                    return;
                }
                const inlineHtml = buildInlineHtml(block, entityMap) || '';
                const plainText = htmlToPlainText(inlineHtml);
                switch (blockType) {
                    case 'unordered-list-item':
                        if (activeListType !== 'unordered-list-item') {
                            closeList();
                            activeListType = 'unordered-list-item';
                        }
                        resultParts.push(`- ${plainText}`);
                        break;
                    case 'ordered-list-item':
                        if (activeListType !== 'ordered-list-item') {
                            closeList();
                            activeListType = 'ordered-list-item';
                            orderedListCounter = 1;
                        } else {
                            orderedListCounter += 1;
                        }
                        resultParts.push(`${orderedListCounter}. ${plainText}`);
                        break;
                    case 'header-one':
                    case 'header-two':
                    case 'header-three':
                    case 'header-four':
                    case 'blockquote':
                    case 'code-block':
                    default:
                        closeList();
                        resultParts.push(plainText);
                        break;
                }
            });
            return resultParts
                .filter(segment => segment !== undefined && segment !== null)
                .map(segment => String(segment).trim())
                .filter(segment => segment !== '')
                .join('\n')
                .trim();
        } catch (e) {
            return String(content).trim();
        }
    }
    function deepParseJsonString(str) {
        if (typeof str !== 'string' || str.trim() === '') {
            return str;
        }
        try {
            const parsed = JSON.parse(str);
            if (typeof parsed === 'string') {
                return deepParseJsonString(parsed);
            }
            if (typeof parsed === 'object' && parsed !== null) {
                if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0 && parsed.blocks[0].text) {
                    const innerText = parsed.blocks[0].text;
                    if (typeof innerText === 'string' && innerText.startsWith('{') && innerText.endsWith('}')) {
                        return deepParseJsonString(innerText);
                    }
                }
            }
            return parsed;
        } catch (e) {
            return str;
        }
    }
    function htmlToPlainText(htmlString) {
        if (!htmlString) return '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
        const textContent = tempDiv.textContent || tempDiv.innerText || '';
        return textContent
            .replace(/\u00a0/g, ' ')
            .replace(/\s+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    async function parseRichTextToMultimodalContent(richTextContent) {
        const content = [];
        if (!richTextContent || richTextContent === '{}') return content;
        try {
            const jsonContent = JSON.parse(richTextContent);
            if (!jsonContent || !Array.isArray(jsonContent.blocks)) {
                content.push({ type: 'text', text: String(richTextContent) });
                return content;
            }
            const entityMap = jsonContent.entityMap || {};
            for (const block of jsonContent.blocks) {
                if (block.type === 'atomic' && block.data?.type === 'IMAGE' && block.data.src) {
                    let imageSrc = block.data.src;
                    let fileIdMatch = imageSrc.match(/.*cloud\/file_access\/(\d+)/);
                    if (fileIdMatch && fileIdMatch[1]) {
                        let fileId = fileIdMatch[1];
                        let randomParam = Date.now();
                        let imageUrl = `${window.location.origin}/api/jx-oresource/cloud/file_access/${fileId}?random=${randomParam}`;
                        const base64Data = await imageToBase64(imageUrl);
                        if (base64Data) {
                            content.push({ type: 'image_url', image_url: { url: base64Data } });
                        } else {
                            content.push({ type: 'text', text: '[图片加载失败]' });
                        }
                    } else {
                        console.warn('[Vision] 无法从src中解析出图片fileId:', imageSrc);
                        content.push({ type: 'text', text: '[无法解析图片链接]' });
                    }
                    continue;
                }
                const singleBlockContent = {
                    blocks: [block],
                    entityMap
                };
                let parsedText = '';
                try {
                    const blockHtml = await parseRichTextContentAsync(JSON.stringify(singleBlockContent));
                    parsedText = htmlToPlainText(blockHtml);
                } catch (error) {
                    console.warn('[富文本解析] 转换块为文本时出错，使用原始文本回退。', error);
                    parsedText = String(block.text || '').trim();
                }
                if (parsedText) {
                    content.push({ type: 'text', text: parsedText });
                }
            }
        } catch (e) {
            content.push({ type: 'text', text: String(richTextContent) });
        }
        if (content.length <= 1) return content;
        const mergedContent = [];
        let textBuffer = '';
        for (const item of content) {
            if (item.type === 'text') {
                textBuffer += (textBuffer ? '\n' : '') + item.text;
            } else {
                if (textBuffer) {
                    mergedContent.push({ type: 'text', text: textBuffer.trim() });
                    textBuffer = '';
                }
                mergedContent.push(item);
            }
        }
        if (textBuffer) {
            mergedContent.push({ type: 'text', text: textBuffer.trim() });
        }
        return mergedContent;
    }
    async function imageToBase64(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`获取图片失败: ${response.status} ${response.statusText}`, url);
                return null;
            }
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error("图片转Base64时发生错误:", error, url);
            return null;
        }
    }
    async function videoToBase64(url, forcedMimeType = null, onProgress = null) {
        try {
            const arrayBuffer = await gmFetch(url, onProgress);
            const blob = new Blob([arrayBuffer]);
            const finalMimeType = forcedMimeType || blob.type || (url.includes('.mp3') ? 'audio/mp3' : 'video/mp4');
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64String = reader.result.split(',')[1];
                    resolve({ base64: base64String, mimeType: finalMimeType });
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error("媒体文件转Base64时发生错误 (使用gmFetch):", error, url);
            return null;
        }
    }
    const getCanonicalContent = (richText) => {
        const cleanAndNormalize = (str) => {
            if (typeof str !== 'string') return '';
            return str.replace(/<[^>]+>/g, '')
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .trim()
                .replace(/\s+/g, ' ');
        };
        const extractTex = (data = {}) => {
            return data.teX || data.tex || data.value || data.content || '';
        };
        const describeEntity = (entity) => {
            if (!entity || typeof entity !== 'object') return '';
            const type = (entity.type || '').toUpperCase();
            const data = entity.data || {};
            if (type === 'INLINETEX' || type === 'INLINE_TEX' || type === 'TEX') {
                const tex = extractTex(data);
                return tex ? `TEX:${tex}` : '';
            }
            if (type === 'BLOCKTEX' || type === 'TEXBLOCK' || type === 'DISPLAYTEX') {
                const tex = extractTex(data);
                return tex ? `TEXBLOCK:${tex}` : '';
            }
            if (type === 'IMAGE' || type === 'IMG') {
                if (data.src) {
                    const match = String(data.src).match(/file_access\/(\d+)/);
                    return match ? `[IMAGE:${match[1]}]` : `[IMAGE:${data.src}]`;
                }
            }
            if (type === 'AUDIO' && data.quote_id) {
                return `[AUDIO:${data.quote_id}]`;
            }
            if (type === 'VIDEO' && data.video_id) {
                return `[VIDEO:${data.video_id}]`;
            }
            return '';
        };
        const getEntityByKey = (entityMap, key) => {
            if (!entityMap) return null;
            if (Object.prototype.hasOwnProperty.call(entityMap, key)) return entityMap[key];
            const stringKey = String(key);
            if (Object.prototype.hasOwnProperty.call(entityMap, stringKey)) return entityMap[stringKey];
            return null;
        };
        if (typeof richText !== 'string' || richText.trim() === '') return '';
        try {
            const jsonContent = JSON.parse(richText);
            if (jsonContent && Array.isArray(jsonContent.blocks)) {
                const entityMap = jsonContent.entityMap || {};
                const parts = jsonContent.blocks.map(block => {
                    if (!block) return '';
                    const blockParts = [];
                    const blockText = typeof block.text === 'string' ? block.text : '';
                    if (block.type === 'atomic' && block.data) {
                        const dataType = String(block.data.type || '').toUpperCase();
                        if (dataType === 'IMAGE' && block.data.src) {
                            const fileIdMatch = String(block.data.src).match(/file_access\/(\d+)/);
                            blockParts.push(fileIdMatch ? `[IMAGE:${fileIdMatch[1]}]` : '[IMAGE]');
                        } else if (dataType === 'AUDIO' && block.data.data?.quote_id) {
                            blockParts.push(`[AUDIO:${block.data.data.quote_id}]`);
                        } else if (dataType === 'VIDEO' && block.data.data?.video_id) {
                            blockParts.push(`[VIDEO:${block.data.data.video_id}]`);
                        } else if (dataType.includes('TEX')) {
                            const texFromAtomic = extractTex(block.data) || extractTex(block.data.data);
                            if (texFromAtomic) {
                                blockParts.push(`TEXBLOCK:${texFromAtomic}`);
                            }
                        }
                    }
                    if (blockText) {
                        blockParts.push(blockText);
                    }
                    if (Array.isArray(block.entityRanges) && block.entityRanges.length > 0) {
                        block.entityRanges.forEach(range => {
                            if (!range) return;
                            const entity = getEntityByKey(entityMap, range.key);
                            if (!entity) return;
                            const segment = (typeof blockText === 'string') ? blockText.slice(range.offset || 0, (range.offset || 0) + (range.length || 0)) : '';
                            const marker = describeEntity(entity);
                            if (marker && (!segment || segment.trim() === '')) {
                                blockParts.push(marker);
                            }
                        });
                    }
                    return blockParts.join(' ');
                }).filter(Boolean).join(' ');
                return cleanAndNormalize(parts);
            }
        } catch (e) {
            return cleanAndNormalize(richText);
        }
        return cleanAndNormalize(richText);
    };
    function generateContentHash(rawQuestionData) {
        if (!rawQuestionData || typeof rawQuestionData !== 'object') {
            return null;
        }
        const cleanQuestion = {
            type: rawQuestionData.type,
            title: rawQuestionData.title,
            answer_items: [],
            subQuestions: []
        };
        if (!cleanQuestion.type || typeof cleanQuestion.title === 'undefined' || cleanQuestion.title === null) {
            console.warn("无法生成哈希：缺少 type 或 title 为 null/undefined", rawQuestionData);
            return null;
        }
        const title = getCanonicalContent(cleanQuestion.title);
        if (title === '' && (!Array.isArray(rawQuestionData.answer_items) || rawQuestionData.answer_items.length === 0)) {
            console.warn("无法生成哈希：title 为空且没有 answer_items", rawQuestionData);
            return null;
        }
        if (Array.isArray(rawQuestionData.answer_items)) {
            cleanQuestion.answer_items = rawQuestionData.answer_items.map(item => ({
                value: item.value,
                is_target_opt: item.is_target_opt
            }));
        }
        if (Array.isArray(rawQuestionData.subQuestions)) {
            cleanQuestion.subQuestions = rawQuestionData.subQuestions.map(subQ => generateContentHash(subQ));
        }
        const type = cleanQuestion.type;
        let keyParts = [type, title];
        if ([1, 2, 5, 12, 13].includes(type) && Array.isArray(cleanQuestion.answer_items)) {
            if (type === 13) {
                const leftOptions = cleanQuestion.answer_items.filter(item => !item.is_target_opt).map(item => getCanonicalContent(item.value)).sort();
                const rightOptions = cleanQuestion.answer_items.filter(item => item.is_target_opt).map(item => getCanonicalContent(item.value)).sort();
                keyParts.push('LEFT:', ...leftOptions, 'RIGHT:', ...rightOptions);
            } else {
                const sortedOptions = cleanQuestion.answer_items.map(item => getCanonicalContent(item.value)).sort();
                keyParts.push(...sortedOptions);
            }
        }
        if (cleanQuestion.subQuestions.length > 0) {
            keyParts.push('SUB:', ...cleanQuestion.subQuestions.filter(Boolean).sort());
        }
        const canonicalString = keyParts.join('|');
        return md5(canonicalString);
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
                reject(new Error('无法加载图片'));
            };
            img.src = url;
        });
    }
    async function getLatexImage(tex, displayMode) {
        if (!tex || typeof tex !== 'string') {
            return null;
        }
        const normalized = tex.trim();
        if (!normalized) {
            return null;
        }
        const cacheKey = `${displayMode ? 'D' : 'I'}|${normalized}`;
        if (latexImageCache.has(cacheKey)) {
            return await latexImageCache.get(cacheKey);
        }
        const fetchPromise = (async () => {
            try {
                const prefix = '\\dpi{200} ' + (displayMode ? '\\displaystyle ' : '');
                const query = `${prefix}${normalized}`;
                const url = `${LATEX_IMAGE_ENDPOINT}${encodeURIComponent(query)}`;
                const response = await fetch(url, { method: 'GET' });
                if (!response.ok) {
                    throw new Error(`请求失败，状态码 ${response.status}`);
                }
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const data = new Uint8Array(arrayBuffer);
                let dimensions = null;
                try {
                    dimensions = await getImageSize(data);
                } catch (dimensionError) {
                    console.warn('获取公式图片尺寸失败，将使用默认尺寸。', dimensionError);
                }
                return { data, dimensions };
            } catch (error) {
                console.error('渲染 LaTeX 为图片失败:', error, '公式:', tex);
                return null;
            }
        })();
        latexImageCache.set(cacheKey, fetchPromise);
        const result = await fetchPromise;
        if (result === null) {
            latexImageCache.set(cacheKey, Promise.resolve(null));
        }
        return result;
    }
    async function createLatexImageRun(tex, displayMode) {
        const imageInfo = await getLatexImage(tex, displayMode);
        if (!imageInfo) {
            return null;
        }
        let width = imageInfo.dimensions?.width;
        let height = imageInfo.dimensions?.height;
        if (!width || !height) {
            if (displayMode) {
                width = 420;
                height = 80;
            } else {
                width = 160;
                height = 32;
            }
        }
        if (displayMode) {
            const maxWidth = 480;
            if (width > maxWidth) {
                const ratio = maxWidth / width;
                width = maxWidth;
                height = Math.max(20, Math.round(height * ratio));
            }
        } else {
            const maxHeight = 36;
            if (height > maxHeight) {
                const ratio = maxHeight / height;
                height = maxHeight;
                width = Math.max(20, Math.round(width * ratio));
            }
        }
        const finalWidth = Math.max(20, Math.round(width));
        const finalHeight = Math.max(displayMode ? 20 : 16, Math.round(height));
        return new ImageRun({
            data: imageInfo.data,
            transformation: {
                width: finalWidth,
                height: finalHeight
            }
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
            console.error('fetchImageData 错误:', error);
            return null;
        }
    }
    async function checkAndExecuteAuto() {
        if (isProcessing) {
            return;
        }
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(async () => {
            const nodeId = getNodeIDFromUrl(window.location.href);
            const groupId = getGroupIDFromUrl(window.location.href);
            const flagKey = `xiaoya_autofilled_${groupId}_${nodeId}`;
            if (nodeId && groupId && sessionStorage.getItem(flagKey)) {
                sessionStorage.removeItem(flagKey);
                showNotification('自动填写完成。', { type: 'success' });
                console.log('[自动执行] 检测到自动填写后的重载，本次跳过。');
                return;
            }
            if (autoFetchEnabled && (await isTaskPage())) {
                try {
                    isProcessing = true;
                    showNotification('正在自动获取答案...', {
                        type: 'info',
                        keywords: ['自动', '获取', '答案'],
                        animation: 'fadeSlide'
                    });
                    await getAndStoreAnswers();
                    if (autoFillEnabled) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await fillAnswers();
                    }
                } catch (error) {
                    console.error('自动执行出错:', error);
                } finally {
                    isProcessing = false;
                    debounceTimer = null;
                }
            } else {
                debounceTimer = null;
            }
        }, 500);
    }
    function detectPageChange() {
        let lastUrl = location.href;
        const observer = new MutationObserver(async () => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                isProcessing = false;
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                    debounceTimer = null;
                }
                setTimeout(() => {
                    checkAndExecuteAuto();
                }, 1000);
                if (autoContributeEnabled) {
                    backgroundTaskManager.schedule();
                }
            }
        });
        observer.observe(document, {
            subtree: true,
            childList: true
        });
        checkAndExecuteAuto();
        if (autoContributeEnabled) {
            backgroundTaskManager.schedule();
        }
    }
    detectPageChange();
    let modelListCache = {};
    function renderSimpleMarkdown(text) {
        if (!text) return '';
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        html = html.replace(/^### (.*?)$/gm, '<h4>$1</h4>')
            .replace(/^## (.*?)$/gm, '<h3>$1</h3>')
            .replace(/^# (.*?)$/gm, '<h2>$1</h2>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/^[*\-]\s+(.*?)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*?<\/li>\s*)+/gs, (match) => `<ul>${match}</ul>`);
        html = html.replace(/^\d+\.\s+(.*?)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*?<\/li>\s*)+/gs, (match) => {
            if (match.includes('<ul>')) return match;
            return `<ol>${match}</ol>`;
        });
        html = html.replace(/\n/g, '<br>');
        html = html.replace(/<br>\s*<br>/g, '<br>');
        html = html.replace(/^<br>|<br>$/g, '');
        return html;
    }
    class WebDavClient {
        constructor(url, username, password) {
            this.url = url.endsWith('/') ? url : url + '/';
            this.auth = 'Basic ' + btoa(username + ':' + password);
        }
        request(method, path, options = {}) {
            return new Promise((resolve, reject) => {
                const fullUrl = this.url + path;
                const headers = {
                    'Authorization': this.auth,
                    ...(options.headers || {})
                };
                GM_xmlhttpRequest({
                    method: method,
                    url: fullUrl,
                    headers: headers,
                    data: options.body,
                    timeout: 20000,
                    onload: (response) => {
                        const mockResponse = {
                            ok: response.status >= 200 && response.status < 300,
                            status: response.status,
                            statusText: response.statusText,
                            responseText: response.responseText,
                            text: () => Promise.resolve(response.responseText),
                            json: () => Promise.resolve(JSON.parse(response.responseText))
                        };
                        resolve(mockResponse);
                    },
                    onerror: (err) => {
                        console.error(`WebDAV ${method} 错误:`, err);
                        reject(new Error('网络错误'));
                    },
                    ontimeout: () => {
                        reject(new Error('连接超时'));
                    }
                });
            });
        }
        async verify() {
            try {
                const response = await this.request('PROPFIND', '', {
                    headers: {
                        'Depth': '0',
                        'Content-Type': 'application/xml'
                    }
                });
                return response.ok;
            } catch (e) {
                console.error('WebDAV 验证错误:', e);
                return false;
            }
        }
        async put(filename, content) {
            try {
                const response = await this.request('PUT', filename, {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: content
                });
                if (!response.ok) {
                    throw new Error(`上传失败: ${response.status} ${response.statusText}`);
                }
                return true;
            } catch (e) {
                console.error('WebDAV 上传错误:', e);
                throw e;
            }
        }
        async get(filename) {
            try {
                const response = await this.request('GET', filename);
                if (!response.ok) {
                    if (response.status === 404) return null;
                    throw new Error(`HTTP ${response.status} ${response.statusText}`);
                }
                return await response.text();
            } catch (e) {
                console.error('WebDAV GET 错误:', e);
                throw e;
            }
        }
        async mkcol(path) {
            try {
                const response = await this.request('MKCOL', path);
                return response.ok || response.status === 405;
            } catch (e) {
                console.error('WebDAV MKCOL 错误:', e);
                return false;
            }
        }
    }
    class ProfileHelper {
        static getProfiles() {
            try {
                return JSON.parse(localStorage.getItem('aiConfigProfiles') || '[]');
            } catch (e) {
                return [];
            }
        }
        static saveProfiles(profiles) {
            localStorage.setItem('aiConfigProfiles', JSON.stringify(profiles));
        }
        static addProfile(name, config) {
            const profiles = this.getProfiles();
            const existingIndex = profiles.findIndex(p => p.name === name);
            if (existingIndex >= 0) {
                profiles[existingIndex].config = config;
                profiles[existingIndex].timestamp = Date.now();
            } else {
                profiles.push({ name, config, timestamp: Date.now() });
            }
            this.saveProfiles(profiles);
        }
        static deleteProfile(name) {
            let profiles = this.getProfiles();
            profiles = profiles.filter(p => p.name !== name);
            this.saveProfiles(profiles);
        }
    }
    function showAISettingsPanel() {
        const OPENAI_COMPATIBLE_PRESETS = [
            {
                "id": "custom",
                "name": "自定义...",
                "endpoint": "",
                "domain": "openai.com",
                "category": "Custom",
                "notes": "手动输入任何兼容OpenAI接口的API地址。"
            },
            {
                "id": "openai",
                "name": "OpenAI (官方)",
                "endpoint": "https://api.openai.com/v1/chat/completions",
                "domain": "openai.com",
                "category": "Official",
                "notes": "使用OpenAI官方接口。"
            },
            {
                "id": "siliconflow",
                "name": "SiliconFlow (硅基流动)",
                "endpoint": "https://api.siliconflow.cn/v1/chat/completions",
                "domain": "siliconflow.cn",
                "category": "Domestic",
                "notes": "提供多种开源模型，非常推荐用于STT和Vision。"
            },
            {
                "id": "deepseek",
                "name": "DeepSeek (深度求索)",
                "endpoint": "https://api.deepseek.com/v1/chat/completions",
                "domain": "deepseek.com",
                "category": "Domestic",
                "notes": "国产顶尖模型，能力强，性价比高，支持RAG和复杂推理任务。"
            },
            {
                "id": "glm",
                "name": "智谱 GLM",
                "endpoint": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
                "domain": "bigmodel.cn",
                "category": "Domestic",
                "notes": "清华系大模型，综合能力优秀，提供免费额度，适合学术和企业应用。"
            },
            {
                "id": "volcengine",
                "name": "火山引擎",
                "endpoint": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
                "domain": "volcengine.com",
                "category": "Domestic",
                "notes": "火山引擎是字节跳动旗下的云与AI服务平台，聚焦豆包大模型和AI云原生技术。"
            },
            {
                "id": "stepfun",
                "name": "阶跃星辰 (StepFun)",
                "endpoint": "https://api.stepfun.com/v1/chat/completions",
                "domain": "platform.stepfun.com",
                "category": "Domestic",
                "notes": "前微软团队打造，专注于超级智能体，提供免费额度，适合复杂任务。"
            },
            {
                "id": "ModelScope",
                "name": "ModelScope 魔撘",
                "endpoint": "https://api-inference.modelscope.cn/v1/chat/completions",
                "domain": "modelscope.cn",
                "category": "Domestic",
                "notes": "模型社区，支持多种开源模型推理，适合开发者实验和研究。"
            },
            {
                "id": "groq",
                "name": "Groq",
                "endpoint": "https://api.groq.com/openai/v1/chat/completions",
                "domain": "groq.com",
                "category": "International",
                "notes": "以极高的响应速度著称，提供多种开源模型，适合低延迟场景。"
            },
            {
                "id": "together",
                "name": "Together AI",
                "endpoint": "https://api.together.xyz/v1/chat/completions",
                "domain": "together.ai",
                "category": "International",
                "notes": "大型模型托管平台，提供海量开源模型选择，价格有竞争力，适合开发者。"
            },
            {
                "id": "openrouter",
                "name": "OpenRouter",
                "endpoint": "https://openrouter.ai/api/v1/chat/completions",
                "domain": "openrouter.ai",
                "category": "Aggregator",
                "notes": "模型中转，可通过一个API访问包括GPT、Claude在内的多种模型，简化集成。"
            },
            {
                "id": "xai",
                "name": "xAI (Grok)",
                "endpoint": "https://api.x.ai/v1/chat/completions",
                "domain": "x.ai",
                "category": "International",
                "notes": "xAI提供的Grok模型，专注于加速科学发现，适合研究和复杂推理。"
            },
            {
                "id": "moonshot",
                "name": "月之暗面 (Moonshot AI)",
                "endpoint": "hhttps://api.moonshot.cn/v1/chat/completions",
                "domain": "moonshot.cn",
                "category": "Domestic",
                "notes": "国产新兴大模型，专注长文本处理和知识密集型任务，性价比高。"
            },
            {
                "id": "alibaba",
                "name": "阿里云通义千问",
                "endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                "domain": "aliyun.com",
                "category": "Domestic",
                "notes": "阿里巴巴旗下大模型，支持多模态输入，适合企业级应用，提供免费试用。"
            },
            {
                "id": "cerebras",
                "name": "Cerebras",
                "endpoint": "https://api.cerebras.ai/v1/chat/completions",
                "domain": "cerebras.ai",
                "category": "International",
                "notes": "以极高的推理速度著称，采用专门的晶圆级引擎（WSE），适合对延迟极其敏感的任务。"
            },
            {
                "id": "tencent",
                "name": "腾讯混元",
                "endpoint": "https://api.hunyuan.cloud.tencent.com/v1/chat/completions",
                "domain": "cloud.tencent.com",
                "category": "Domestic",
                "notes": "腾讯自研大模型，专注于中文场景，适合企业级和多模态任务。"
            },
            {
                "id": "yi",
                "name": "零一万物 (Yi AI)",
                "endpoint": "https://api.lingyiwanwu.com/v1/chat/completions",
                "domain": "lingyiwanwu.com",
                "category": "Domestic",
                "notes": "国产开源大模型，性能强劲，适合开发者社区和定制化需求。"
            }
        ];
        function getFormConfig() {
            const selectedProvider = inputElements['ai-provider'].getValue();
            const selectedPresetId = (selectedProvider === 'openai') ? inputElements['openai-preset'].getValue() : 'custom';
            const isPresetSelected = selectedProvider === 'openai' && selectedPresetId !== 'custom';
            let endpointToSave = inputElements['ai-endpoint'].value.trim();
            if (selectedProvider === 'openai' && selectedPresetId !== 'custom') {
                const preset = OPENAI_COMPATIBLE_PRESETS.find(p => p.id === selectedPresetId);
                if (preset) endpointToSave = preset.endpoint;
            }
            return {
                provider: selectedProvider,
                openaiPreset: selectedPresetId,
                isPreset: isPresetSelected,
                endpoint: endpointToSave,
                apiKey: inputElements['ai-key'].value.trim(),
                model: inputElements['ai-model'].getValue(),
                geminiThinkingEnabled: inputElements['gemini-thinking-enabled'].checked,
                geminiThinkingBudgetMode: inputElements['gemini-thinking-budget-mode'].getValue(),
                geminiThinkingBudgetCustom: parseInt(inputElements['gemini-thinking-budget-custom'].value, 10) || 8192,
                temperature: parseFloat(inputElements['ai-temperature'].value) || 0.7,
                max_tokens: parseInt(inputElements['ai-max-tokens'].value, 10) || 8000,
                azureApiVersion: inputElements['ai-azure-apiversion'].value.trim(),
                disableCorrection: inputElements['ai-disable-correction'].checked,
                disableMaxTokens: inputElements['ai-disable-max-tokens'].checked,
                autoScrollEnabled: inputElements['ai-auto-scroll'].checked,
                visionEnabled: inputElements['ai-vision-enabled'].checked,
                batchConcurrency: inputElements['ai-batch-concurrency'].value,
                requestInterval: parseInt(inputElements['ai-request-interval'].value, 10) || 200,
                xiaoyaAiMode: inputElements['xiaoya-ai-mode'].getValue(),
                visionProvider: inputElements['vision-provider'].getValue(),
                visionEndpoint: inputElements['vision-endpoint'].value.trim(),
                visionApiKey: inputElements['vision-api-key'].value.trim(),
                visionModel: inputElements['vision-model'].getValue(),
                audioProcessingMode: inputElements['audio-processing-mode'].getValue(),
                geminiAnalyzeVideoFramesEnabled: inputElements['gemini-analyze-video-frames-enabled'].checked,
                sttEnabled: inputElements['stt-enabled'].checked,
                sttVideoEnabled: inputElements['stt-video-enabled'].checked,
                sttProvider: inputElements['stt-provider'].getValue(),
                sttEndpoint: inputElements['stt-endpoint'].value.trim(),
                sttApiKey: inputElements['stt-api-key'].value.trim(),
                sttModel: inputElements['stt-model'].value.trim(),
                customPrompts: (() => {
                    const prompts = {};
                    Object.keys(defaultPrompts).forEach(typeCode => {
                        const el = inputElements[`prompt-type-${typeCode}`];
                        if (el && el.value.trim() !== defaultPrompts[typeCode].trim()) {
                            prompts[typeCode] = el.value;
                        }
                    });
                    return prompts;
                })()
            };
        }
        function applyConfigToForm(config) {
            if (!config) return;
            const setV = (id, val) => {
                const el = inputElements[id];
                if (!el) return;
                if (el.setValue) el.setValue(val);
                else if (el.type === 'checkbox') el.checked = !!val;
                else el.value = val !== undefined ? val : '';
                el.dispatchEvent(new Event('change'));
                el.dispatchEvent(new Event('input'));
            };
            setV('ai-provider', config.provider);
            setV('openai-preset', config.openaiPreset);
            setV('ai-endpoint', config.endpoint);
            setV('ai-key', config.apiKey);
            setV('ai-model', config.model);
            setV('gemini-thinking-enabled', config.geminiThinkingEnabled);
            setV('gemini-thinking-budget-mode', config.geminiThinkingBudgetMode);
            setV('gemini-thinking-budget-custom', config.geminiThinkingBudgetCustom);
            setV('ai-temperature', config.temperature);
            setV('ai-max-tokens', config.max_tokens);
            setV('ai-azure-apiversion', config.azureApiVersion);
            setV('ai-disable-correction', config.disableCorrection);
            setV('ai-disable-max-tokens', config.disableMaxTokens);
            setV('ai-auto-scroll', config.autoScrollEnabled);
            setV('ai-vision-enabled', config.visionEnabled);
            setV('ai-batch-concurrency', config.batchConcurrency);
            setV('ai-request-interval', config.requestInterval);
            setV('xiaoya-ai-mode', config.xiaoyaAiMode);
            setV('vision-provider', config.visionProvider);
            setV('vision-endpoint', config.visionEndpoint);
            setV('vision-api-key', config.visionApiKey);
            setV('vision-model', config.visionModel);
            setV('audio-processing-mode', config.audioProcessingMode);
            setV('gemini-analyze-video-frames-enabled', config.geminiAnalyzeVideoFramesEnabled);
            setV('stt-enabled', config.sttEnabled);
            setV('stt-provider', config.sttProvider);
            setV('stt-endpoint', config.sttEndpoint);
            setV('stt-api-key', config.sttApiKey);
            setV('stt-model', config.sttModel);
            if (config.customPrompts) {
                Object.keys(defaultPrompts).forEach(typeCode => {
                    const val = config.customPrompts[typeCode];
                    const el = inputElements[`prompt-type-${typeCode}`];
                    if (el) {
                        el.value = val || defaultPrompts[typeCode];
                    }
                });
            }
        }
        function createWebDavManager() {
            const details = document.createElement('details');
            details.style.cssText = `
                border: 1px solid rgba(99, 102, 241, 0.3);
                border-radius: 16px;
                margin-top: 25px;
                background: linear-gradient(135deg, rgba(238, 242, 255, 0.95) 0%, rgba(224, 231, 255, 0.9) 100%);
                margin-bottom: 20px;
                box-shadow: 0 4px 15px rgba(99, 102, 241, 0.1);
                overflow: hidden;
                transition: all 0.3s ease;
            `;
            details.onmouseenter = () => details.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.15)';
            details.onmouseleave = () => details.style.boxShadow = '0 4px 15px rgba(99, 102, 241, 0.1)';
            const summary = document.createElement('summary');
            summary.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:20px;">📂</span>
                    <span>多配置管理 & WebDAV 云同步</span>
                    <span style="font-size:20px;">☁️</span>
                </div>
            `;
            summary.style.cssText = `
                padding: 16px 20px;
                font-weight: 600;
                color: #4f46e5;
                font-size: 15px;
                cursor: pointer;
                list-style: none;
                background: linear-gradient(90deg, rgba(255,255,255,0.8) 0%, rgba(238,242,255,0.6) 100%);
                border-bottom: 1px solid rgba(99, 102, 241, 0.15);
                transition: background 0.2s ease;
            `;
            summary.onmouseenter = () => summary.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.95) 0%, rgba(238,242,255,0.8) 100%)';
            summary.onmouseleave = () => summary.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.8) 0%, rgba(238,242,255,0.6) 100%)';
            details.appendChild(summary);
            const content = document.createElement('div');
            content.style.cssText = 'padding: 24px;';
            const profileCard = document.createElement('div');
            profileCard.style.cssText = `
                background: white;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                margin-bottom: 20px;
            `;
            const profileHeader = document.createElement('div');
            profileHeader.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:16px;';
            profileHeader.innerHTML = `
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <h4 style="margin:0; color:#374151; font-size:15px; font-weight:600;">本地配置档案</h4>
            `;
            profileCard.appendChild(profileHeader);
            const profileControls = document.createElement('div');
            profileControls.style.cssText = 'display:flex; gap:10px; align-items:center; flex-wrap:wrap;';
            const profileSelectWrapper = document.createElement('div');
            profileSelectWrapper.style.cssText = `
                position: relative;
                flex-grow: 1;
                min-width: 200px;
            `;
            const profileSelectTrigger = document.createElement('div');
            profileSelectTrigger.style.cssText = `
                padding: 12px 16px;
                border-radius: 10px;
                border: 1px solid #e5e7eb;
                background: linear-gradient(to bottom, #fff, #fafafa);
                color: #374151;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 14px;
                user-select: none;
            `;
            profileSelectTrigger.innerHTML = `
                <span class="profile-select-text" style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:16px;">📁</span>
                    <span>选择配置档案...</span>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" style="transition: transform 0.2s;">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;
            const profileDropdown = document.createElement('div');
            profileDropdown.style.cssText = `
                position: absolute;
                top: calc(100% + 4px);
                left: 0;
                right: 0;
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 10px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.15);
                max-height: 220px;
                overflow-y: auto;
                z-index: 1000;
                display: none;
                padding: 6px;
            `;
            let selectedProfileName = '';
            const refreshProfiles = () => {
                const profiles = ProfileHelper.getProfiles();
                profileDropdown.innerHTML = '';
                if (profiles.length === 0) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.style.cssText = 'padding: 16px; text-align: center; color: #9ca3af; font-size: 13px;';
                    emptyMsg.innerHTML = '📭 暂无保存的配置档案';
                    profileDropdown.appendChild(emptyMsg);
                } else {
                    profiles.forEach(p => {
                        const item = document.createElement('div');
                        item.style.cssText = `
                            padding: 10px 14px;
                            border-radius: 8px;
                            cursor: pointer;
                            transition: all 0.15s ease;
                            display: flex;
                            align-items: center;
                            gap: 10px;
                        `;
                        item.innerHTML = `
                            <span style="font-size:16px;">📄</span>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:500; color:#374151; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
                                <div style="font-size:11px; color:#9ca3af;">${new Date(p.timestamp).toLocaleString()}</div>
                            </div>
                            <div class="delete-profile-btn" style="
                                width: 24px; height: 24px; border-radius: 6px;
                                display: flex; align-items: center; justify-content: center;
                                color: #9ca3af; transition: all 0.2s; visibility: hidden;
                            ">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </div>
                        `;
                        item.onmouseenter = () => {
                            item.style.background = '#f3f4f6';
                            const del = item.querySelector('.delete-profile-btn');
                            del.style.visibility = 'visible';
                            del.style.color = '#ef4444';
                            del.style.background = '#fee2e2';
                        };
                        item.onmouseleave = () => {
                            item.style.background = 'transparent';
                            const del = item.querySelector('.delete-profile-btn');
                            del.style.visibility = 'hidden';
                            del.style.color = '#9ca3af';
                            del.style.background = 'transparent';
                        };
                        item.onclick = async (e) => {
                            if (e.target.closest('.delete-profile-btn')) {
                                e.stopPropagation();
                                const confirmed = await showConfirmNotification(
                                    `确定要删除配置 "${p.name}" 吗？此操作不可撤销。`,
                                    {
                                        title: '删除确认',
                                        confirmText: '删除',
                                        cancelText: '取消',
                                        animation: 'fadeSlide'
                                    }
                                );
                                if (confirmed) {
                                    ProfileHelper.deleteProfile(p.name);
                                    if (selectedProfileName === p.name) {
                                        selectedProfileName = '';
                                        profileSelectTrigger.querySelector('.profile-select-text').innerHTML = `
                                            <span style="font-size:16px;">📁</span>
                                            <span>选择配置档案...</span>
                                        `;
                                    }
                                    refreshProfiles();
                                    showNotification(`🗑️ 已删除配置: ${p.name}`, { type: 'info' });
                                }
                                return;
                            }
                            selectedProfileName = p.name;
                            profileSelectTrigger.querySelector('.profile-select-text').innerHTML = `
                                <span style="font-size:16px;">📄</span>
                                <span>${p.name}</span>
                            `;
                            profileDropdown.style.display = 'none';
                            profileSelectTrigger.querySelector('svg').style.transform = 'rotate(0deg)';
                        };
                        profileDropdown.appendChild(item);
                    });
                }
            };
            refreshProfiles();
            profileSelectTrigger.onclick = (e) => {
                e.stopPropagation();
                const isOpen = profileDropdown.style.display === 'block';
                profileDropdown.style.display = isOpen ? 'none' : 'block';
                profileSelectTrigger.querySelector('svg').style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
                profileSelectTrigger.style.borderColor = isOpen ? '#e5e7eb' : '#6366f1';
                profileSelectTrigger.style.boxShadow = isOpen ? 'none' : '0 0 0 3px rgba(99,102,241,0.1)';
            };
            document.addEventListener('click', () => {
                profileDropdown.style.display = 'none';
                profileSelectTrigger.querySelector('svg').style.transform = 'rotate(0deg)';
                profileSelectTrigger.style.borderColor = '#e5e7eb';
                profileSelectTrigger.style.boxShadow = 'none';
            });
            profileSelectWrapper.append(profileSelectTrigger, profileDropdown);
            const showProfileNameInput = (callback) => {
                const inputOverlay = document.createElement('div');
                inputOverlay.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.5); z-index: 10003; display: flex;
                    align-items: center; justify-content: center; backdrop-filter: blur(4px);
                    opacity: 0; transition: opacity 0.2s ease;
                `;
                const inputModal = document.createElement('div');
                inputModal.style.cssText = `
                    background: white; padding: 28px; border-radius: 16px;
                    width: 400px; max-width: 90%; box-shadow: 0 20px 50px rgba(0,0,0,0.2);
                    transform: scale(0.9); transition: transform 0.2s ease;
                `;
                inputModal.innerHTML = `
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
                        <div style="width:44px; height:44px; background:linear-gradient(135deg, #6366f1, #8b5cf6); border-radius:12px; display:flex; align-items:center; justify-content:center;">
                            <span style="font-size:22px;">💾</span>
                        </div>
                        <div>
                            <h3 style="margin:0; color:#1f2937; font-size:18px;">保存配置档案</h3>
                            <p style="margin:4px 0 0 0; color:#6b7280; font-size:13px;">为当前配置起一个名称</p>
                        </div>
                    </div>
                `;
                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.placeholder = '请输入配置档案名称...';
                nameInput.style.cssText = `
                    width: 100%; padding: 14px 16px; border: 2px solid #e5e7eb; border-radius: 10px;
                    font-size: 15px; margin-bottom: 20px; box-sizing: border-box; outline: none;
                    transition: all 0.2s ease;
                `;
                nameInput.onfocus = () => { nameInput.style.borderColor = '#6366f1'; nameInput.style.boxShadow = '0 0 0 4px rgba(99,102,241,0.1)'; };
                nameInput.onblur = () => { nameInput.style.borderColor = '#e5e7eb'; nameInput.style.boxShadow = 'none'; };
                const btnRow = document.createElement('div');
                btnRow.style.cssText = 'display:flex; gap:12px; justify-content:flex-end;';
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = '取消';
                cancelBtn.style.cssText = `
                    padding: 10px 20px; border-radius: 8px; border: 1px solid #d1d5db;
                    background: white; color: #374151; cursor: pointer; font-size: 14px; font-weight: 500;
                    transition: all 0.2s ease;
                `;
                cancelBtn.onmouseenter = () => cancelBtn.style.background = '#f3f4f6';
                cancelBtn.onmouseleave = () => cancelBtn.style.background = 'white';
                const confirmBtn = document.createElement('button');
                confirmBtn.textContent = '保存';
                confirmBtn.style.cssText = `
                    padding: 10px 24px; border-radius: 8px; border: none;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white;
                    cursor: pointer; font-size: 14px; font-weight: 600;
                    transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(99,102,241,0.3);
                `;
                confirmBtn.onmouseenter = () => { confirmBtn.style.transform = 'translateY(-1px)'; confirmBtn.style.boxShadow = '0 6px 16px rgba(99,102,241,0.4)'; };
                confirmBtn.onmouseleave = () => { confirmBtn.style.transform = 'translateY(0)'; confirmBtn.style.boxShadow = '0 4px 12px rgba(99,102,241,0.3)'; };
                const closeModal = () => {
                    inputOverlay.style.opacity = '0';
                    inputModal.style.transform = 'scale(0.9)';
                    setTimeout(() => inputOverlay.remove(), 200);
                };
                cancelBtn.onclick = closeModal;
                inputOverlay.onclick = (e) => { if (e.target === inputOverlay) closeModal(); };
                confirmBtn.onclick = () => {
                    const name = nameInput.value.trim();
                    if (!name) {
                        nameInput.style.borderColor = '#ef4444';
                        nameInput.style.boxShadow = '0 0 0 4px rgba(239,68,68,0.1)';
                        showNotification('请输入配置档案名称', { type: 'warning' });
                        return;
                    }
                    closeModal();
                    callback(name);
                };
                nameInput.onkeydown = (e) => { if (e.key === 'Enter') confirmBtn.click(); if (e.key === 'Escape') closeModal(); };
                btnRow.append(cancelBtn, confirmBtn);
                inputModal.append(nameInput, btnRow);
                inputOverlay.appendChild(inputModal);
                document.body.appendChild(inputOverlay);
                requestAnimationFrame(() => {
                    inputOverlay.style.opacity = '1';
                    inputModal.style.transform = 'scale(1)';
                    nameInput.focus();
                });
            };
            const createProfileBtn = (text, icon, color, hoverColor) => {
                const btn = document.createElement('button');
                btn.innerHTML = `<span style="margin-right:6px;">${icon}</span>${text}`;
                btn.style.cssText = `
                    padding: 10px 16px;
                    border-radius: 10px;
                    border: none;
                    background: ${color};
                    color: white;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    transition: all 0.25s ease;
                    box-shadow: 0 2px 6px ${color}40;
                `;
                btn.onmouseenter = () => { btn.style.background = hoverColor; btn.style.transform = 'translateY(-2px)'; btn.style.boxShadow = `0 4px 12px ${color}50`; };
                btn.onmouseleave = () => { btn.style.background = color; btn.style.transform = 'translateY(0)'; btn.style.boxShadow = `0 2px 6px ${color}40`; };
                return btn;
            };
            const btnLoad = createProfileBtn('读取', '📥', '#10b981', '#059669');
            btnLoad.onclick = (e) => {
                e.preventDefault();
                if (!selectedProfileName) { showNotification('请先选择一个配置档案', { type: 'warning' }); return; }
                const profiles = ProfileHelper.getProfiles();
                const p = profiles.find(x => x.name === selectedProfileName);
                if (p) {
                    localStorage.setItem('aiConfig', JSON.stringify(p.config));
                    if (p.config.customPrompts) {
                        localStorage.setItem('aiCustomPrompts', JSON.stringify(p.config.customPrompts));
                    }
                    showNotification(`✅ 已加载配置: ${selectedProfileName}，正在刷新面板...`, { type: 'success' });
                    const mainOverlay = document.querySelector('div[style*="z-index: 10001"]');
                    if (mainOverlay) {
                        mainOverlay.remove();
                    }
                    setTimeout(() => {
                        showAISettingsPanel();
                    }, 150);
                }
            };
            const btnSaveAs = createProfileBtn('保存', '💾', '#6366f1', '#4f46e5');
            btnSaveAs.onclick = (e) => {
                e.preventDefault();
                showProfileNameInput((name) => {
                    const config = getFormConfig();
                    ProfileHelper.addProfile(name, config);
                    refreshProfiles();
                    selectedProfileName = name;
                    profileSelectTrigger.querySelector('.profile-select-text').innerHTML = `
                        <span style="font-size:16px;">📄</span>
                        <span>${name}</span>
                    `;
                    showNotification(`✅ 已保存配置: ${name}`, { type: 'success' });
                });
            };
            const showSelectionModal = (title, items, actionType, callback) => {
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.5); z-index: 10005; display: flex;
                    align-items: center; justify-content: center; backdrop-filter: blur(4px);
                    opacity: 0; transition: opacity 0.2s ease;
                `;
                const modal = document.createElement('div');
                modal.style.cssText = `
                    background: white; padding: 0; border-radius: 16px;
                    width: 420px; max-width: 90%; max-height: 80vh; display: flex; flex-direction: column;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.2); overflow: hidden;
                    transform: scale(0.95); transition: transform 0.2s ease;
                `;
                const header = document.createElement('div');
                header.style.cssText = 'padding: 20px; border-bottom: 1px solid #e5e7eb; background: #f9fafb;';
                header.innerHTML = `
                    <h3 style="margin:0; color:#111827; font-size:17px; display:flex; align-items:center; gap:8px;">
                        <span>${actionType === 'upload' ? '☁️' : actionType === 'delete' ? '🗑️' : '⬇️'}</span> ${title}
                    </h3>
                    <p style="margin:4px 0 0 0; color:#6b7280; font-size:13px;">请勾选需要操作的配置档案</p>
                `;
                const listContainer = document.createElement('div');
                listContainer.style.cssText = 'padding: 10px; overflow-y: auto; flex-grow: 1;';
                if (items.length === 0) {
                    listContainer.innerHTML = '<div style="padding:30px; text-align:center; color:#9ca3af;">暂无可用配置</div>';
                }
                const checkboxes = [];
                items.forEach(item => {
                    const row = document.createElement('label');
                    row.style.cssText = `
                        display: flex; align-items: center; gap: 12px; padding: 12px;
                        border-radius: 8px; cursor: pointer; transition: background 0.15s;
                        margin-bottom: 4px;
                    `;
                    row.onmouseenter = () => row.style.background = '#f3f4f6';
                    row.onmouseleave = () => row.style.background = 'transparent';
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = false;
                    cb.value = item.name;
                    cb.style.cssText = 'width: 18px; height: 18px; cursor: pointer; accent-color: #6366f1;';
                    const info = document.createElement('div');
                    info.style.cssText = 'flex: 1; overflow: hidden;';
                    info.innerHTML = `
                        <div style="font-weight:500; color:#374151;">${item.name}</div>
                        <div style="font-size:12px; color:#9ca3af;">${new Date(item.timestamp).toLocaleString()}</div>
                    `;
                    row.append(cb, info);
                    listContainer.appendChild(row);
                    checkboxes.push(cb);
                });
                const footer = document.createElement('div');
                footer.style.cssText = 'padding: 16px 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; background: #fff;';
                const leftActions = document.createElement('div');
                const toggleAll = document.createElement('span');
                toggleAll.textContent = '全选';
                toggleAll.style.cssText = 'font-size:13px; color:#6366f1; cursor:pointer; font-weight:500;';
                toggleAll.onclick = () => {
                    const allChecked = checkboxes.every(c => c.checked);
                    checkboxes.forEach(c => c.checked = !allChecked);
                };
                leftActions.appendChild(toggleAll);
                const btnGroup = document.createElement('div');
                btnGroup.style.cssText = 'display:flex; gap:10px;';
                const btnCancel = document.createElement('button');
                btnCancel.textContent = '取消';
                btnCancel.style.cssText = 'padding: 8px 16px; border-radius: 8px; border: 1px solid #d1d5db; background: white; color: #374151; cursor: pointer; font-size: 14px;';
                const btnConfirm = document.createElement('button');
                btnConfirm.textContent = actionType === 'upload' ? '开始备份' :
                    actionType === 'delete' ? '删除选中' : '开始恢复';
                btnConfirm.style.cssText = `
                    padding: 8px 20px; border-radius: 8px; border: none;
                    background: ${actionType === 'upload' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' :
                        actionType === 'delete' ? 'linear-gradient(135deg, #ef4444, #f87171)' : 'linear-gradient(135deg, #10b981, #14b8a6)'};
                    color: white; cursor: pointer; font-size: 14px; font-weight: 600;
                    box-shadow: 0 4px 12px ${actionType === 'upload' ? 'rgba(99,102,241,0.3)' :
                        actionType === 'delete' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'};
                `;
                const close = () => {
                    overlay.style.opacity = '0';
                    modal.style.transform = 'scale(0.95)';
                    setTimeout(() => overlay.remove(), 200);
                };
                btnCancel.onclick = close;
                overlay.onclick = (e) => { if (e.target === overlay) close(); };
                btnConfirm.onclick = () => {
                    const selected = checkboxes.filter(c => c.checked).map(c => c.value);
                    if (selected.length === 0) {
                        showNotification('请至少选择一个配置', { type: 'warning' });
                        return;
                    }
                    close();
                    callback(selected);
                };
                btnGroup.append(btnCancel, btnConfirm);
                footer.append(leftActions, btnGroup);
                modal.append(header, listContainer, footer);
                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                requestAnimationFrame(() => {
                    overlay.style.opacity = '1';
                    modal.style.transform = 'scale(1)';
                });
            };
            profileControls.append(profileSelectWrapper, btnLoad, btnSaveAs);
            profileCard.appendChild(profileControls);
            content.appendChild(profileCard);
            const davCard = document.createElement('div');
            davCard.style.cssText = `
                background: white;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.06);
            `;
            const davHeader = document.createElement('div');
            davHeader.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:16px;';
            davHeader.innerHTML = `
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
                    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
                </svg>
                <h4 style="margin:0; color:#374151; font-size:15px; font-weight:600;">WebDAV 云同步</h4>
                <span style="font-size:11px; background:#e0e7ff; color:#4338ca; padding:3px 8px; border-radius:20px; margin-left:auto;">跨设备同步</span>
            `;
            davCard.appendChild(davHeader);
            const davConfig = JSON.parse(localStorage.getItem('xiaoya_webdav_config') || '{}');
            const createInput = (placeholder, key, type = 'text', icon = '🔗') => {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'position:relative; margin-bottom:12px;';
                const iconSpan = document.createElement('span');
                iconSpan.textContent = icon;
                iconSpan.style.cssText = 'position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:14px; z-index: 10; pointer-events: none;';
                const inp = document.createElement('input');
                inp.type = type;
                inp.placeholder = placeholder;
                inp.value = davConfig[key] || '';
                inp.style.cssText = `
                    display: block;
                    width: 100%;
                    padding: 12px 14px 12px 38px;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    box-sizing: border-box;
                    font-size: 14px;
                    background: #fafafa;
                    transition: all 0.2s ease;
                    outline: none;
                `;
                inp.onfocus = () => { inp.style.borderColor = '#6366f1'; inp.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; inp.style.background = '#fff'; };
                inp.onblur = () => { inp.style.borderColor = '#e5e7eb'; inp.style.boxShadow = 'none'; inp.style.background = '#fafafa'; };
                inp.onchange = () => {
                    davConfig[key] = inp.value;
                    localStorage.setItem('xiaoya_webdav_config', JSON.stringify(davConfig));
                };
                wrapper.append(inp, iconSpan);
                return wrapper;
            };
            davCard.append(
                createInput('WebDAV 地址 (例: https://dav.jianguoyun.com/dav/)', 'url', 'text', '🌐'),
                createInput('用户名', 'user', 'text', '👤'),
                createInput('密码 / 应用专用密码', 'pass', 'password', '🔑')
            );
            const helpLink = document.createElement('div');
            helpLink.style.cssText = 'text-align:right; margin-top:-8px; margin-bottom:16px;';
            helpLink.innerHTML = '<span style="color:#6366f1; cursor:pointer; font-size:13px; text-decoration:underline;">❓ 如何获取坚果云配置？</span>';
            helpLink.onclick = () => {
                showConfirmNotification(
                    `<div style="text-align:left; font-size:14px; line-height:1.6;">
                        <p><b>1. 登录坚果云官网：</b><br>访问 <a href="https://www.jianguoyun.com" target="_blank" style="color:#6366f1;">jianguoyun.com</a> 并登录。</p>
                        <p><b>2. 进入安全选项：</b><br>点击右上角昵称 -> 账户信息 -> 安全选项。<br>
                        <span style="color:#f59e0b; font-size:12px;">(如果提示需要下载客户端关联，请点击右上角切换版本到旧版界面)</span></p>
                        <p><b>3. 生成应用密码：</b><br>在"第三方应用管理"处，点击"添加应用"，填写名称，生成密码。</p>
                        <p><b>4. 填写配置：</b><br>
                        • <b>地址：</b> <code>https://dav.jianguoyun.com/dav/</code><br>
                        • <b>用户名：</b> 你的坚果云注册邮箱<br>
                        • <b>密码：</b> 刚才生成的用来代替登录密码的"应用密码"</p>
                        <p style="color:#ef4444; font-size:12px; margin-top:8px;">⚠️ 注意：为了安全，请务必使用应用专用密码，不要使用你的登录密码！</p>
                    </div>`,
                    { title: '坚果云 WebDAV 配置教程', confirmText: '我知道了', excludeCancel: true }
                );
            };
            davCard.appendChild(helpLink);
            const davActions = document.createElement('div');
            davActions.style.cssText = 'display:flex; gap:12px; margin-top:16px;';
            const createDavBtn = (text, icon, gradient, hoverGradient) => {
                const btn = document.createElement('button');
                btn.innerHTML = `<span style="font-size:18px; margin-right:8px;">${icon}</span>${text}`;
                btn.style.cssText = `
                    flex: 1;
                    padding: 14px 20px;
                    border-radius: 12px;
                    border: none;
                    background: ${gradient};
                    color: white;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(79, 70, 229, 0.25);
                `;
                btn.onmouseenter = () => { btn.style.background = hoverGradient; btn.style.transform = 'translateY(-2px)'; btn.style.boxShadow = '0 6px 20px rgba(79, 70, 229, 0.35)'; };
                btn.onmouseleave = () => { btn.style.background = gradient; btn.style.transform = 'translateY(0)'; btn.style.boxShadow = '0 4px 15px rgba(79, 70, 229, 0.25)'; };
                return btn;
            };
            const btnBackup = createDavBtn('上传备份', '☁️', 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)');
            btnBackup.onclick = async (e) => {
                e.preventDefault();
                if (!davConfig.url || !davConfig.user || !davConfig.pass) {
                    showNotification('⚠️ 请先填写完整的 WebDAV 连接信息', { type: 'warning' });
                    return;
                }
                let localProfiles = ProfileHelper.getProfiles();
                if (localProfiles.length === 0) {
                    if (await showConfirmNotification(
                        '当前没有保存任何档案。是否将当前界面配置保存为 "自动备份" 后继续？',
                        {
                            title: '自动保存',
                            confirmText: '保存并继续',
                            cancelText: '取消',
                            animation: 'fadeSlide'
                        }
                    )) {
                        ProfileHelper.addProfile('自动备份', getFormConfig());
                        refreshProfiles();
                        localProfiles = ProfileHelper.getProfiles();
                    } else {
                        return;
                    }
                }
                showSelectionModal('选择要备份的配置', localProfiles, 'upload', async (selectedNames) => {
                    const client = new WebDavClient(davConfig.url, davConfig.user, davConfig.pass);
                    btnBackup.disabled = true;
                    const originalHtml = btnBackup.innerHTML;
                    btnBackup.innerHTML = '<span style="animation: spin 1s linear infinite; display:inline-block;">⏳</span> 连接中...';
                    try {
                        if (await client.verify()) {
                            const backupDir = 'XiaoyaBackup/';
                            await client.mkcol(backupDir);
                            btnBackup.innerHTML = '<span style="animation: spin 1s linear infinite; display:inline-block;">⏳</span> 同步中...';
                            const remoteFile = backupDir + 'xiaoya_ai_profiles.json';
                            let remoteProfiles = [];
                            try {
                                const text = await client.get(remoteFile);
                                if (text) remoteProfiles = JSON.parse(text);
                            } catch (e) { }
                            const profilesToUpload = localProfiles.filter(p => selectedNames.includes(p.name));
                            let count = 0;
                            profilesToUpload.forEach(localP => {
                                const idx = remoteProfiles.findIndex(rp => rp.name === localP.name);
                                if (idx !== -1) {
                                    remoteProfiles[idx] = localP;
                                } else {
                                    remoteProfiles.push(localP);
                                }
                                count++;
                            });
                            await client.put(remoteFile, JSON.stringify(remoteProfiles));
                            showNotification(`✅ 成功备份了 ${count} 个配置到 ${backupDir}`, { type: 'success' });
                        } else {
                            showNotification('❌ WebDAV 连接失败，请检查地址和凭据', { type: 'error' });
                        }
                    } catch (err) {
                        showNotification('❌ 备份出错: ' + err.message, { type: 'error' });
                    } finally {
                        btnBackup.disabled = false;
                        btnBackup.innerHTML = originalHtml;
                    }
                });
            };
            const btnRestore = createDavBtn('下载恢复', '⬇️', 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)', 'linear-gradient(135deg, #059669 0%, #0d9488 100%)');
            btnRestore.onclick = async (e) => {
                e.preventDefault();
                if (!davConfig.url || !davConfig.user || !davConfig.pass) {
                    showNotification('⚠️ 请先填写完整的 WebDAV 连接信息', { type: 'warning' });
                    return;
                }
                const client = new WebDavClient(davConfig.url, davConfig.user, davConfig.pass);
                btnRestore.disabled = true;
                const originalHtml = btnRestore.innerHTML;
                btnRestore.innerHTML = '<span style="animation: spin 1s linear infinite; display:inline-block;">⏳</span> 读取中...';
                try {
                    const backupDir = 'XiaoyaBackup/';
                    const remoteFile = backupDir + 'xiaoya_ai_profiles.json';
                    let text = await client.get(remoteFile);
                    if (!text) {
                        text = await client.get('xiaoya_ai_profiles.json');
                    }
                    if (text) {
                        const remoteProfiles = JSON.parse(text);
                        btnRestore.innerHTML = originalHtml;
                        btnRestore.disabled = false;
                        showSelectionModal('选择要恢复的配置', remoteProfiles, 'download', (selectedNames) => {
                            const profilesToImport = remoteProfiles.filter(p => selectedNames.includes(p.name));
                            if (profilesToImport.length > 0) {
                                ProfileHelper.saveProfiles(profilesToImport);
                                profilesToImport.forEach(imp => {
                                    ProfileHelper.addProfile(imp.name, imp.config);
                                });
                                refreshProfiles();
                                showNotification(`✅ 成功恢复/合并了 ${profilesToImport.length} 个配置档案`, { type: 'success' });
                            }
                        });
                        return;
                    } else {
                        showNotification('☁️ 云端未找到备份文件', { type: 'warning' });
                    }
                } catch (err) {
                    showNotification('❌ 获取备份列表出错: ' + err.message, { type: 'error' });
                } finally {
                    if (btnRestore.disabled) {
                        btnRestore.disabled = false;
                        btnRestore.innerHTML = originalHtml;
                    }
                }
            };
            const btnManage = createDavBtn('管理云端', '⚙️', 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)');
            btnManage.onclick = async (e) => {
                e.preventDefault();
                if (!davConfig.url || !davConfig.user || !davConfig.pass) {
                    showNotification('⚠️ 请先填写完整的 WebDAV 连接信息', { type: 'warning' });
                    return;
                }
                const client = new WebDavClient(davConfig.url, davConfig.user, davConfig.pass);
                btnManage.disabled = true;
                const originalHtml = btnManage.innerHTML;
                btnManage.innerHTML = '<span style="animation: spin 1s linear infinite; display:inline-block;">⏳</span> 加载中...';
                try {
                    const backupDir = 'XiaoyaBackup/';
                    const remoteFile = backupDir + 'xiaoya_ai_profiles.json';
                    let text = await client.get(remoteFile);
                    if (!text) text = await client.get('xiaoya_ai_profiles.json');
                    if (text) {
                        let remoteProfiles = JSON.parse(text);
                        btnManage.innerHTML = originalHtml;
                        btnManage.disabled = false;
                        showSelectionModal('管理云端配置 (选择删除)', remoteProfiles, 'delete', async (selectedNames) => {
                            if (await showConfirmNotification(`确定要永久删除选中的 ${selectedNames.length} 个云端备份吗？`, { title: '删除警告', confirmText: '确定删除', cancelText: '取消', animation: 'fadeSlide' })) {
                                btnManage.disabled = true;
                                btnManage.innerHTML = '<span style="animation: spin 1s linear infinite; display:inline-block;">⏳</span> 删除中...';
                                try {
                                    const newProfiles = remoteProfiles.filter(p => !selectedNames.includes(p.name));
                                    await client.put(remoteFile, JSON.stringify(newProfiles));
                                    showNotification(`🗑️ 已从云端删除 ${selectedNames.length} 个配置`, { type: 'success' });
                                } catch (err) {
                                    showNotification('❌ 删除失败: ' + err.message, { type: 'error' });
                                } finally {
                                    btnManage.disabled = false;
                                    btnManage.innerHTML = originalHtml;
                                }
                            }
                        });
                        return;
                    } else {
                        showNotification('☁️ 云端暂无配置文件', { type: 'info' });
                    }
                } catch (err) {
                    showNotification('❌ 获取列表失败: ' + err.message, { type: 'error' });
                } finally {
                    if (btnManage.disabled) {
                        btnManage.disabled = false;
                        btnManage.innerHTML = originalHtml;
                    }
                }
            };
            davActions.append(btnBackup, btnRestore, btnManage);
            davCard.appendChild(davActions);
            content.appendChild(davCard);
            details.appendChild(content);
            return details;
        }
        function createCustomSelect(field, initialValue, onValueChange) {
            const wrapper = document.createElement('div');
            wrapper.className = 'custom-select-wrapper';
            wrapper.id = field.id;
            const trigger = document.createElement('div');
            trigger.className = 'custom-select-trigger';
            const selectedContent = document.createElement('div');
            selectedContent.className = 'selected-option-content';
            trigger.appendChild(selectedContent);
            const arrow = document.createElement('div');
            arrow.className = 'arrow';
            trigger.appendChild(arrow);
            const optionsContainer = document.createElement('div');
            optionsContainer.className = 'custom-select-options';
            wrapper.appendChild(trigger);
            wrapper.appendChild(optionsContainer);
            let currentValue = initialValue || '';
            let currentOptions = field.options || [];
            let searchInput = null;
            const syncOptionSelectionState = () => {
                optionsContainer.querySelectorAll('.option').forEach(opt => {
                    opt.classList.toggle('selected', opt.dataset.value === currentValue);
                });
            };
            const updateSelectedDisplay = (value) => {
                let logo = null;
                let capabilities = [];
                let text = value;
                let domain = null;
                const selectedOptionData = currentOptions.find(opt => opt.value === value);
                if (selectedOptionData) {
                    text = selectedOptionData.text;
                    logo = selectedOptionData.logo;
                    capabilities = selectedOptionData.capabilities || [];
                    domain = selectedOptionData.domain;
                } else if (value) {
                    if (typeof getModelMetadata === 'function') {
                        const metadata = getModelMetadata(value, modelsDevCache);
                        logo = metadata.logo;
                        capabilities = metadata.capabilities;
                    }
                }
                if (value) {
                    let iconHtml = '';
                    if (logo) {
                        iconHtml = `<img src="${logo}" alt="">`;
                    } else if (domain) {
                        iconHtml = `<img src="https://favicon.im/${domain}" alt="">`;
                    }
                    let capabilitiesHtml = '';
                    if (capabilities && capabilities.length > 0) {
                        capabilitiesHtml = `<div class="capabilities-badges" style="margin-left: auto;">${capabilities.map(c => `<span class="capability-badge ${c.type}">${c.label}</span>`).join('')}</div>`;
                    }
                    selectedContent.innerHTML = `
                        <div style="display: flex; gap: 10px; align-items: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${iconHtml}
                            <span style="overflow: hidden; text-overflow: ellipsis;">${text}</span>
                        </div>
                        ${capabilitiesHtml}
                    `;
                    selectedContent.style.display = 'flex';
                    selectedContent.style.alignItems = 'center';
                    selectedContent.style.justifyContent = 'space-between';
                    selectedContent.style.width = '100%';
                } else {
                    selectedContent.innerHTML = '<span>请选择...</span>';
                    selectedContent.style.display = 'block';
                }
            };
            const setCurrentValue = (newValue, { triggerChange = true } = {}) => {
                const normalizedValue = (newValue || '').trim();
                if (currentValue !== normalizedValue) {
                    currentValue = normalizedValue;
                    if (triggerChange && typeof onValueChange === 'function') {
                        onValueChange(currentValue);
                    }
                } else {
                    currentValue = normalizedValue;
                }
                updateSelectedDisplay(currentValue);
                syncOptionSelectionState();
                if (searchInput) {
                    searchInput.value = currentValue;
                }
            };
            const commitManualInput = ({ triggerChange = true, closeDropdown = false } = {}) => {
                if (!searchInput) return;
                const manualValue = searchInput.value.trim();
                if (!manualValue) {
                    searchInput.value = currentValue;
                    if (closeDropdown) {
                        wrapper.classList.remove('open');
                    }
                    return;
                }
                setCurrentValue(manualValue, { triggerChange });
                if (closeDropdown) {
                    wrapper.classList.remove('open');
                }
            };
            if (field.searchable) {
                searchInput = document.createElement('input');
                searchInput.type = 'text';
                searchInput.placeholder = '搜索或输入模型ID...';
                searchInput.className = 'custom-select-search';
                searchInput.style.cssText = `
                    width: calc(100% - 24px);
                    margin: 8px 12px;
                    padding: 8px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    font-size: 13px;
                    box-sizing: border-box;
                `;
                searchInput.addEventListener('click', e => e.stopPropagation());
                searchInput.addEventListener('input', () => {
                    const searchTerm = searchInput.value.toLowerCase();
                    optionsContainer.querySelectorAll('.option').forEach(opt => {
                        const text = opt.textContent.toLowerCase();
                        opt.style.display = text.includes(searchTerm) ? 'flex' : 'none';
                    });
                });
                searchInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commitManualInput({ closeDropdown: true });
                    } else if (event.key === 'Escape') {
                        wrapper.classList.remove('open');
                        searchInput.value = currentValue;
                    }
                });
                searchInput.addEventListener('blur', () => {
                    if (!wrapper.classList.contains('open')) {
                        commitManualInput({ triggerChange: false });
                    }
                });
                optionsContainer.appendChild(searchInput);
            }
            if (field.fetchable) {
                const fetchButton = document.createElement('button');
                fetchButton.className = 'custom-select-fetch-btn';
                fetchButton.innerHTML = '🔄 刷新列表';
                fetchButton.style.cssText = `
                    display: block; width: calc(100% - 24px); margin: 0 12px 8px; padding: 8px;
                    font-size: 13px; background-color: #f3f4f6; border: 1px solid #e5e7eb;
                    border-radius: 6px; cursor: pointer; transition: background-color 0.2s;
                `;
                fetchButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (field.onFetch) field.onFetch(wrapper);
                });
                optionsContainer.appendChild(fetchButton);
            }
            const optionsList = document.createElement('div');
            optionsList.className = 'custom-select-options-list';
            optionsList.style.maxHeight = '180px';
            optionsList.style.overflowY = 'auto';
            optionsContainer.appendChild(optionsList);
            const populateOptions = () => {
                optionsList.innerHTML = '';
                currentOptions.forEach(optionData => {
                    const optionEl = document.createElement('div');
                    optionEl.className = 'option';
                    optionEl.dataset.value = optionData.value;
                    if (optionData.title) {
                        optionEl.title = optionData.title;
                    }
                    const domain = optionData.domain;
                    const logo = optionData.logo;
                    const capabilities = optionData.capabilities || [];
                    let iconHtml = '';
                    if (logo) {
                        iconHtml = `<img src="${logo}" alt="">`;
                    } else if (domain) {
                        iconHtml = `<img src="https://favicon.im/${domain}" alt="">`;
                    }
                    let capabilitiesHtml = '';
                    if (capabilities.length > 0) {
                        capabilitiesHtml = `<div class="capabilities-badges">${capabilities.map(c => `<span class="capability-badge ${c.type}">${c.label}</span>`).join('')}</div>`;
                    }
                    optionEl.innerHTML = `
                        <div class="option-main">
                            ${iconHtml}
                            <span>${optionData.text}</span>
                        </div>
                        ${capabilitiesHtml}
                    `;
                    if (optionData.value === currentValue) {
                        optionEl.classList.add('selected');
                    }
                    optionEl.addEventListener('click', () => {
                        setCurrentValue(optionData.value);
                        wrapper.classList.remove('open');
                    });
                    optionsList.appendChild(optionEl);
                });
            };
            trigger.addEventListener('click', () => {
                wrapper.classList.toggle('open');
                if (wrapper.classList.contains('open') && searchInput) {
                    setTimeout(() => searchInput.focus(), 0);
                }
            });
            document.addEventListener('click', (e) => {
                if (!wrapper.contains(e.target)) {
                    if (wrapper.classList.contains('open')) {
                        commitManualInput({ triggerChange: false });
                    }
                    wrapper.classList.remove('open');
                }
            });
            wrapper.getValue = () => {
                if (searchInput) {
                    return searchInput.value.trim();
                }
                return currentValue;
            };
            wrapper.setValue = (newValue) => {
                setCurrentValue(newValue, { triggerChange: false });
            };
            wrapper.setOptions = (newOptions, defaultValue = null) => {
                currentOptions = newOptions || [];
                populateOptions();
                let targetValue = currentValue;
                if (defaultValue !== null && defaultValue !== undefined) {
                    targetValue = defaultValue;
                } else if (!currentOptions.some(opt => opt.value === currentValue)) {
                    targetValue = currentOptions.length > 0 ? currentOptions[0].value : '';
                }
                setCurrentValue(targetValue, { triggerChange: false });
            };
            populateOptions();
            setCurrentValue(currentValue, { triggerChange: false });
            return wrapper;
        }
        let aiConfig = JSON.parse(localStorage.getItem('aiConfig') || '{}');
        const currentProvider = aiConfig.provider || 'default';
        const currentEndpoint = aiConfig.endpoint || '';
        const currentApiKey = aiConfig.apiKey || '';
        const currentAzureApiVersion = aiConfig.azureApiVersion || '2023-07-01-preview';
        const currentModelId = aiConfig.model || '';
        const currentTemperature = aiConfig.temperature !== undefined ? aiConfig.temperature : 0.7;
        const currentMaxTokens = aiConfig.max_tokens !== undefined ? aiConfig.max_tokens : 8000;
        const currentDisableCorrection = aiConfig.disableCorrection || false;
        const currentDisableMaxTokens = aiConfig.disableMaxTokens || false;
        const currentBatchConcurrency = aiConfig.batchConcurrency || 'sequential';
        const currentXiaoyaAiMode = aiConfig.xiaoyaAiMode || 'deep_think';
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.5s cubic-bezier(0.19, 1, 0.22, 1);
            backdrop-filter: blur(8px);
        `;
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            padding: 32px 40px;
            border-radius: 20px;
            width: 650px;
            max-width: 95%;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.18), 0 0 25px rgba(0,0,0,0.12);
            transform: scale(0.95) translateY(15px);
            opacity: 0;
            transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1);
            position: relative;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            border: 1px solid rgba(255, 255, 255, 0.2);
        `;
        const title = document.createElement('h2');
        title.innerHTML = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 12px; color: #4f46e5;">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
            </svg>
            AI 助手设置
        `;
        title.style.cssText = `
            margin-top: 0;
            margin-bottom: 35px;
            text-align: center;
            color: #1f2937;
            font-size: 26px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        `;
        const titleUnderline = document.createElement('div');
        titleUnderline.style.cssText = `
            position: absolute;
            bottom: -12px;
            left: 50%;
            transform: translateX(-50%);
            width: 80px;
            height: 3px;
            background: linear-gradient(to right, #6366f1, #8b5cf6);
            border-radius: 3px;
        `;
        title.appendChild(titleUnderline);
        const form = document.createElement('div');
        form.style.cssText = `
            overflow-y: auto;
            padding-right: 18px;
            padding-left: 18px;
            margin-bottom: 25px;
            flex-grow: 1;
            scrollbar-width: thin;
            scrollbar-color: #cbd5e1 #f1f5f9;
        `;
        form.innerHTML = `
            <style>
                .ai-settings-form::-webkit-scrollbar { width: 6px; }
                .ai-settings-form::-webkit-scrollbar-track {
                    background: #f1f5f9;
                    border-radius: 3px;
                }
                .ai-settings-form::-webkit-scrollbar-thumb {
                    background-color: #cbd5e1;
                    border-radius: 3px;
                    transition: background-color 0.3s;
                }
                .ai-settings-form::-webkit-scrollbar-thumb:hover {
                    background-color: #94a3b8;
                }
                .ai-settings-form .form-group {
                    margin-bottom: 24px;
                    display: flex;
                    flex-direction: column;
                    flex-wrap: wrap;
                    justify-content: center;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .ai-settings-form label {
                    margin-bottom: 10px;
                    font-weight: 600;
                    color: #374151;
                    font-size: 14.5px;
                    display: flex;
                    align-items: center;
                }
                .ai-settings-form label::before {
                    content: "";
                    display: inline-block;
                    width: 4px;
                    height: 14px;
                    background: #6366f1;
                    margin-right: 8px;
                    border-radius: 2px;
                    vertical-align: middle;
                }
                .ai-settings-form input:not([type="checkbox"]), .ai-settings-form select {
                    padding: 12px 16px;
                    border: 1px solid #d1d5db;
                    border-radius: 10px;
                    font-size: 14.5px;
                    background-color: #fff;
                    transition: all 0.3s ease;
                    outline: none;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
                }
                .ai-settings-form input:not([type="checkbox"]):focus, .ai-settings-form select:focus {
                    border-color: #6366f1;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
                    transform: translateY(-1px);
                }
                .ai-settings-form input:not([type="checkbox"]):hover, .ai-settings-form select:hover {
                    border-color: #a5b4fc;
                }
                .ai-settings-form .range-group {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .ai-settings-form input[type="range"] {
                    flex-grow: 1;
                    padding: 0;
                    height: 8px;
                    cursor: pointer;
                    accent-color: #6366f1;
                    border-radius: 4px;
                    appearance: none;
                    background: linear-gradient(to right, #6366f1, #8b5cf6);
                }
                .ai-settings-form input[type="range"]::-webkit-slider-thumb {
                    appearance: none;
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: #fff;
                    border: 2px solid #6366f1;
                    cursor: pointer;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    transition: all 0.2s;
                }
                .ai-settings-form input[type="range"]::-webkit-slider-thumb:hover {
                    transform: scale(1.2);
                    box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);
                }
                .ai-settings-form .range-value {
                    font-size: 14px;
                    color: #4b5569;
                    min-width: 40px;
                    text-align: center;
                    background: #f1f5f9;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-weight: 600;
                }
                .ai-settings-form .form-group.hidden {
                    opacity: 0;
                    max-height: 0;
                    margin-bottom: 0;
                    display: none;
                }
                .url-preview-container {
                    margin-top: 20px;
                    padding: 18px;
                    border: 1px dashed #c7d2fe;
                    border-radius: 12px;
                    background-color: #f5f7ff;
                    font-size: 13.5px;
                    line-height: 1.6;
                    color: #4b5569;
                    word-break: break-all;
                    transition: all 0.3s ease;
                }
                .url-preview-container:hover {
                    border-color: #818cf8;
                    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
                    transform: translateY(-1px);
                }
                .url-preview-container strong {
                    color: #1f2937;
                    font-weight: 700;
                }
                .url-preview-container .status {
                    margin-top: 10px;
                    font-weight: 600;
                    padding: 6px 12px;
                    border-radius: 8px;
                    display: inline-block;
                }
                .url-preview-container .status.valid {
                    color: #047857;
                    background-color: #d1fae5;
                }
                .url-preview-container .status.invalid {
                    color: #b91c1c;
                    background-color: #fee2e2;
                }
                .url-preview-container .status.warning {
                    color: #92400e;
                    background-color: #ffedd5;
                }
                .url-preview-container .correction-suggestion {
                    margin-top: 8px;
                    font-style: italic;
                }
                .url-preview-container .correction-suggestion code {
                    background-color: #e5e7eb;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-family: Microsoft YaHei;
                }
                .ai-settings-form details {
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    margin-top: 30px;
                    background-color: #f9fafb;
                    transition: all 0.3s ease;
                    overflow: hidden;
                    margin-bottom: 20px;
                }
                .ai-settings-form details[open] {
                    background-color: #fff;
                    border-color: #c7d2fe;
                    box-shadow: 0 8px 15px rgba(0,0,0,0.05);
                }
                .ai-settings-form summary {
                    padding: 14px 18px;
                    font-weight: 600;
                    color: #374151;
                    cursor: pointer;
                    list-style: none;
                    display: flex;
                    align-items: center;
                    transition: background-color 0.2s;
                    position: relative;
                    border-radius: 12px;
                }
                .ai-settings-form summary:hover {
                    background-color: #f3f4f6;
                }
                .ai-settings-form summary::-webkit-details-marker {
                    display: none;
                }
                .ai-settings-form summary::before {
                    content: '';
                    width: 10px;
                    height: 10px;
                    margin-right: 10px;
                    border-right: 2px solid #6366f1;
                    border-bottom: 2px solid #6366f1;
                    transition: transform 0.3s ease-in-out;
                    display: inline-block;
                    transform: rotate(-45deg);
                }
                .ai-settings-form details[open] > summary::before {
                    transform: rotate(45deg);
                }
                .ai-settings-form details > .advanced-content-wrapper {
                    padding: 24px 20px 15px 20px;
                    border-top: 1px solid #e5e7eb;
                    animation: fadeIn 0.4s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .custom-select-wrapper {
                    position: relative;
                    user-select: none;
                }
                .custom-select-trigger {
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    border: 1px solid #d1d5db;
                    border-radius: 10px;
                    font-size: 14.5px;
                    background-color: #fff;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
                }
                .custom-select-trigger:hover {
                    border-color: #a5b4fc;
                }
                .custom-select-wrapper.open .custom-select-trigger {
                    border-color: #6366f1;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
                }
                .custom-select-trigger .selected-option-content {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-grow: 1;
                }
                .custom-select-trigger .selected-option-content img {
                    width: 24px;
                    height: 24px;
                    border-radius: 4px;
                    object-fit: contain;
                }
                .custom-select-trigger .arrow {
                    width: 12px;
                    height: 12px;
                    border-right: 2px solid #6b7280;
                    border-bottom: 2px solid #6b7280;
                    transform: rotate(45deg);
                    transition: transform 0.3s ease;
                    margin-left: 10px;
                }
                .custom-select-wrapper.open .arrow {
                    transform: rotate(225deg);
                }
                .custom-select-options {
                    position: absolute;
                    top: calc(100% + 8px);
                    left: 0;
                    width: 100%;
                    background-color: #fff;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    box-shadow: 0 10px 20px rgba(0,0,0,0.1);
                    z-index: 10;
                    max-height: 350px;
                    overflow-y: auto;
                    opacity: 0;
                    transform: translateY(-10px);
                    visibility: hidden;
                    transition: all 0.3s ease;
                }
                .custom-select-wrapper.open .custom-select-options {
                    opacity: 1;
                    transform: translateY(0);
                    visibility: visible;
                }
                .custom-select-options .option {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 6px;
                    padding: 10px 16px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                    border-bottom: 1px solid #f3f4f6;
                }
                .custom-select-options .option:last-child {
                    border-bottom: none;
                }
                .custom-select-options .option:hover {
                    background-color: #f3f4f6;
                }
                .custom-select-options .option.selected {
                    background-color: #eef2ff;
                    color: #4f46e5;
                    font-weight: 600;
                }
                .custom-select-options .option .option-main {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    width: 100%;
                }
                .custom-select-options .option img {
                    width: 24px;
                    height: 24px;
                    border-radius: 4px;
                    object-fit: contain;
                }
                .capabilities-badges {
                    display: flex;
                    gap: 6px;
                    margin-left: 34px;
                    flex-wrap: wrap;
                }
                .capability-badge {
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 600;
                    text-transform: uppercase;
                    border: 1px solid rgba(0,0,0,0.05);
                }
                .capability-badge.vision {
                    background-color: #d1fae5;
                    color: #047857;
                }
                .capability-badge.tool {
                    background-color: #e0f2fe;
                    color: #0369a1;
                }
                .capability-badge.reasoning {
                    background-color: #fce7f3;
                    color: #be185d;
                }
                .capability-badge.text {
                    background-color: #f3f4f6;
                    color: #4b5563;
                }
                .capability-badge.media {
                    background-color: #e0e7ff;
                    color: #4338ca;
                }
            </style>
        `;
        form.classList.add('ai-settings-form');
        const closeButton = document.createElement('button');
        closeButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        closeButton.style.cssText = `
            position: absolute;
            top: 15px;
            right: 15px;
            background: #f3f4f6;
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            cursor: pointer;
            color: #6b7280;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.08);
        `;
        closeButton.onmouseover = () => {
            closeButton.style.backgroundColor = '#e5e7eb';
            closeButton.style.transform = 'rotate(90deg)';
            closeButton.style.color = '#000';
            closeButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.12)';
        };
        closeButton.onmouseout = () => {
            closeButton.style.backgroundColor = '#f3f4f6';
            closeButton.style.transform = 'rotate(0deg)';
            closeButton.style.color = '#6b7280';
            closeButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.08)';
        };
        closeButton.onclick = () => closeModal();
        const fields = [
            {
                id: 'ai-provider',
                label: 'AI 提供商:',
                type: 'custom-select',
                options: [
                    { value: 'default', text: '默认 - 小雅 AI (无需配置)', domain: 'www.ai-augmented.com' },
                    { value: 'openai', text: 'OpenAI / 兼容 OpenAI 接口', domain: 'openai.com' },
                    { value: 'gemini', text: 'Google Gemini', domain: 'google.com' },
                    { value: 'anthropic', text: 'Anthropic Claude', domain: 'anthropic.com' },
                    { value: 'azure', text: 'Azure OpenAI', domain: 'ai.azure.com' }
                ],
                value: currentProvider
            },
            {
                id: 'openai-preset',
                label: 'OpenAI 兼容接口预设:',
                type: 'custom-select',
                options: OPENAI_COMPATIBLE_PRESETS.map(p => ({
                    value: p.id,
                    text: p.name,
                    domain: p.domain,
                    title: p.notes
                })),
                value: aiConfig.openaiPreset || 'custom',
                dependsOn: ['openai']
            },
            {
                id: 'xiaoya-ai-mode',
                label: '小雅 AI 模式:',
                type: 'custom-select',
                options: [
                    { value: 'deep_think', text: '深度思考模式 (默认，推理模型)', domain: null },
                    { value: 'no_deep_think', text: '快速模式 (速度快，质量一般)', domain: null }
                ],
                value: currentXiaoyaAiMode,
                dependsOn: ['default']
            },
            {
                id: 'ai-endpoint',
                label: 'API 地址:',
                type: 'text',
                placeholder: '例如: https://api.openai.com/v1/chat/completions',
                value: currentEndpoint,
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure']
            },
            {
                id: 'ai-key',
                label: 'API Key:',
                type: 'password',
                placeholder: '请输入你的 API Key',
                value: currentApiKey,
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure']
            },
            {
                id: 'ai-model',
                label: '模型 ID:',
                type: 'custom-select',
                searchable: true,
                fetchable: true,
                onFetch: (selectWrapper) => fetchModelsAndPopulateDropdown('ai-model', selectWrapper),
                value: currentModelId,
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure']
            },
            {
                id: 'gemini-thinking-enabled',
                label: '启用 Gemini 思考总结:',
                type: 'checkbox',
                value: aiConfig.geminiThinkingEnabled || false,
                dependsOn: ['gemini']
            },
            {
                id: 'gemini-thinking-budget-mode',
                label: '思考预算模式:',
                type: 'custom-select',
                options: [
                    { value: 'dynamic', text: '动态思考 (-1，模型自动决定)', domain: null },
                    { value: 'disabled', text: '关闭思考 (0，适用于简单任务)', domain: null },
                    { value: 'custom', text: '自定义预算', domain: null }
                ],
                value: aiConfig.geminiThinkingBudgetMode || 'dynamic',
                dependsOn: ['gemini_thinking_is_enabled']
            },
            {
                id: 'gemini-thinking-budget-custom',
                label: '自定义思考预算 (Token):',
                type: 'number',
                placeholder: '例如: 1024',
                min: 0,
                value: aiConfig.geminiThinkingBudgetCustom || 8192,
                dependsOn: ['gemini_thinking_budget_is_custom']
            },
            {
                id: 'ai-vision-enabled',
                label: '启用图像处理功能:',
                type: 'checkbox',
                value: aiConfig.visionEnabled || false,
                sectionTitle: '📸 图像处理配置'
            },
            {
                id: 'vision-provider',
                label: '图像识别 (Vision/OCR) 提供商:',
                type: 'custom-select',
                options: [
                    { value: 'main_model', text: '使用主 AI 模型的视觉能力 (默认)', domain: null },
                    { value: 'openai', text: 'OpenAI / 兼容接口', domain: 'openai.com' },
                    { value: 'gemini', text: 'Google Gemini', domain: 'google.com' },
                    { value: 'anthropic', text: 'Anthropic Claude', domain: 'anthropic.com' },
                    { value: 'azure', text: 'Azure OpenAI', domain: 'ai.azure.com' }
                ],
                value: aiConfig.visionProvider || 'main_model'
            },
            {
                id: 'vision-endpoint',
                label: 'Vision API 地址:',
                type: 'text',
                placeholder: '独立的图像识别 API 地址',
                value: aiConfig.visionEndpoint || '',
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure'],
                isVisionField: true
            },
            {
                id: 'vision-api-key',
                label: 'Vision API Key:',
                type: 'password',
                placeholder: '独立的图像识别 API Key',
                value: aiConfig.visionApiKey || '',
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure'],
                isVisionField: true
            },
            {
                id: 'vision-model',
                label: 'Vision 模型 ID:',
                type: 'custom-select',
                searchable: true,
                fetchable: true,
                onFetch: (selectWrapper) => fetchModelsAndPopulateDropdown('vision-model', selectWrapper),
                value: aiConfig.visionModel || '',
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure'],
                isVisionField: true
            },
            {
                id: 'audio-processing-mode',
                label: '媒体处理模式:',
                type: 'custom-select',
                options: [
                    { value: 'main_model', text: '原生媒体理解 (直接分析文件)', domain: null },
                    { value: 'independent_stt', text: '独立STT转录 (兼容模式)', domain: null }
                ],
                value: aiConfig.audioProcessingMode || 'main_model',
                dependsOn: ['gemini'],
                sectionTitle: '🎵 媒体处理配置 (音频/视频)'
            },
            {
                id: 'gemini-analyze-video-frames-enabled',
                label: '同时分析视频画面 (消耗更多Token):',
                type: 'checkbox',
                value: aiConfig.geminiAnalyzeVideoFramesEnabled || false,
                dependsOn: ['gemini_native_media']
            },
            {
                id: 'stt-enabled',
                label: '启用独立STT服务:',
                type: 'checkbox',
                value: aiConfig.sttEnabled || false,
                dependsOn: ['independent_stt']
            },
            {
                id: 'stt-video-enabled',
                label: '启用视频音轨提取:',
                type: 'checkbox',
                value: aiConfig.sttVideoEnabled !== false,
                dependsOn: ['stt_is_enabled']
            },
            {
                id: 'stt-provider',
                label: 'STT 提供商:',
                type: 'custom-select',
                options: [
                    { value: 'openai_compatible', text: 'OpenAI Whisper / 兼容接口 (如 SiliconFlow)', domain: 'openai.com' },
                    { value: 'gemini', text: 'Google Gemini', domain: 'google.com' },
                ],
                value: aiConfig.sttProvider || 'openai_compatible',
                dependsOn: ['stt_is_enabled']
            },
            {
                id: 'stt-endpoint',
                label: 'STT API 地址:',
                type: 'text',
                placeholder: '例如: https://api.siliconflow.cn/v1/audio/transcriptions',
                value: aiConfig.sttEndpoint || '',
                dependsOn: ['stt_is_enabled']
            },
            {
                id: 'stt-api-key',
                label: 'STT API Key:',
                type: 'password',
                placeholder: '请输入 STT 服务的 API Key',
                value: aiConfig.sttApiKey || '',
                dependsOn: ['stt_is_enabled']
            },
            {
                id: 'stt-model',
                label: 'STT 模型 ID:',
                type: 'text',
                placeholder: '例如: FunAudioLLM/SenseVoiceSmall',
                value: aiConfig.sttModel || '',
                dependsOn: ['stt_is_enabled']
            },
            {
                id: 'ai-temperature',
                label: 'Temperature (随机性):',
                type: 'range',
                min: 0,
                max: 1,
                step: 0.1,
                value: currentTemperature,
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure']
            },
            {
                id: 'ai-max-tokens',
                label: 'Max Tokens (最大长度):',
                type: 'number',
                min: 10,
                max: 8000,
                step: 10,
                value: currentMaxTokens,
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure']
            },
            {
                id: 'ai-azure-apiversion',
                label: 'Azure API Version (可选):',
                type: 'text',
                placeholder: '例如: 2024-05-01-preview',
                value: currentAzureApiVersion,
                dependsOn: ['azure']
            },
            {
                id: 'ai-disable-correction',
                label: '禁用 API 地址自动修正/补全:',
                type: 'checkbox',
                value: currentDisableCorrection,
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure']
            },
            {
                id: 'ai-disable-max-tokens',
                label: '不限制 Max Tokens (可能导致费用增加或API出错):',
                type: 'checkbox',
                value: currentDisableMaxTokens,
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure']
            },
            {
                id: 'ai-batch-concurrency',
                label: 'AI 批量处理并发数:',
                type: 'number',
                min: 1,
                placeholder: '输入数字 (1 = 顺序处理, >1 = 并发处理)',
                value: currentBatchConcurrency === 'sequential' ? 1 : (parseInt(currentBatchConcurrency, 10) || 2),
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure', 'default']
            },
            {
                id: 'ai-request-interval',
                label: 'AI 顺序处理请求间隔 (毫秒):',
                type: 'number',
                min: 0,
                placeholder: '例如: 500 (表示 0.5 秒)',
                value: aiConfig.requestInterval || 1000,
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure', 'default']
            },
            {
                id: 'ai-auto-scroll',
                label: '批量处理时自动滚动到活动题目:',
                type: 'checkbox',
                value: aiConfig.autoScrollEnabled === true,
                dependsOn: ['openai', 'gemini', 'anthropic', 'azure', 'default']
            },
        ];
        function createHelpBox(id, summaryText, contentHtml) {
            const container = document.createElement('div');
            container.id = id;
            container.style.marginBottom = '20px';
            const details = document.createElement('details');
            details.style.cssText = `
                border: 1px solid #d1d5db;
                border-radius: 12px;
                background-color: #f9fafb;
                transition: all 0.3s ease;
                overflow: hidden;
            `;
            details.addEventListener('mouseenter', () => {
                if (!details.open) {
                    details.style.borderColor = '#a5b4fc';
                    details.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                }
            });
            details.addEventListener('mouseleave', () => {
                if (!details.open) {
                    details.style.borderColor = '#d1d5db';
                    details.style.boxShadow = 'none';
                }
            });
            details.addEventListener('toggle', () => {
                if (details.open) {
                    details.style.backgroundColor = '#fff';
                    details.style.borderColor = '#c7d2fe';
                    details.style.boxShadow = '0 8px 15px rgba(0,0,0,0.05)';
                } else {
                    details.style.backgroundColor = '#f9fafb';
                    details.style.borderColor = '#d1d5db';
                    details.style.boxShadow = 'none';
                }
            });
            const summary = document.createElement('summary');
            summary.style.cssText = `
                padding: 12px 16px;
                font-weight: 600;
                color: #4f46e5;
                cursor: pointer;
                display: flex;
                align-items: center;
                transition: background-color 0.2s;
                position: relative;
                font-size: 14.5px;
            `;
            summary.textContent = summaryText;
            const content = document.createElement('div');
            content.style.cssText = `
                padding: 0px 20px 20px 42px;
                border-top: 1px solid #e5e7eb;
                font-size: 13.5px;
                color: #4b5569;
                line-height: 1.6;
            `;
            const template = document.createElement('template');
            template.innerHTML = contentHtml.trim();
            template.content.querySelectorAll('p, ul, ol').forEach(el => {
                el.style.margin = '12px 0';
            });
            template.content.querySelectorAll('ul, ol').forEach(el => {
                el.style.paddingLeft = '25px';
            });
            template.content.querySelectorAll('li').forEach(el => {
                el.style.marginBottom = '8px';
            });
            template.content.querySelectorAll('code').forEach(el => {
                el.style.backgroundColor = '#eef2ff';
                el.style.color = '#4338ca';
                el.style.padding = '2px 6px';
                el.style.borderRadius = '4px';
                el.style.fontFamily = 'monospace';
                el.style.fontSize = '12.5px';
                el.style.border = '1px solid #e0e7ff';
            });
            content.appendChild(template.content);
            details.appendChild(summary);
            details.appendChild(content);
            container.appendChild(details);
            return container;
        }
        const promptPlaceholders = {
            '1': ['{questionType}', '{questionTitle}', '{optionsText}'],
            '2': ['{questionType}', '{questionTitle}', '{optionsText}'],
            '5': ['{questionType}', '{questionTitle}', '{optionsText}'],
            '4': ['{questionType}', '{questionTitle}', '{answerContent}'],
            '6': ['{questionType}', '{questionTitle}', '{answerContent}'],
            '10': ['{questionType}', '{questionTitle}', '{language}', '{max_time}', '{max_memory}', '{answerContent}'],
            '12': ['{questionType}', '{questionTitle}', '{optionsText}'],
            '13': ['{questionType}', '{questionTitle}', '{stemsText}', '{optionsText}']
        };
        let customPrompts = JSON.parse(localStorage.getItem('aiCustomPrompts') || '{}');
        const inputElements = {};
        fields.forEach(field => {
            if (field.sectionTitle) {
                const sectionHeader = document.createElement('div');
                sectionHeader.style.cssText = `
                    margin-top: 35px;
                    margin-bottom: 20px;
                    padding: 12px 20px;
                    background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
                    border-left: 4px solid #6366f1;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    color: #4f46e5;
                    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1);
                `;
                sectionHeader.textContent = field.sectionTitle;
                form.appendChild(sectionHeader);
            }
            if (field.id === 'vision-provider') {
                const visionHelp = createHelpBox(
                    'vision-help',
                    '如何配置图像处理功能？',
                    `
                    <p>这个高级功能允许你将 <strong>图像识别 (Vision)</strong> 和 <strong>文本推理 (LLM)</strong> 分开处理，实现“专业的事交给专业的模型”。</p>
                    <p style="color: #ef4444; font-weight: bold;">注意：小雅 AI 不支持识图，如需识别图片请使用独立配置！</p>
                    <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.7;">
                        <li><strong>默认选项:</strong> 使用主 AI 模型的视觉能力，简单直接。</li>
                        <li><strong>独立配置:</strong> 指定一个专门的视觉模型处理图片，再将结果交给主 AI 模型进行答题。</li>
                    </ul>
                    <p><strong>优势:</strong> 可以组合使用不同模型的优点，例如用最强的视觉模型识图，用最经济的文本模型推理，从而实现<strong>成本和效果的最佳平衡</strong>。</p>
                    <p style="margin-top: 15px;"><strong>免费方案推荐 - SiliconFlow + DeepSeek-OCR:</strong></p>
                    <p style="font-size: 12px; color: #6b7280; font-style: italic; margin-top: -10px; margin-bottom: 10px;">(注：此为免费方案推荐，无任何商业合作，纯粹因其免费且好用)</p>
                    <p style="font-size: 13px; color: #555; margin-top: -8px;">这是由深度求索（DeepSeek AI）推出的一个视觉语言模型，性能强大且限免。</p>
                    <ul style="margin: 10px 0; padding-left: 20px; font-family: 'Courier New', Courier, monospace; font-size: 13px; background-color: #f3f4f6; padding: 10px 15px 10px 30px; border-radius: 8px;">
                        <li><strong>Vision Provider:</strong> 选 "独立的 OpenAI / 兼容接口"</li>
                        <li><strong>Vision Endpoint:</strong> <code>https://api.siliconflow.cn/v1/chat/completions</code></li>
                        <li><strong>Vision API Key:</strong> 填入你在 SiliconFlow 获取的 Key</li>
                        <li><strong>Vision Model ID:</strong> <code>deepseek-ai/DeepSeek-OCR</code></li>
                    </ul>
                    <p><strong>工作流程示例:</strong> 当你配置好以上视觉模型，并将主AI设置为小雅AI后，脚本处理图片题时会：</p>
                    <ol style="margin: 10px 0; padding-left: 20px; line-height: 1.7; font-size: 13px;">
                        <li><strong>第一步 (视觉):</strong> 将题目图片发送给 SiliconFlow 平台上的 DeepSeek-OCR 模型进行识别。</li>
                        <li><strong>第二步 (推理):</strong> 将 DeepSeek-OCR 返回的图片描述文本，与原题目的其他文字信息整合，再发送给小雅 AI 进行最终的答题推理。</li>
                    </ol>
                    `
                );
                form.appendChild(visionHelp);
            }
            if (field.id === 'stt-provider') {
                const sttHelp = createHelpBox(
                    'stt-help',
                    '如何配置媒体处理 (音频/视频)？',
                    `
                    <p>脚本现在支持两种先进的媒体处理模式，以应对包含音频或视频的题目：</p>
                    <h4 style="margin: 20px 0 10px 0; color: #1e3a8a; font-size: 15px;">模式一：原生媒体理解 (推荐)</h4>
                    <p style="font-size: 13px; color: #555; margin-top: -8px;">当你的主AI模型足够强大时（目前主要是 <strong>Google Gemini 2.5+</strong> 系列），脚本可以直接将整个音频或视频文件发送给AI进行一体化分析。这是<strong>效果最好、信息最全</strong>的方式。</p>
                    <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.7; font-size: 13.5px;">
                        <li><strong>配置：</strong>
                            <ol style="padding-left: 20px; margin-top: 5px;">
                                <li>在“AI提供商”中选择 <code>Google Gemini</code>。</li>
                                <li>下方的“媒体处理模式”会自动出现，选择 <code>原生媒体理解</code>。</li>
                                <li>(可选) 对于视频题，你可以决定是否勾选“<strong>同时分析视频画面</strong>”。勾选会提供最全面的分析，但会消耗更多Token；不勾选则只会分析音轨。</li>
                            </ol>
                        </li>
                    </ul>
                    <h4 style="margin: 20px 0 10px 0; color: #1e3a8a; font-size: 15px;">模式二：独立STT服务 (兼容模式)</h4>
                    <p style="font-size: 13px; color: #555; margin-top: -8px;">当你的主AI模型不支持直接处理音频（如大多数OpenAI、Claude模型），或你希望使用专门的语音转文本服务时，此模式是最佳选择。它会先将音频/音轨转录成文字，再将文字交给主AI作答。</p>
                    <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.7; font-size: 13.5px;">
                        <li><strong>配置：</strong>
                            <ol style="padding-left: 20px; margin-top: 5px;">
                                <li>在“媒体处理模式”中选择 <code>独立STT转录</code>。</li>
                                <li>勾选“<strong>启用独立STT服务</strong>”。</li>
                                <li>填写下方出现的 STT 提供商、API地址、Key和模型ID。</li>
                            </ol>
                        </li>
                    </ul>
                    <p style="margin-top: 25px;"><strong>免费方案推荐 (独立STT模式) - SiliconFlow:</strong></p>
                    <p style="font-size: 12px; color: #6b7280; font-style: italic; margin-top: -10px; margin-bottom: 10px;">(注：此为免费方案推荐，无任何商业合作，纯粹因其免费且好用)</p>
                    <ul style="margin: 10px 0; padding-left: 20px; font-family: 'Courier New', Courier, monospace; font-size: 13px; background-color: #f3f4f6; padding: 10px 15px 10px 30px; border-radius: 8px;">
                        <li><strong>STT Provider:</strong> 选 "OpenAI Whisper / 兼容接口"</li>
                        <li><strong>STT Endpoint:</strong> <code>https://api.siliconflow.cn/v1/audio/transcriptions</code></li>
                        <li><strong>STT API Key:</strong> 填入你在 SiliconFlow 获取的 Key</li>
                        <li><strong>STT Model ID:</strong> 推荐 <code>FunAudioLLM/SenseVoiceSmall</code> (速度快) 或 <code>TeleAI/TeleSpeechASR</code> (方言识别强)</li>
                    </ul>
                    `
                );
                form.appendChild(sttHelp);
            }
            const group = document.createElement('div');
            group.className = 'form-group';
            group.dataset.dependsOn = field.dependsOn ? JSON.stringify(field.dependsOn) : '';
            const label = document.createElement('label');
            label.textContent = field.label;
            label.htmlFor = field.id;
            let input;
            if (field.type === 'custom-select') {
                const onValueChange = (newValue) => {
                    if (field.id === 'ai-provider') {
                        if (newValue !== 'openai') {
                            inputElements['openai-preset'].setValue('custom');
                        }
                        const audioModeSelect = inputElements['audio-processing-mode'];
                        if (audioModeSelect) {
                            const currentAudioMode = audioModeSelect.getValue();
                            let newOptions, newDefaultValue;
                            if (newValue === 'gemini') {
                                newOptions = [
                                    { value: 'main_model', text: '原生媒体理解 (直接分析文件)', domain: null },
                                    { value: 'independent_stt', text: '独立STT转录 (兼容模式)', domain: null }
                                ];
                                newDefaultValue = ['main_model', 'independent_stt'].includes(currentAudioMode) ? currentAudioMode : 'main_model';
                            } else {
                                newOptions = [
                                    { value: 'independent_stt', text: '独立STT转录 (兼容模式)', domain: null }
                                ];
                                newDefaultValue = 'independent_stt';
                            }
                            audioModeSelect.setOptions(newOptions, newDefaultValue);
                            const changeEvent = new Event('change', { bubbles: true });
                            audioModeSelect.dispatchEvent(changeEvent);
                        }
                    } else if (field.id === 'openai-preset') {
                        const preset = OPENAI_COMPATIBLE_PRESETS.find(p => p.id === newValue);
                        if (preset) {
                            inputElements['ai-endpoint'].value = preset.endpoint;
                            inputElements['ai-endpoint'].dispatchEvent(new Event('input'));
                        }
                    } else if (field.id === 'audio-processing-mode') {
                        updateFieldVisibility();
                    }
                    updateFieldVisibility();
                    updateUrlPreview();
                };
                if (field.id === 'ai-model' || field.id === 'vision-model') {
                    const initialModelId = field.value;
                    if (initialModelId) {
                        const cachedModelsDev = modelsDevCache;
                        const { logo, capabilities } = getModelMetadata(initialModelId, cachedModelsDev);
                        if (logo || capabilities.length > 0) {
                            if (!field.options) field.options = [];
                            const existingOpt = field.options.find(o => o.value === initialModelId);
                            if (existingOpt) {
                                existingOpt.logo = logo;
                                existingOpt.capabilities = capabilities;
                            } else {
                                field.options.push({
                                    value: initialModelId,
                                    text: initialModelId,
                                    logo: logo,
                                    capabilities: capabilities
                                });
                            }
                        }
                    }
                }
                input = createCustomSelect(field, field.value, onValueChange);
                group.appendChild(input);
                if (field.id === 'audio-processing-mode') {
                    input.addEventListener('change', onValueChange);
                }
            } else if (field.type === 'select') {
                input = document.createElement('select');
                field.options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.text;
                    if (opt.value === field.value) option.selected = true;
                    input.appendChild(option);
                });
                input.onchange = () => updateFieldVisibility();
                group.appendChild(input);
            } else if (field.type === 'range') {
                const rangeGroup = document.createElement('div');
                rangeGroup.className = 'range-group';
                input = document.createElement('input');
                input.type = 'range';
                input.min = field.min;
                input.max = field.max;
                input.step = field.step;
                input.value = field.value;
                const valueDisplay = document.createElement('span');
                valueDisplay.className = 'range-value';
                valueDisplay.textContent = parseFloat(input.value).toFixed(1);
                input.oninput = () => {
                    valueDisplay.textContent = parseFloat(input.value).toFixed(1);
                };
                rangeGroup.appendChild(input);
                rangeGroup.appendChild(valueDisplay);
                group.appendChild(label);
                group.appendChild(rangeGroup);
                form.appendChild(group);
                inputElements[field.id] = input;
                return;
            } else if (field.type === 'checkbox') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = field.value;
                input.style.width = '20px';
                input.style.height = '20px';
                input.style.marginRight = '10px';
                input.style.verticalAlign = 'middle';
                const checkboxLabel = document.createElement('span');
                if (field.id === 'ai-vision-enabled') {
                    checkboxLabel.innerHTML = '勾选后，AI 将能够识别题目或选项中的图片内容。<strong>请确保模型支持<span style="color: #047857;">视觉</span>。</strong>';
                } else if (field.id === 'gemini-thinking-enabled') {
                    checkboxLabel.innerHTML = '勾选后，将实时输出思考总结。<strong style="color: #4f46e5;">可用于 2.5 系列模型。</strong>';
                } else if (field.id === 'gemini-analyze-video-frames-enabled') {
                    checkboxLabel.innerHTML = '勾选后，AI 将分析视频的关键画面内容，提升理解效果。<strong style="color: #c026d3;">消耗Token较多，请确保模型支持<span style="color: #4338ca">媒体</span>。</strong>';
                } else if (field.id === 'stt-enabled') {
                    checkboxLabel.innerHTML = '勾选后，启用独立的语音识别功能。';
                } else if (field.id === 'stt-video-enabled') {
                    checkboxLabel.innerHTML = '勾选后，将自动提取视频中的音轨进行转录。<strong style="color: #c026d3;">这会消耗更多资源和时间。</strong>';
                } else if (field.id === 'ai-disable-correction') {
                    checkboxLabel.innerHTML = '强制使用填写的地址，不进行任何自动修改。';
                } else if (field.id === 'ai-disable-max-tokens') {
                    checkboxLabel.innerHTML = '勾选后将不发送 max_tokens 参数，某些 API 可能不支持。';
                } else if (field.id === 'ai-auto-scroll') {
                    checkboxLabel.innerHTML = '勾选后，在进行 AI 批量处理时，视图会自动滚动到正在处理的题目，方便实时监控 AI 输出和思考过程。';
                }
                checkboxLabel.style.verticalAlign = 'middle';
                checkboxLabel.style.fontSize = '13px';
                checkboxLabel.style.color = '#555';
                const checkboxContainer = document.createElement('div');
                checkboxContainer.style.display = 'flex';
                checkboxContainer.style.alignItems = 'center';
                checkboxContainer.appendChild(input);
                checkboxContainer.appendChild(checkboxLabel);
                group.appendChild(label);
                group.appendChild(checkboxContainer);
                form.appendChild(group);
                inputElements[field.id] = input;
                return;
            } else if (field.type === 'number') {
                input = document.createElement('input');
                input.type = 'number';
                input.min = field.min;
                input.max = field.max;
                input.step = field.step;
                input.placeholder = field.placeholder || '';
                input.value = field.value;
            } else {
                input = document.createElement('input');
                input.type = field.type;
                input.placeholder = field.placeholder || '';
                input.value = field.value;
            }
            input.id = field.id;
            group.appendChild(label);
            if (field.hasFetchButton) {
                const inputContainer = document.createElement('div');
                inputContainer.style.display = 'flex';
                inputContainer.style.gap = '10px';
                inputContainer.style.alignItems = 'center';
                input.style.flexGrow = '1';
                inputContainer.appendChild(input);
                const fetchButton = document.createElement('button');
                fetchButton.innerHTML = `
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;">
                       <polyline points="23 4 23 10 17 10"></polyline>
                       <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                   </svg>获取`;
                fetchButton.type = 'button';
                fetchButton.style.cssText = `
                   padding: 8px 12px; background-color: #e5e7eb; color: #374151; border: 1px solid #d1d5db;
                   border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s; display: inline-flex; align-items: center;
               `;
                fetchButton.onmouseover = () => { fetchButton.style.backgroundColor = '#d1d5db'; };
                fetchButton.onmouseout = () => { fetchButton.style.backgroundColor = '#e5e7eb'; };
                fetchButton.onclick = () => fetchModelsAndPopulateDropdown(field.id);
                inputContainer.appendChild(fetchButton);
                group.appendChild(inputContainer);
                const modelSearchInput = document.createElement('input');
                modelSearchInput.type = 'text';
                modelSearchInput.id = `${field.id}-search`;
                modelSearchInput.placeholder = '搜索模型...';
                modelSearchInput.style.marginTop = '8px';
                modelSearchInput.style.display = 'none';
                modelSearchInput.style.width = 'calc(100% - 30px)';
                modelSearchInput.style.padding = '8px 12px';
                modelSearchInput.style.border = '1px solid #d1d5db';
                modelSearchInput.style.borderRadius = '6px';
                modelSearchInput.style.fontSize = '13px';
                const modelSelect = document.createElement('select');
                modelSelect.id = `${field.id}-select`;
                modelSelect.style.marginTop = '8px';
                modelSelect.style.display = 'none';
                modelSelect.innerHTML = '<option value="">-- 选择一个模型 --</option>';
                modelSelect.onchange = () => {
                    if (modelSelect.value) {
                        input.value = modelSelect.value;
                    }
                };
                modelSearchInput.oninput = () => {
                    const searchTerm = modelSearchInput.value.toLowerCase();
                    let firstVisibleOption = null;
                    for (let i = 0; i < modelSelect.options.length; i++) {
                        const option = modelSelect.options[i];
                        if (option.value === "") {
                            option.style.display = '';
                            continue;
                        }
                        const optionText = option.textContent.toLowerCase();
                        const isVisible = optionText.includes(searchTerm);
                        option.style.display = isVisible ? '' : 'none';
                        if (isVisible && !firstVisibleOption) {
                            firstVisibleOption = option;
                        }
                    }
                };
                group.appendChild(modelSearchInput);
                group.appendChild(modelSelect);
                inputElements[`${field.id}-search`] = modelSearchInput;
                inputElements[`${field.id}-select`] = modelSelect;
            } else {
                group.appendChild(input);
            }
            form.appendChild(group);
            inputElements[field.id] = input;
        });
        const advancedDetails = document.createElement('details');
        const advancedSummary = document.createElement('summary');
        advancedSummary.textContent = '高级设置';
        advancedDetails.appendChild(advancedSummary);
        const advancedContentWrapper = document.createElement('div');
        advancedContentWrapper.className = 'advanced-content-wrapper';
        advancedDetails.appendChild(advancedContentWrapper);
        const advancedFieldIds = [
            'ai-temperature', 'ai-max-tokens', 'ai-azure-apiversion',
            'ai-disable-correction', 'ai-disable-max-tokens',
            'ai-batch-concurrency', 'ai-request-interval',
            'ai-auto-scroll'
        ];
        advancedFieldIds.forEach(id => {
            const element = inputElements[id];
            if (element) {
                const group = element.closest('.form-group');
                if (group) {
                    advancedContentWrapper.appendChild(group);
                }
            }
        });
        const promptSectionTitle = document.createElement('h3');
        promptSectionTitle.textContent = '自定义 Prompt';
        promptSectionTitle.style.cssText = `
            margin-top: 35px;
            margin-bottom: 20px;
            font-size: 20px;
            font-weight: 600;
            color: #1f2937;
            border-top: 1px solid #e5e7eb;
            padding-top: 25px;
            text-align: center;
            position: relative;
        `;
        const titleIcon = document.createElement('span');
        titleIcon.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 8px;">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v2h-2v-2zm0-10h2v8h-2V7z"
                fill="#6366f1"/>
            </svg>
        `;
        promptSectionTitle.insertBefore(titleIcon, promptSectionTitle.firstChild);
        advancedContentWrapper.appendChild(promptSectionTitle);
        const promptDescription = document.createElement('p');
        promptDescription.style.cssText = `
            margin-bottom: 25px;
            color: #6b7280;
            font-size: 14px;
            line-height: 1.5;
            text-align: center;
            max-width: 80%;
            margin-left: auto;
            margin-right: auto;
        `;
        promptDescription.innerHTML = '自定义各题型的 AI 提示模板，使用占位符来插入题目内容。<span style="color:#6366f1;font-weight:500;">高质量的提示将带来更准确的 AI 回答</span>。';
        advancedContentWrapper.appendChild(promptDescription);
        const promptEditContainer = document.createElement('div');
        promptEditContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 25px;
            background: #f9fafb;
            padding: 20px;
            border-radius: 12px;
            border: 1px solid #e5e7eb;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        `;
        Object.keys(defaultPrompts).forEach(typeCode => {
            const questionTypeName = getQuestionType(parseInt(typeCode, 10));
            const promptGroup = document.createElement('div');
            promptGroup.className = 'form-group prompt-group';
            promptGroup.style.cssText = `
                padding: 15px;
                background: #ffffff;
                border-radius: 10px;
                border: 1px solid #e5e7eb;
                transition: all 0.3s ease;
                box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            `;
            promptGroup.addEventListener('mouseenter', () => {
                promptGroup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                promptGroup.style.borderColor = '#d1d5db';
                promptGroup.style.transform = 'translateY(-2px)';
            });
            promptGroup.addEventListener('mouseleave', () => {
                promptGroup.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                promptGroup.style.borderColor = '#e5e7eb';
                promptGroup.style.transform = 'translateY(0)';
            });
            const promptHeader = document.createElement('div');
            promptHeader.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            `;
            const promptLabel = document.createElement('label');
            promptLabel.htmlFor = `prompt-type-${typeCode}`;
            promptLabel.style.cssText = `
                font-weight: 600;
                color: #374151;
                font-size: 16px;
                display: flex;
                align-items: center;
            `;
            const typeIcon = document.createElement('span');
            typeIcon.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                margin-right: 10px;
                background: #eef2ff;
                border-radius: 8px;
                color: #6366f1;
                font-size: 16px;
                font-weight: bold;
            `;
            switch (parseInt(typeCode)) {
                case 1: typeIcon.innerHTML = '单'; break;
                case 2: typeIcon.innerHTML = '多'; break;
                case 5: typeIcon.innerHTML = '判'; break;
                case 4: typeIcon.innerHTML = '填'; break;
                case 6: typeIcon.innerHTML = '简'; break;
                case 10: typeIcon.innerHTML = '编'; break;
                case 12: typeIcon.innerHTML = '排'; break;
                case 13: typeIcon.innerHTML = '匹'; break;
                default: typeIcon.innerHTML = typeCode;
            }
            promptLabel.appendChild(typeIcon);
            promptLabel.appendChild(document.createTextNode(`${questionTypeName} Prompt`));
            const restoreButton = document.createElement('button');
            restoreButton.type = 'button';
            restoreButton.style.cssText = `
                padding: 6px 12px;
                font-size: 13px;
                background: linear-gradient(to bottom, #f8fafc, #eef2ff);
                color: #4f46e5;
                border: 1px solid #c7d2fe;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 1px 2px rgba(99, 102, 241, 0.1);
                display: flex;
                align-items: center;
                font-weight: 500;
            `;
            restoreButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                恢复默认
            `;
            restoreButton.onmouseover = () => {
                restoreButton.style.background = 'linear-gradient(to bottom, #eef2ff, #dbeafe)';
                restoreButton.style.transform = 'translateY(-2px)';
                restoreButton.style.boxShadow = '0 3px 6px rgba(99, 102, 241, 0.2)';
            };
            restoreButton.onmouseout = () => {
                restoreButton.style.background = 'linear-gradient(to bottom, #f8fafc, #eef2ff)';
                restoreButton.style.transform = 'translateY(0)';
                restoreButton.style.boxShadow = '0 1px 2px rgba(99, 102, 241, 0.1)';
            };
            restoreButton.onclick = (e) => {
                e.preventDefault();
                const textarea = inputElements[`prompt-type-${typeCode}`];
                if (textarea) {
                    restoreButton.style.transition = 'all 0.2s';
                    restoreButton.style.background = '#818cf8';
                    restoreButton.style.color = 'white';
                    restoreButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg> 已恢复`;
                    textarea.value = defaultPrompts[typeCode];
                    textarea.style.borderColor = '#818cf8';
                    textarea.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)';
                    setTimeout(() => {
                        restoreButton.style.transition = 'all 0.3s ease';
                        restoreButton.style.background = 'linear-gradient(to bottom, #f8fafc, #eef2ff)';
                        restoreButton.style.color = '#4f46e5';
                        restoreButton.innerHTML = `
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                                <polyline points="23 4 23 10 17 10"></polyline>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                            </svg>
                            恢复默认
                        `;
                        setTimeout(() => {
                            textarea.style.borderColor = '#d1d5db';
                            textarea.style.boxShadow = 'none';
                        }, 300);
                    }, 1000);
                    showNotification(`${questionTypeName} Prompt 已恢复默认`, {
                        type: 'success',
                        duration: 1500,
                        animation: 'scale'
                    });
                }
            };
            promptHeader.appendChild(promptLabel);
            promptHeader.appendChild(restoreButton);
            promptGroup.appendChild(promptHeader);
            const promptTextarea = document.createElement('textarea');
            promptTextarea.id = `prompt-type-${typeCode}`;
            promptTextarea.rows = 8;
            promptTextarea.style.cssText = `
                width: 100%;
                padding: 12px 15px;
                border: 1px solid #d1d5db;
                border-radius: 10px;
                font-size: 14px;
                line-height: 1.6;
                resize: vertical;
                background-color: #f9fafb;
                transition: all 0.25s ease;
                outline: none;
                box-sizing: border-box;
                min-height: 160px;
                color: #374151;
            `;
            promptTextarea.value = customPrompts[typeCode] || defaultPrompts[typeCode];
            promptTextarea.onfocus = () => {
                promptTextarea.style.borderColor = '#6366f1';
                promptTextarea.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)';
                promptTextarea.style.backgroundColor = '#ffffff';
            };
            promptTextarea.onblur = () => {
                promptTextarea.style.borderColor = '#d1d5db';
                promptTextarea.style.boxShadow = 'none';
                promptTextarea.style.backgroundColor = '#f9fafb';
            };
            const placeholderInfo = document.createElement('div');
            placeholderInfo.style.cssText = `
                margin-top: 10px;
                color: #6b7280;
                font-size: 13px;
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 6px;
            `;
            const infoIcon = document.createElement('span');
            infoIcon.innerHTML = `
                <svg t="1746146562321" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http:
                    <path d="M512 0C278.388364 0 162.909091 162.816 162.909091 363.659636 162.909091 564.503273 512 1024 512 1024S861.090909 564.503273 861.090909 363.659636C861.090909 162.816 745.611636 0 512 0zM512 488.727273c-102.818909 0-186.181818-83.362909-186.181818-186.181818 0-102.818909 83.362909-186.181818 186.181818-186.181818s186.181818 83.362909 186.181818 186.181818C698.181818 405.364364 614.818909 488.727273 512 488.727273z" p-id="2637" fill="#8a8a8a"></path>
                </svg>
            `;
            infoIcon.style.marginRight = '5px';
            placeholderInfo.appendChild(infoIcon);
            const placeholderText = document.createElement('span');
            placeholderText.textContent = '可用占位符: ';
            placeholderInfo.appendChild(placeholderText);
            promptPlaceholders[typeCode].forEach((placeholder, index) => {
                const placeholderChip = document.createElement('code');
                placeholderChip.textContent = placeholder;
                placeholderChip.style.cssText = `
                    background: #e0e7ff;
                    color: #4338ca;
                    padding: 3px 6px;
                    border-radius: 4px;
                    font-family: Microsoft YaHei;
                    font-size: 12px;
                    display: inline-block;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border: 1px solid #c7d2fe;
                `;
                placeholderChip.onclick = () => {
                    const start = promptTextarea.selectionStart;
                    const end = promptTextarea.selectionEnd;
                    const text = promptTextarea.value;
                    promptTextarea.value = text.substring(0, start) + placeholder + text.substring(end);
                    promptTextarea.focus();
                    promptTextarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
                    placeholderChip.style.backgroundColor = '#818cf8';
                    placeholderChip.style.color = 'white';
                    setTimeout(() => {
                        placeholderChip.style.backgroundColor = '#e0e7ff';
                        placeholderChip.style.color = '#4338ca';
                    }, 200);
                };
                placeholderChip.onmouseover = () => {
                    placeholderChip.style.backgroundColor = '#c7d2fe';
                    placeholderChip.style.transform = 'translateY(-1px)';
                    placeholderChip.style.boxShadow = '0 2px 4px rgba(99, 102, 241, 0.2)';
                };
                placeholderChip.onmouseout = () => {
                    placeholderChip.style.backgroundColor = '#e0e7ff';
                    placeholderChip.style.transform = 'translateY(0)';
                    placeholderChip.style.boxShadow = 'none';
                };
                placeholderInfo.appendChild(placeholderChip);
            });
            promptGroup.appendChild(promptTextarea);
            promptGroup.appendChild(placeholderInfo);
            promptEditContainer.appendChild(promptGroup);
            inputElements[`prompt-type-${typeCode}`] = promptTextarea;
        });
        advancedContentWrapper.appendChild(promptEditContainer);
        advancedContentWrapper.appendChild(promptEditContainer);
        form.appendChild(advancedDetails);
        form.appendChild(createWebDavManager(inputElements));
        const urlPreviewContainer = document.createElement('div');
        urlPreviewContainer.className = 'url-preview-container';
        urlPreviewContainer.innerHTML = `
            <strong>请求 URL 预览:</strong>
            <div class="url-display" style="margin-top: 5px; font-weight: bold;">-</div>
            <div class="status">-</div>
            <div class="correction-suggestion"></div>
        `;
        form.appendChild(urlPreviewContainer);
        const urlDisplayElement = urlPreviewContainer.querySelector('.url-display');
        const statusElement = urlPreviewContainer.querySelector('.status');
        const suggestionElement = urlPreviewContainer.querySelector('.correction-suggestion');
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 15px;
            margin-top: 20px;
            padding-top: 25px;
            border-top: 1px solid #e5e7eb;
        `;
        const saveButton = document.createElement('button');
        saveButton.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            保存设置
        `;
        saveButton.style.cssText = `
            padding: 12px 24px;
            background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 600;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
        `;
        saveButton.onmouseover = () => {
            saveButton.style.transform = 'translateY(-2px)';
            saveButton.style.boxShadow = '0 6px 15px rgba(79, 70, 229, 0.3)';
        };
        saveButton.onmouseout = () => {
            saveButton.style.transform = 'translateY(0)';
            saveButton.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.2)';
        };
        saveButton.onclick = () => {
            const selectedProvider = inputElements['ai-provider'].getValue();
            const selectedPresetId = (selectedProvider === 'openai') ? inputElements['openai-preset'].getValue() : 'custom';
            const isPresetSelected = selectedProvider === 'openai' && selectedPresetId !== 'custom';
            let endpointToSave = inputElements['ai-endpoint'].value.trim();
            if (selectedProvider === 'openai' && selectedPresetId !== 'custom') {
                const preset = OPENAI_COMPATIBLE_PRESETS.find(p => p.id === selectedPresetId);
                if (preset) {
                    endpointToSave = preset.endpoint;
                }
            }
            const newConfig = {
                provider: selectedProvider,
                openaiPreset: selectedPresetId,
                isPreset: isPresetSelected,
                endpoint: endpointToSave,
                apiKey: inputElements['ai-key'].value.trim(),
                model: inputElements['ai-model'].getValue(),
                geminiThinkingEnabled: inputElements['gemini-thinking-enabled'].checked,
                geminiThinkingBudgetMode: inputElements['gemini-thinking-budget-mode'].getValue(),
                geminiThinkingBudgetCustom: parseInt(inputElements['gemini-thinking-budget-custom'].value, 10) || 8192,
                temperature: parseFloat(inputElements['ai-temperature'].value),
                max_tokens: parseInt(inputElements['ai-max-tokens'].value, 10),
                azureApiVersion: inputElements['ai-azure-apiversion'].value.trim(),
                disableCorrection: inputElements['ai-disable-correction'].checked,
                disableMaxTokens: inputElements['ai-disable-max-tokens'].checked,
                autoScrollEnabled: inputElements['ai-auto-scroll'].checked,
                visionEnabled: inputElements['ai-vision-enabled'].checked,
                batchConcurrency: inputElements['ai-batch-concurrency'].value,
                requestInterval: parseInt(inputElements['ai-request-interval'].value, 10) || 200,
                xiaoyaAiMode: inputElements['xiaoya-ai-mode'].getValue(),
                visionProvider: inputElements['vision-provider'].getValue(),
                visionEndpoint: inputElements['vision-endpoint'].value.trim(),
                visionApiKey: inputElements['vision-api-key'].value.trim(),
                visionModel: inputElements['vision-model'].getValue(),
                audioProcessingMode: inputElements['audio-processing-mode'].getValue(),
                geminiAnalyzeVideoFramesEnabled: inputElements['gemini-analyze-video-frames-enabled'].checked,
                sttEnabled: inputElements['stt-enabled'].checked,
                sttVideoEnabled: inputElements['stt-video-enabled'].checked,
                sttProvider: inputElements['stt-provider'].getValue(),
                sttEndpoint: inputElements['stt-endpoint'].value.trim(),
                sttApiKey: inputElements['stt-api-key'].value.trim(),
                sttModel: inputElements['stt-model'].value.trim()
            };
            if (isNaN(newConfig.temperature)) newConfig.temperature = 0.7;
            if (isNaN(newConfig.max_tokens) || newConfig.max_tokens <= 0) newConfig.max_tokens = 8000;
            const newCustomPrompts = {};
            Object.keys(defaultPrompts).forEach(typeCode => {
                const textarea = inputElements[`prompt-type-${typeCode}`];
                if (textarea) {
                    if (textarea.value.trim() !== defaultPrompts[typeCode].trim()) {
                        newCustomPrompts[typeCode] = textarea.value;
                    }
                }
            });
            localStorage.setItem('aiCustomPrompts', JSON.stringify(newCustomPrompts));
            localStorage.setItem('aiConfig', JSON.stringify(newConfig));
            showNotification('AI 设置已保存！', { type: 'success', animation: 'scale' });
            closeModal();
        };
        const cancelButton = document.createElement('button');
        cancelButton.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            取消
        `;
        cancelButton.style.cssText = `
            padding: 12px 24px;
            background-color: #f3f4f6;
            color: #4b5563;
            border: 1px solid #d1d5db;
            border-radius: 10px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 500;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
        `;
        cancelButton.onmouseover = () => {
            cancelButton.style.backgroundColor = '#e5e7eb';
            cancelButton.style.transform = 'translateY(-1px)';
        };
        cancelButton.onmouseout = () => {
            cancelButton.style.backgroundColor = '#f3f4f6';
            cancelButton.style.transform = 'translateY(0)';
        };
        cancelButton.onclick = () => closeModal();
        const exportButton = document.createElement('button');
        exportButton.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            导出配置
        `;
        exportButton.style.cssText = `
            padding: 12px 20px; background-color: #f3f4f6; color: #374151; border: 1px solid #d1d5db;
            border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 500; transition: all 0.3s ease;
            display: inline-flex; align-items: center; margin-right: auto;
        `;
        exportButton.onmouseover = () => { exportButton.style.backgroundColor = '#e5e7eb'; };
        exportButton.onmouseout = () => { exportButton.style.backgroundColor = '#f3f4f6'; };
        exportButton.onclick = () => {
            try {
                const configToExport = {
                    version: "1.0",
                    aiConfig: JSON.parse(localStorage.getItem('aiConfig') || '{}'),
                    aiCustomPrompts: JSON.parse(localStorage.getItem('aiCustomPrompts') || '{}')
                };
                const configString = JSON.stringify(configToExport, null, 2);
                navigator.clipboard.writeText(configString).then(() => {
                    showNotification('AI配置已成功复制到剪贴板！', { type: 'success' });
                }).catch(err => {
                    console.error('无法复制到剪贴板:', err);
                    showNotification('复制失败，请检查浏览器权限。', { type: 'error' });
                });
            } catch (error) {
                console.error('导出配置时出错:', error);
                showNotification('导出失败，配置数据可能已损坏。', { type: 'error' });
            }
        };
        const importButton = document.createElement('button');
        importButton.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            导入配置
        `;
        importButton.style.cssText = exportButton.style.cssText;
        importButton.style.marginRight = '0';
        importButton.onmouseover = () => { importButton.style.backgroundColor = '#e5e7eb'; };
        importButton.onmouseout = () => { importButton.style.backgroundColor = '#f3f4f6'; };
        importButton.onclick = () => {
            showImportModal();
        };
        buttonContainer.appendChild(exportButton);
        buttonContainer.appendChild(importButton);
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(saveButton);
        modal.appendChild(closeButton);
        modal.appendChild(title);
        modal.appendChild(form);
        modal.appendChild(buttonContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            modal.style.opacity = '1';
            modal.style.transform = 'scale(1) translateY(0)';
        });
        async function fetchAvailableModels(provider, endpoint, apiKey, azureApiVersion) {
            const cacheKey = `${provider}-${endpoint}-${apiKey}-${azureApiVersion || ''}`;
            const cachedData = modelListCache[cacheKey];
            if (cachedData) {
                console.log(`从缓存加载 ${provider} 模型列表`);
                showNotification(`从缓存加载 ${provider} 模型列表`, { type: 'info', duration: 1000 });
                return Promise.resolve(cachedData.models);
            }
            console.log(`正在获取可用模型...`);
            showNotification(`正在获取可用模型...`, { type: 'info', duration: 2000 });
            try {
                switch (provider) {
                    case 'openai': {
                        let modelsEndpoint = endpoint.split('?')[0].replace(/\/$/, '');
                        if (modelsEndpoint.endsWith('/chat/completions')) {
                            modelsEndpoint = modelsEndpoint.replace('/chat/completions', '/models');
                        } else if (!modelsEndpoint.endsWith('/models')) {
                            if (modelsEndpoint.includes('/v1')) {
                                modelsEndpoint = modelsEndpoint.substring(0, modelsEndpoint.indexOf('/v1')) + '/v1/models';
                            } else {
                                modelsEndpoint += '/v1/models';
                            }
                        }
                        console.log("OpenAI 模型端点:", modelsEndpoint);
                        return new Promise((resolve, reject) => {
                            fetch(modelsEndpoint, {
                                method: 'GET',
                                headers: { 'Authorization': `Bearer ${apiKey}` },
                                signal: AbortSignal.timeout(15000)
                            })
                                .then(response => {
                                    if (response.ok) {
                                        return response.json();
                                    } else {
                                        const errorMsg = `获取 OpenAI 模型列表失败 (${response.status})`;
                                        showNotification(errorMsg, { type: 'error' });
                                        throw new Error(errorMsg);
                                    }
                                })
                                .then(data => {
                                    const models = (data.data || data)
                                        .map(m => m.id)
                                        .sort();
                                    console.log("找到 OpenAI 可用模型:", models);
                                    modelListCache[cacheKey] = { models: models, timestamp: Date.now() };
                                    resolve(models);
                                })
                                .catch(error => {
                                    if (error.name === 'AbortError') {
                                        showNotification('获取 OpenAI 模型列表超时', { type: 'error' });
                                        reject(new Error('获取 OpenAI 模型列表超时'));
                                    } else {
                                        showNotification('获取 OpenAI 模型列表失败: ' + error.message, { type: 'error' });
                                        reject(error);
                                    }
                                });
                        });
                    }
                    case 'gemini': {
                        let modelsEndpoint = endpoint.replace(/\/v\d+(beta)?\/models\/.*$/, '').replace(/\/models\/.*$/, '').replace(/\/$/, '');
                        modelsEndpoint += `/v1beta/models?key=${apiKey}`;
                        console.log("Gemini 模型端点:", modelsEndpoint);
                        return new Promise((resolve, reject) => {
                            fetch(modelsEndpoint, {
                                method: 'GET',
                                headers: { 'Content-Type': 'application/json' },
                                signal: AbortSignal.timeout(15000)
                            })
                                .then(response => {
                                    if (response.ok) {
                                        return response.json();
                                    } else {
                                        const errorMsg = `获取 Gemini 模型列表失败 (${response.status})`;
                                        showNotification(errorMsg, { type: 'error' });
                                        throw new Error(errorMsg);
                                    }
                                })
                                .then(data => {
                                    const models = (data.models || [])
                                        .map(m => m.name.replace('models/', ''))
                                        .sort();
                                    console.log("找到 Gemini 可用模型:", models);
                                    modelListCache[cacheKey] = { models: models, timestamp: Date.now() };
                                    resolve(models);
                                })
                                .catch(error => {
                                    if (error.name === 'AbortError') {
                                        showNotification('获取 Gemini 模型列表超时', { type: 'error' });
                                        reject(new Error('获取 Gemini 模型列表超时'));
                                    } else {
                                        showNotification('获取 Gemini 模型列表失败: ' + error.message, { type: 'error' });
                                        reject(error);
                                    }
                                });
                        });
                    }
                    case 'anthropic': {
                        let modelsEndpoint = endpoint.split('?')[0].replace(/\/$/, '');
                        if (modelsEndpoint.endsWith('/v1/messages')) {
                            modelsEndpoint = modelsEndpoint.replace('/v1/messages', '/v1/models');
                        } else if (!modelsEndpoint.endsWith('/v1/models')) {
                            if (modelsEndpoint.includes('/v1')) {
                                modelsEndpoint = modelsEndpoint.substring(0, modelsEndpoint.indexOf('/v1')) + '/v1/models';
                            } else {
                                modelsEndpoint += '/v1/models';
                            }
                        }
                        console.log("Anthropic 模型端点:", modelsEndpoint);
                        return new Promise((resolve, reject) => {
                            fetch(modelsEndpoint, {
                                method: 'GET',
                                headers: {
                                    'x-api-key': apiKey,
                                    'Content-Type': 'application/json'
                                },
                                signal: AbortSignal.timeout(15000)
                            })
                                .then(response => {
                                    if (response.ok) {
                                        return response.json();
                                    } else {
                                        const errorMsg = `获取 Anthropic 模型列表失败 (${response.status})`;
                                        showNotification(errorMsg, { type: 'error' });
                                        throw new Error(errorMsg);
                                    }
                                })
                                .then(data => {
                                    const models = (data.data || [])
                                        .map(m => m.id)
                                        .sort();
                                    console.log("找到 Anthropic 可用模型:", models);
                                    modelListCache[cacheKey] = { models: models, timestamp: Date.now() };
                                    resolve(models);
                                })
                                .catch(error => {
                                    if (error.name === 'AbortError') {
                                        showNotification('获取 Anthropic 模型列表超时', { type: 'error' });
                                        reject(new Error('获取 Anthropic 模型列表超时'));
                                    } else {
                                        showNotification('获取 Anthropic 模型列表失败: ' + error.message, { type: 'error' });
                                        reject(error);
                                    }
                                });
                        });
                    }
                    case 'azure':
                    default:
                        showNotification(`${provider} 提供商暂不支持自动获取模型列表。`, { type: 'warning' });
                        return Promise.resolve([]);
                }
            } catch (error) {
                console.error(`获取 ${provider} 模型列表时出错:`, error);
                showNotification(`获取 ${provider} 模型列表失败: ${error.message}`, { type: 'error' });
                return Promise.resolve([]);
            }
        }
        function getModelMetadata(modelId, modelsDevData) {
            let logo = null;
            let capabilities = [];
            let providerId = null;
            const lowerM = modelId.toLowerCase();
            if (lowerM.includes('claude')) providerId = 'anthropic';
            else if (lowerM.includes('gemini')) providerId = 'google';
            else if (lowerM.includes('gpt') || lowerM.includes('o1') || lowerM.includes('o3')) providerId = 'openai';
            else if (lowerM.includes('mistral')) providerId = 'mistral';
            else if (lowerM.includes('deepseek')) providerId = 'deepseek';
            else if (lowerM.includes('qwen')) providerId = 'alibaba';
            else if (lowerM.includes('yi')) providerId = '01-ai';
            else if (lowerM.includes('glm')) providerId = 'zhipu';
            else if (lowerM.includes('llama')) providerId = 'meta';
            else if (lowerM.includes('hunyuan')) providerId = 'tencent';
            else if (lowerM.includes('minimax')) providerId = 'minimax';
            else if (lowerM.includes('baichuan')) providerId = 'baichuan';
            else if (lowerM.includes('moonshot') || lowerM.includes('kimi')) providerId = 'moonshot';
            let hasVision = false;
            let hasTool = false;
            let hasReasoning = false;
            let hasText = true;
            let hasMedia = false;
            let visionVotes = 0;
            let toolVotes = 0;
            let reasoningVotes = 0;
            let textVotes = 0;
            let mediaVotes = 0;
            let totalMatches = 0;
            if (modelsDevData) {
                for (const providerKey in modelsDevData) {
                    const providerData = modelsDevData[providerKey];
                    if (providerData && providerData.models) {
                        let matchedModelInfo = null;
                        if (providerData.models[modelId]) {
                            matchedModelInfo = providerData.models[modelId];
                        }
                        else {
                            for (const dbModelId in providerData.models) {
                                const lowerDbId = dbModelId.toLowerCase();
                                const userLeaf = lowerM.split('/').pop().split(':').pop();
                                const dbLeaf = lowerDbId.split('/').pop().split(':').pop();
                                const isExactMatch = lowerM === lowerDbId;
                                const isSuffixMatch = lowerM.endsWith('/' + lowerDbId) || lowerM.endsWith(':' + lowerDbId);
                                const isLeafStartMatch = dbLeaf.length >= 2 && userLeaf.startsWith(dbLeaf);
                                if (isExactMatch || isSuffixMatch || isLeafStartMatch) {
                                    matchedModelInfo = providerData.models[dbModelId];
                                    break;
                                }
                            }
                        }
                        if (matchedModelInfo) {
                            totalMatches++;
                            if (!providerId) {
                                providerId = providerKey;
                            }
                            if (matchedModelInfo.modalities?.input?.includes('image')) visionVotes++;
                            if (matchedModelInfo.modalities?.input?.includes('text')) textVotes++;
                            if (matchedModelInfo.modalities?.input?.includes('audio') || matchedModelInfo.modalities?.input?.includes('video')) mediaVotes++;
                            if (matchedModelInfo.tool_call) toolVotes++;
                            if (matchedModelInfo.reasoning) reasoningVotes++;
                        }
                    }
                }
            }
            if (totalMatches > 0) {
                const threshold = totalMatches / 2;
                hasVision = visionVotes >= threshold;
                hasMedia = mediaVotes >= threshold;
                hasTool = toolVotes >= threshold;
                hasReasoning = reasoningVotes >= threshold;
            }
            if (!hasVision && (lowerM.includes('vision') || lowerM.includes('vl') || lowerM.includes('ocr') || /\d+(\.\d+)?v\b/.test(lowerM))) {
                hasVision = true;
            }
            if (!hasReasoning && (lowerM.includes('thinking') || lowerM.includes('reasoner') || lowerM.includes('deepseek-r1') || lowerM.includes('o1'))) {
                hasReasoning = true;
            }
            if (providerId) {
                logo = `https://models.dev/logos/${providerId}.svg`;
            } else {
                logo = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5Q0EzQUYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHJ4PSIyIiByeT0iMiI+PC9yZWN0PjxyZWN0IHg9IjkiIHk9IjkiIHdpZHRoPSI2IiBoZWlnaHQ9IjYiPjwvcmVjdD48bGluZSB4MT0iOSIgeTE9IjEiIHgyPSI5IiB5Mj0iNCI+PC9saW5lPjxsaW5lIHgxPSIxNSIgeTE9IjEiIHgyPSIxNSIgeTI9IjQiPjwvbGluZT48bGluZSB4MT0iOSIgeTE9IjIwIiB4Mj0iOSIgeTI9IjIzIj48L2xpbmU+PGxpbmUgeDE9IjE1IiB5MT0iMjAiIHgyPSIxNSIgeTI9IjIzIj48L2xpbmU+PGxpbmUgeDE9IjIwIiB5MT0iOSIgeDI9IjIzIiB5Mj0iOSI+PC9saW5lPjxsaW5lIHgxPSIyMCIgeTE9IjE0IiB4Mj0iMjMiIHkyPSIxNCI+PC9saW5lPjxsaW5lIHgxPSIxIiB5MT0iOSIgeDI9IjQiIHkyPSI5Ij48L2xpbmU+PGxpbmUgeDE9IjEiIHkxPSIxNCIgeDI9IjQiIHkyPSIxNCI+PC9saW5lPjwvc3ZnPg==';
            }
            if (hasText) capabilities.push({ type: 'text', label: '文本' });
            if (hasVision) capabilities.push({ type: 'vision', label: '视觉' });
            if (hasMedia) capabilities.push({ type: 'media', label: '媒体' });
            if (hasTool) capabilities.push({ type: 'tool', label: '工具' });
            if (hasReasoning) capabilities.push({ type: 'reasoning', label: '推理' });
            return { logo, capabilities };
        }
        async function fetchModelsAndPopulateDropdown(modelInputId, selectWrapper) {
            const isVision = modelInputId.startsWith('vision-');
            const provider = isVision
                ? inputElements['vision-provider'].getValue()
                : inputElements['ai-provider'].getValue();
            const endpoint = isVision
                ? inputElements['vision-endpoint'].value.trim()
                : inputElements['ai-endpoint'].value.trim();
            const apiKey = isVision
                ? inputElements['vision-api-key'].value.trim()
                : inputElements['ai-key'].value.trim();
            const azureApiVersion = !isVision ? inputElements['ai-azure-apiversion']?.value.trim() : null;
            const fetchButton = selectWrapper.querySelector('.custom-select-fetch-btn');
            if (provider === 'default' || provider === 'main_model') {
                showNotification('此选项无需单独获取模型列表。', { type: 'info' });
                return;
            }
            if (!endpoint || !apiKey) {
                showNotification(`请先为 ${isVision ? 'Vision' : '主 AI'} 提供商填写 API 地址和 Key。`, { type: 'warning' });
                return;
            }
            fetchButton.disabled = true;
            const originalButtonText = fetchButton.innerHTML;
            fetchButton.innerHTML = `⏳ 获取中...`;
            try {
                const [models, modelsDevData] = await Promise.all([
                    fetchAvailableModels(provider, endpoint, apiKey, azureApiVersion),
                    fetchModelsDevApi()
                ]);
                if (models && models.length > 0) {
                    const newOptions = models.map(m => {
                        const { logo, capabilities } = getModelMetadata(m, modelsDevData);
                        return {
                            value: m,
                            text: m,
                            logo: logo,
                            capabilities: capabilities
                        };
                    });
                    selectWrapper.setOptions(newOptions, selectWrapper.getValue());
                    showNotification(`成功为 ${provider} 获取 ${models.length} 个模型。`, { type: 'success' });
                } else if (models) {
                    showNotification(`未能为 ${provider} 获取到模型列表。`, { type: 'warning' });
                }
            } catch (error) {
                console.error("获取模型列表并填充下拉框时出错：", error);
            } finally {
                fetchButton.disabled = false;
                fetchButton.innerHTML = originalButtonText;
            }
        }
        const updateSttFieldsForProvider = () => {
            const sttProvider = inputElements['stt-provider'].value;
            const endpointInput = inputElements['stt-endpoint'];
            const modelInput = inputElements['stt-model'];
            const apiKeyInput = inputElements['stt-api-key'];
            if (sttProvider === 'gemini') {
                if (!endpointInput.value) {
                    endpointInput.value = 'https://generativelanguage.googleapis.com/v1beta/models/';
                }
                endpointInput.placeholder = 'Gemini API 地址';
                if (!modelInput.value) {
                    modelInput.value = 'gemini-2.5-flash';
                }
                apiKeyInput.placeholder = "请输入你的 Gemini API Key";
            } else if (sttProvider === 'openai_compatible') {
                if (!endpointInput.value) {
                    endpointInput.value = 'https://api.openai.com/v1/audio/transcriptions';
                }
                endpointInput.placeholder = '例如: https://api.openai.com/v1/audio/transcriptions';
                if (!modelInput.value) {
                    modelInput.value = 'whisper-1';
                }
                apiKeyInput.placeholder = "可选，可与 LLM Key 不同";
            }
        };
        const updateFieldVisibility = () => {
            const selectedProvider = inputElements['ai-provider'].getValue();
            const audioProcessingModeValue = inputElements['audio-processing-mode'].getValue();
            const isGeminiNativeMedia = selectedProvider === 'gemini' && audioProcessingModeValue === 'main_model';
            const geminiThinkingEnabled = inputElements['gemini-thinking-enabled'].checked;
            const geminiThinkingBudgetMode = inputElements['gemini-thinking-budget-mode'].getValue();
            const geminiBudgetIsCustom = geminiThinkingEnabled && geminiThinkingBudgetMode === 'custom';
            const visionEnabled = inputElements['ai-vision-enabled'].checked;
            const selectedVisionProvider = inputElements['vision-provider'].getValue();
            const independentSttModeSelected = audioProcessingModeValue === 'independent_stt';
            const sttEnabled = independentSttModeSelected && inputElements['stt-enabled'].checked;
            const visionHelpBox = form.querySelector('#vision-help');
            if (visionHelpBox) {
                visionHelpBox.style.display = visionEnabled ? 'block' : 'none';
            }
            const sttHelpBox = form.querySelector('#stt-help');
            if (sttHelpBox) {
                sttHelpBox.style.display = independentSttModeSelected ? 'block' : 'none';
            }
            fields.forEach(field => {
                const group = inputElements[field.id]?.closest('.form-group');
                if (!group) return;
                let shouldBeVisible = true;
                const dependenciesStr = group.dataset.dependsOn;
                if (dependenciesStr) {
                    try {
                        const dependencies = JSON.parse(dependenciesStr);
                        if (dependencies.includes('gemini_native_media')) {
                            shouldBeVisible = isGeminiNativeMedia;
                        } else if (field.isVisionField) {
                            shouldBeVisible = visionEnabled && selectedVisionProvider !== 'main_model' && dependencies.includes(selectedVisionProvider);
                        } else if (dependencies.includes('independent_stt')) {
                            shouldBeVisible = independentSttModeSelected;
                        } else if (dependencies.includes('stt_is_enabled')) {
                            shouldBeVisible = sttEnabled;
                        } else if (dependencies.includes('gemini_thinking_is_enabled')) {
                            shouldBeVisible = selectedProvider === 'gemini' && geminiThinkingEnabled;
                        } else if (dependencies.includes('gemini_thinking_budget_is_custom')) {
                            shouldBeVisible = selectedProvider === 'gemini' && geminiBudgetIsCustom;
                        } else {
                            shouldBeVisible = dependencies.includes(selectedProvider);
                        }
                    } catch (e) {
                        console.error("解析字段依赖项时出错:", field.id, dependenciesStr);
                        shouldBeVisible = false;
                    }
                }
                if (field.id === 'vision-provider') {
                    shouldBeVisible = visionEnabled;
                }
                if (shouldBeVisible) {
                    group.classList.remove('hidden');
                    group.style.maxHeight = '500px';
                    group.style.opacity = '1';
                    group.style.marginBottom = '24px';
                    group.style.display = 'flex';
                } else {
                    group.classList.add('hidden');
                    group.style.maxHeight = '0';
                    group.style.opacity = '0';
                    group.style.marginBottom = '0';
                    setTimeout(() => {
                        if (group.classList.contains('hidden')) {
                            group.style.display = 'none';
                        }
                    }, 300);
                }
            });
            const advancedWrapper = advancedDetails.querySelector('.advanced-content-wrapper');
            const hasVisibleAdvancedChild = Array.from(advancedWrapper.querySelectorAll('.form-group')).some(group => !group.classList.contains('hidden'));
            advancedDetails.style.display = hasVisibleAdvancedChild ? 'block' : 'none';
        };
        const closeModal = () => {
            modal.style.transform = 'scale(0.95) translateY(15px)';
            modal.style.opacity = '0';
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
            }, 400);
        };
        const updateUrlPreview = () => {
            const provider = inputElements['ai-provider']?.getValue();
            if (!provider) return;
            const endpoint = inputElements['ai-endpoint']?.value.trim() || '';
            const apiKey = inputElements['ai-key']?.value.trim() || '';
            const modelId = inputElements['ai-model']?.getValue() || '';
            const azureApiVersion = inputElements['ai-azure-apiversion']?.value.trim() || '2024-05-01-preview';
            const manualDisable = inputElements['ai-disable-correction']?.checked || false;
            const isPresetSelected = provider === 'openai' && inputElements['openai-preset']?.getValue() !== 'custom';
            const disableCorrection = manualDisable || isPresetSelected;
            let finalUrl = '-';
            let status = '-';
            let statusClass = '';
            let suggestion = '';
            if (provider === 'default') {
                finalUrl = '使用小雅内置 AI，无需配置 URL。';
                status = '默认配置';
                statusClass = 'valid';
                suggestion = '注意: 小雅内置 AI 必须在课程页面内使用。';
            } else if (endpoint) {
                if (disableCorrection) {
                    let baseEndpoint = endpoint.split('?')[0].replace(/\/$/, '');
                    const urlParams = new URLSearchParams(endpoint.split('?')[1] || '');
                    if (provider === 'azure' && !urlParams.has('api-version')) {
                        urlParams.set('api-version', azureApiVersion);
                    }
                    finalUrl = `${baseEndpoint}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
                    if (isPresetSelected) {
                        status = '使用预设地址';
                        statusClass = 'valid';
                        suggestion = '已自动填充预设的API地址。';
                    } else {
                        status = '已禁用自动修正';
                        statusClass = 'warning';
                        suggestion = '将强制使用你输入的地址。请确保格式正确。';
                    }
                } else {
                    try {
                        let cleanEndpoint = endpoint.split('?')[0].replace(/\/$/, '');
                        const originalUrlParams = new URLSearchParams(endpoint.split('?')[1] || '');
                        switch (provider) {
                            case 'openai': {
                                let corrected = false;
                                if (!cleanEndpoint.endsWith('/v1/chat/completions')) {
                                    if (cleanEndpoint.includes('/v1')) {
                                        cleanEndpoint = cleanEndpoint.substring(0, cleanEndpoint.indexOf('/v1')) + '/v1/chat/completions';
                                    } else {
                                        cleanEndpoint += '/v1/chat/completions';
                                    }
                                    corrected = true;
                                }
                                finalUrl = cleanEndpoint;
                                status = corrected ? '格式已自动修正' : '格式有效';
                                statusClass = corrected ? 'warning' : 'valid';
                                if (corrected) suggestion = `建议使用标准路径: <code>${finalUrl}</code>`;
                                break;
                            }
                            case 'gemini': {
                                let cleanBaseEndpoint = endpoint.replace(/\/v\d+(beta)?\/models\/.*$/, '').replace(/\/models\/.*$/, '').replace(/\/$/, '');
                                const modelToUse = modelId || "gemini-2.5-flash-latest";
                                const apiVersion = "v1beta";
                                originalUrlParams.set('key', apiKey ? '***' : '[需要API Key]');
                                finalUrl = `${cleanBaseEndpoint}/${apiVersion}/models/${modelToUse}:generateContent?${originalUrlParams.toString()}`;
                                if (!apiKey) {
                                    status = '缺少 API Key';
                                    statusClass = 'invalid';
                                    suggestion = 'Gemini 请求需要在 URL 中包含 API Key。';
                                } else {
                                    status = '格式有效 (请确认基础地址)';
                                    statusClass = 'valid';
                                    suggestion = `预览显示的是预期请求格式 (Key已隐藏)。请确保基础地址正确。`;
                                }
                                break;
                            }
                            case 'anthropic': {
                                let corrected = false;
                                if (!cleanEndpoint.endsWith('/v1/messages')) {
                                    if (cleanEndpoint.includes('/v1')) {
                                        cleanEndpoint = cleanEndpoint.substring(0, cleanEndpoint.indexOf('/v1')) + '/v1/messages';
                                    } else {
                                        cleanEndpoint += '/v1/messages';
                                    }
                                    corrected = true;
                                }
                                finalUrl = cleanEndpoint;
                                status = corrected ? '格式已自动修正' : '格式有效';
                                statusClass = corrected ? 'warning' : 'valid';
                                if (corrected) suggestion = `建议使用标准路径: <code>${finalUrl}</code>`;
                                break;
                            }
                            case 'azure': {
                                if (!originalUrlParams.has('api-version')) {
                                    originalUrlParams.set('api-version', azureApiVersion);
                                }
                                const isOpenAIStyleHost = cleanEndpoint.includes('.openai.azure.com');
                                const isAIServicesStyleHost = cleanEndpoint.includes('.services.ai.azure.com') || cleanEndpoint.includes('.inference.ai.azure.com');
                                if (isOpenAIStyleHost) {
                                    const expectedPathSegment = '/openai/deployments/';
                                    const expectedSuffix = '/chat/completions';
                                    if (!cleanEndpoint.includes(expectedPathSegment)) {
                                        status = 'URL 格式不规范 (OpenAI-Style)';
                                        statusClass = 'invalid';
                                        suggestion = `对于 <code>*.openai.azure.com</code> 主机，路径应包含部署名: <code>...${expectedPathSegment}<部署名>${expectedSuffix}</code>。`;
                                    } else if (!cleanEndpoint.endsWith(expectedSuffix)) {
                                        if (/\/openai\/deployments\/[^/]+$/.test(cleanEndpoint)) {
                                            cleanEndpoint += expectedSuffix;
                                            status = '路径已自动补全 (OpenAI-Style)';
                                            statusClass = 'warning';
                                            suggestion = `已自动添加 <code>${expectedSuffix}</code>。部署名应在路径中。`;
                                        } else {
                                            status = 'URL 路径不完整 (OpenAI-Style)';
                                            statusClass = 'invalid';
                                            suggestion = `路径应以 <code>${expectedSuffix}</code> 结尾，并包含部署名。`;
                                        }
                                    } else {
                                        status = '格式有效 (OpenAI-Style Azure)';
                                        statusClass = 'valid';
                                        suggestion = 'URL 格式符合 OpenAI on Azure 部署要求。模型 ID (部署名) 已在路径中。';
                                    }
                                } else if (isAIServicesStyleHost) {
                                    const expectedPath = '/models/chat/completions';
                                    const partialPath = '/models/chat';
                                    if (cleanEndpoint.endsWith(expectedPath)) {
                                        status = '格式有效 (AI Services-Style Azure)';
                                        statusClass = 'valid';
                                        suggestion = 'URL 格式符合 Azure AI Services 模型部署。模型 ID 在请求体中指定。';
                                    } else if (cleanEndpoint.endsWith(partialPath)) {
                                        cleanEndpoint += '/completions';
                                        status = '路径已自动补全 (AI Services-Style)';
                                        statusClass = 'warning';
                                        suggestion = `已自动补全为 <code>${expectedPath}</code>。`;
                                    } else if (!cleanEndpoint.includes('/models/')) {
                                        cleanEndpoint += expectedPath;
                                        status = '路径已自动添加 (AI Services-Style)';
                                        statusClass = 'warning';
                                        suggestion = `已自动添加标准路径 <code>${expectedPath}</code>。`;
                                    }
                                    else {
                                        status = 'URL 格式不规范 (AI Services-Style)';
                                        statusClass = 'invalid';
                                        suggestion = `对于 <code>*.services.ai.azure.com</code> 或 <code>*.inference.ai.azure.com</code> 主机, 路径通常是 <code>${expectedPath}</code>。`;
                                    }
                                } else {
                                    status = 'Azure URL 主机格式未知';
                                    statusClass = 'invalid';
                                    suggestion = `请确保 Endpoint 指向 <code>*.openai.azure.com</code>, <code>*.services.ai.azure.com</code>, 或 <code>*.inference.ai.azure.com</code>。`;
                                }
                                finalUrl = `${cleanEndpoint}?${originalUrlParams.toString()}`;
                                break;
                            }
                            default:
                                finalUrl = endpoint;
                                status = '未知提供商';
                                statusClass = 'warning';
                        }
                    } catch (e) {
                        finalUrl = endpoint;
                        status = 'URL 解析失败';
                        statusClass = 'invalid';
                        suggestion = `无法解析输入的 Endpoint: ${e.message}`;
                    }
                }
            } else if (provider !== 'default') {
                status = '请输入 API 地址';
                statusClass = 'invalid';
            }
            urlDisplayElement.textContent = finalUrl;
            statusElement.textContent = status;
            statusElement.className = `status ${statusClass}`;
            suggestionElement.innerHTML = suggestion;
        };
        inputElements['ai-provider'].addEventListener('change', () => {
            updateFieldVisibility();
            updateUrlPreview();
        });
        inputElements['ai-endpoint'].addEventListener('input', updateUrlPreview);
        inputElements['ai-key'].addEventListener('input', updateUrlPreview);
        inputElements['ai-model'].addEventListener('input', updateUrlPreview);
        inputElements['ai-azure-apiversion'].addEventListener('input', updateUrlPreview);
        inputElements['ai-disable-correction'].addEventListener('change', updateUrlPreview);
        inputElements['vision-provider'].addEventListener('change', updateFieldVisibility);
        inputElements['ai-vision-enabled'].addEventListener('change', updateFieldVisibility);
        inputElements['gemini-thinking-enabled'].addEventListener('change', updateFieldVisibility);
        inputElements['gemini-thinking-budget-mode'].addEventListener('change', updateFieldVisibility);
        inputElements['audio-processing-mode'].addEventListener('change', updateFieldVisibility);
        inputElements['stt-enabled'].addEventListener('change', updateFieldVisibility);
        inputElements['stt-provider'].addEventListener('change', updateSttFieldsForProvider);
        updateFieldVisibility();
        updateUrlPreview();
        updateSttFieldsForProvider();
        const initialProvider = inputElements['ai-provider'].getValue();
        const audioModeSelect = inputElements['audio-processing-mode'];
        if (audioModeSelect) {
            let initialAudioOptions, initialAudioDefault;
            const savedAudioMode = aiConfig.audioProcessingMode || 'main_model';
            if (initialProvider === 'gemini') {
                initialAudioOptions = [
                    { value: 'main_model', text: '原生媒体理解 (直接分析文件)', domain: null },
                    { value: 'independent_stt', text: '独立STT转录 (兼容模式)', domain: null }
                ];
                initialAudioDefault = savedAudioMode;
            } else {
                initialAudioOptions = [
                    { value: 'independent_stt', text: '独立STT转录 (兼容模式)', domain: null }
                ];
                initialAudioDefault = 'independent_stt';
            }
            audioModeSelect.setOptions(initialAudioOptions, initialAudioDefault);
            setTimeout(updateFieldVisibility, 50);
        }
    }
    function showImportModal() {
        const importOverlay = document.createElement('div');
        importOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.5); z-index: 10002; display: flex;
            align-items: center; justify-content: center; backdrop-filter: blur(4px);
        `;
        const importModal = document.createElement('div');
        importModal.style.cssText = `
            background: #fff; padding: 25px 30px; border-radius: 16px;
            width: 500px; max-width: 90%; box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        `;
        const title = document.createElement('h3');
        title.textContent = '导入 AI 配置';
        title.style.cssText = 'margin-top: 0; margin-bottom: 15px; text-align: center; color: #1f2937;';
        const description = document.createElement('p');
        description.textContent = '请在下方文本框中粘贴之前导出的配置字符串。';
        description.style.cssText = 'font-size: 14px; color: #6b7280; text-align: center; margin-bottom: 20px;';
        const textarea = document.createElement('textarea');
        textarea.rows = 10;
        textarea.placeholder = '请在此处粘贴配置字符串...';
        textarea.style.cssText = `
            width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #d1d5db;
            border-radius: 8px; font-size: 13px; resize: vertical; margin-bottom: 20px;
            font-family: microsoft yahei;
        `;
        const buttons = document.createElement('div');
        buttons.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px;';
        const importConfirmBtn = document.createElement('button');
        importConfirmBtn.textContent = '导入';
        importConfirmBtn.style.cssText = `
            padding: 10px 20px; background-color: #4f46e5; color: white;
            border: none; border-radius: 8px; cursor: pointer; font-weight: 500;
        `;
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
            padding: 10px 20px; background-color: #f3f4f6; color: #374151;
            border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer;
        `;
        buttons.appendChild(cancelBtn);
        buttons.appendChild(importConfirmBtn);
        importModal.appendChild(title);
        importModal.appendChild(description);
        importModal.appendChild(textarea);
        importModal.appendChild(buttons);
        importOverlay.appendChild(importModal);
        document.body.appendChild(importOverlay);
        const closeImportModal = () => document.body.removeChild(importOverlay);
        cancelBtn.onclick = closeImportModal;
        importOverlay.onclick = (e) => {
            if (e.target === importOverlay) closeImportModal();
        };
        importConfirmBtn.onclick = () => {
            const configString = textarea.value.trim();
            if (!configString) {
                showNotification('配置字符串不能为空！', { type: 'warning' });
                return;
            }
            try {
                const data = JSON.parse(configString);
                if (data && data.aiConfig && data.aiCustomPrompts) {
                    localStorage.setItem('aiConfig', JSON.stringify(data.aiConfig));
                    localStorage.setItem('aiCustomPrompts', JSON.stringify(data.aiCustomPrompts));
                    showNotification('AI配置导入成功！正在刷新设置面板...', { type: 'success' });
                    closeImportModal();
                    const mainOverlay = document.querySelector('div[style*="z-index: 10001"]');
                    if (mainOverlay) {
                        mainOverlay.remove();
                    }
                    setTimeout(() => {
                        showAISettingsPanel();
                    }, 150);
                } else {
                    throw new Error('配置格式不正确，缺少 aiConfig 或 aiCustomPrompts 键。');
                }
            } catch (error) {
                console.error('导入配置失败:', error);
                showNotification(`导入失败: ${error.message}`, { type: 'error' });
            }
        };
    }
    const WavEncoderWorker = `
        self.onmessage = function(e) {
            const { channels, sampleRate, length } = e.data;
            const numOfChan = channels.length;
            const bufferLength = length * numOfChan * 2 + 44;
            const buffer = new ArrayBuffer(bufferLength);
            const view = new DataView(buffer);
            let pos = 0;
            function setUint16(data) {
                view.setUint16(pos, data, true);
                pos += 2;
            }
            function setUint32(data) {
                view.setUint32(pos, data, true);
                pos += 4;
            }
            setUint32(0x46464952);
            setUint32(bufferLength - 8);
            setUint32(0x45564157);
            setUint32(0x20746d66);
            setUint32(16);
            setUint16(1);
            setUint16(numOfChan);
            setUint32(sampleRate);
            setUint32(sampleRate * 2 * numOfChan);
            setUint16(numOfChan * 2);
            setUint16(16);
            setUint32(0x61746164);
            setUint32(bufferLength - pos - 4);
            let offset = 0;
            while (pos < bufferLength) {
                for (let i = 0; i < numOfChan; i++) {
                    let sample = Math.max(-1, Math.min(1, channels[i][offset]));
                    sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
                    view.setInt16(pos, sample, true);
                    pos += 2;
                }
                offset++;
            }
            self.postMessage(new Blob([view], { type: 'audio/wav' }));
        };
    `;
    function parseAIResponseWithConfidence(responseText) {
        let text = responseText.trim();
        let confidence = null;
        let answer = text;
        const searchPattern = /"confidence"\s*:\s*([1-5])/g;
        let lastMatch = null;
        let m;
        while ((m = searchPattern.exec(text)) !== null) {
            lastMatch = m;
        }
        if (lastMatch) {
            const score = parseInt(lastMatch[1], 10);
            const keyStartIndex = lastMatch.index;
            const openBraceIndex = text.lastIndexOf('{', keyStartIndex);
            const numEndIndex = keyStartIndex + lastMatch[0].length;
            const closeBraceIndex = text.indexOf('}', numEndIndex);
            if (openBraceIndex !== -1 && closeBraceIndex !== -1) {
                const afterBlock = text.substring(closeBraceIndex + 1).trim();
                const isAtEnd = afterBlock === '' || /^```\s*$/.test(afterBlock);
                if (isAtEnd) {
                    confidence = score;
                    let cutIndex = openBraceIndex;
                    const prefix = text.substring(0, cutIndex).trimEnd();
                    if (/```(?:json)?$/i.test(prefix)) {
                        const lastBacktick = prefix.lastIndexOf('```');
                        if (lastBacktick !== -1) {
                            cutIndex = lastBacktick;
                        }
                    }
                    answer = text.substring(0, cutIndex).trim();
                    return { answer, confidence };
                }
            }
        }
        const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```\s*$/i;
        const match = text.match(codeBlockRegex);
        if (match) {
            try {
                const parsed = JSON.parse(match[1]);
                if (parsed && typeof parsed.confidence === 'number') {
                    return {
                        answer: text.replace(match[0], '').trim(),
                        confidence: parsed.confidence
                    };
                }
            } catch (e) { }
        }
        return { answer, confidence };
    }
    function createConfidenceStars(score) {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;';
        if (score === null || score === undefined) {
            container.innerHTML = '<span style="font-size: 12px; color: #9ca3af;">置信度: N/A</span>';
            return container;
        }
        const colors = {
            1: '#ef4444',
            2: '#f97316',
            3: '#facc15',
            4: '#84cc16',
            5: '#22c55e'
        };
        const color = colors[score] || '#9ca3af';
        const starsContainer = document.createElement('div');
        starsContainer.style.cssText = 'display: flex; align-items: center; gap: 4px;';
        const scoreText = document.createElement('span');
        scoreText.textContent = `置信度:`;
        scoreText.style.cssText = `font-size: 13px; font-weight: 600; color: #374151; margin-right: 4px;`;
        starsContainer.appendChild(scoreText);
        for (let i = 1; i <= 5; i++) {
            const starSvg = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="${i <= score ? color : '#e5e7eb'}" stroke="${i <= score ? 'rgba(0,0,0,0.1)' : '#d1d5db'}" stroke-width="1">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
            `;
            starsContainer.innerHTML += starSvg;
        }
        starsContainer.title = `AI置信度评分: ${score} / 5`;
        container.appendChild(starsContainer);
        const suggestionText = document.createElement('span');
        const suggestions = {
            1: 'AI 极不确定，答案很可能错误，请务必自行检查或重新生成。',
            2: 'AI 不太确定，答案可能存在错误，建议仔细核对。',
            3: 'AI 有一定把握，但仍有出错可能，建议检查关键信息点。',
            4: 'AI 比较自信，答案大概率正确，建议快速检查一遍。',
            5: 'AI 非常自信，答案基本可信，但重要作业仍建议复核。'
        };
        suggestionText.textContent = `建议： ${suggestions[score] || '未知评分，请谨慎参考。'}`;
        suggestionText.style.cssText = `
            font-size: 12.5px;
            font-weight: 500;
            color: #4b5569;
            background-color: #f3f4f6;
            padding: 4px 10px;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
        `;
        container.appendChild(suggestionText);
        return container;
    }
    const QuarkSearchManager = {
        SERVICE_TICKET_KEY: 'quark_service_ticket',
        TICKET_EXPIRY_KEY: 'quark_ticket_expiry',
        _captchaScriptLoadingPromise: null,
        _gmRequest: function (details) {
            return new Promise((resolve, reject) => {
                if (!details.headers) {
                    details.headers = {};
                }
                details.headers['Referer'] = 'https://vt.quark.cn/';
                details.onload = (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            resolve(JSON.parse(response.responseText));
                        } catch (e) {
                            reject(new Error("JSON parsing error: " + e.message));
                        }
                    } else {
                        reject(new Error(`Request failed with status ${response.status}: ${response.statusText}`));
                    }
                };
                details.onerror = (response) => {
                    reject(new Error(`Network error: ${response.statusText || 'Unknown Error'}`));
                };
                details.ontimeout = () => {
                    reject(new Error('Request timed out.'));
                };
                GM_xmlhttpRequest(details);
            });
        },
        _getServiceTicket: function () {
            const ticket = localStorage.getItem(this.SERVICE_TICKET_KEY);
            const expiry = localStorage.getItem(this.TICKET_EXPIRY_KEY);
            if (ticket && expiry && Date.now() < parseInt(expiry)) {
                return ticket;
            }
            localStorage.removeItem(this.SERVICE_TICKET_KEY);
            localStorage.removeItem(this.TICKET_EXPIRY_KEY);
            showNotification('夸克授权已过期，请重试以重新登录。', { type: 'warning' });
            return null;
        },
        _setServiceTicket: function (ticket) {
            localStorage.setItem(this.SERVICE_TICKET_KEY, ticket);
            const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
            localStorage.setItem(this.TICKET_EXPIRY_KEY, String(expiry));
        },
        _initiateLoginFlow: function () {
            return new Promise(async (resolve, reject) => {
                const modalOverlay = document.createElement('div');
                modalOverlay.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: linear-gradient(135deg, rgba(0, 123, 255, 0.2), rgba(99, 102, 241, 0.2));
                    backdrop-filter: blur(12px);
                    z-index: 10002;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.3s ease-out;
                `;
                const modalContent = document.createElement('div');
                modalContent.style.cssText = `
                    background: linear-gradient(145deg, #ffffff, #f8f9fa);
                    padding: 40px;
                    border-radius: 24px;
                    text-align: center;
                    width: 400px;
                    max-width: 90vw;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.5) inset;
                    transform: scale(0.9);
                    animation: scaleIn 0.3s ease-out forwards;
                    position: relative;
                    overflow: hidden;
                `;
                const decorBg = document.createElement('div');
                decorBg.style.cssText = `
                    position: absolute;
                    top: -50%;
                    right: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%);
                    animation: rotate 20s linear infinite;
                    pointer-events: none;
                `;
                modalContent.appendChild(decorBg);
                modalContent.innerHTML += `
                    <style>
                        @keyframes fadeIn {
                            from { opacity: 0; }
                            to { opacity: 1; }
                        }
                        @keyframes scaleIn {
                            from { transform: scale(0.9); }
                            to { transform: scale(1); }
                        }
                        @keyframes rotate {
                            from { transform: rotate(0deg); }
                            to { transform: rotate(360deg); }
                        }
                        @keyframes shimmer {
                            0% { background-position: -1000px 0; }
                            100% { background-position: 1000px 0; }
                        }
                        @keyframes pulse {
                            0%, 100% { transform: scale(1); opacity: 1; }
                            50% { transform: scale(1.05); opacity: 0.8; }
                        }
                        .quark-title {
                            background: linear-gradient(135deg, #007bff 0%, #6366f1 100%);
                            background-clip: text;
                            font-size: 28px;
                            font-weight: 700;
                            margin: 0 0 10px 0;
                            position: relative;
                            z-index: 1;
                        }
                        .quark-subtitle {
                            font-size: 15px;
                            color: #6b7280;
                            margin-bottom: 30px;
                            line-height: 1.6;
                            position: relative;
                            z-index: 1;
                        }
                        .quark-subtitle strong {
                            color: #007bff;
                            font-weight: 600;
                        }
                        #quark-qrcode-container {
                            width: 220px;
                            height: 220px;
                            margin: 0 auto 25px;
                            background: linear-gradient(145deg, #f9fafb, #ffffff);
                            border-radius: 16px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(99, 102, 241, 0.1) inset;
                            position: relative;
                            z-index: 1;
                            overflow: hidden;
                            transition: all 0.3s ease;
                        }
                        #quark-qrcode-container:hover {
                            transform: scale(1.02);
                            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.15), 0 0 0 2px rgba(99, 102, 241, 0.2) inset;
                        }
                        #quark-qrcode-container img {
                            border-radius: 12px;
                            padding: 10px;
                            background: white;
                        }
                        .loading-spinner {
                            width: 50px;
                            height: 50px;
                            border: 5px solid #e5e7eb;
                            border-top-color: #6366f1;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                        }
                        #quark-status-text {
                            font-size: 15px;
                            color: #4f46e5;
                            font-weight: 600;
                            margin: 0;
                            position: relative;
                            z-index: 1;
                            padding: 12px 20px;
                            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(0, 123, 255, 0.1));
                            border-radius: 12px;
                            animation: pulse 2s ease-in-out infinite;
                        }
                    </style>
                    <h3 class="quark-title">🔍 夸克扫码登录</h3>
                    <p class="quark-subtitle">请使用 <strong>夸克 App 内自带的扫码功能</strong> 扫描下方二维码</p>
                    <div style="margin: 15px auto; padding: 12px 20px; background: #f0f9ff; border-left: 3px solid #0ea5e9; border-radius: 8px; font-size: 14px; color: #0c4a6e; max-width: 400px;">
                        <p style="margin: 0 0 8px 0; font-weight: 600;">💡 什么是夸克？</p>
                        <p style="margin: 0; line-height: 1.6;">夸克是阿里巴巴旗下的智能搜索引擎和浏览器。脚本使用夸克的搜题功能来帮助你快速找到题目答案。</p>
                        <p style="margin: 8px 0 0 0; text-align: center;">
                            <a href="https://quark.cn" target="_blank" style="color: #0ea5e9; text-decoration: none; font-weight: 600; border-bottom: 1px dashed #0ea5e9;">
                                👉 访问夸克官网了解更多
                            </a>
                        </p>
                    </div>
                    <div id="quark-qrcode-container">
                       <span class="loading-spinner"></span>
                    </div>
                    <p id="quark-status-text">正在获取二维码...</p>
                `;
                modalOverlay.appendChild(modalContent);
                document.body.appendChild(modalOverlay);
                let pollingInterval = null;
                const closeModal = () => {
                    if (pollingInterval) clearInterval(pollingInterval);
                    if (document.body.contains(modalOverlay)) {
                        document.body.removeChild(modalOverlay);
                    }
                };
                modalOverlay.onclick = (e) => {
                    if (e.target === modalOverlay) {
                        closeModal();
                        reject(new Error('用户取消登录'));
                    }
                };
                try {
                    const qrTokenData = await this._gmRequest({
                        method: "POST",
                        url: "https://api.open.uc.cn/cas/ajax/getTokenForQrcodeLogin",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        data: `client_id=574&request_id=${crypto.randomUUID().replace(/-/g, '')}&v=1.2`
                    });
                    if (qrTokenData.status !== 2000000) throw new Error('获取二维码Token失败');
                    const qrToken = qrTokenData.data.members.token;
                    const qrContainer = document.getElementById('quark-qrcode-container');
                    const ucParams = "uc_param_str=utkpddprfrlo&uc_biz_str=OPT%3ABACK_BTN_STYLE%400%7COPT%3ASAREA%400%7COPT%3AIMMERSIVE%401%7COPT%3AW_PAGE_REFRESH%401";
                    const qrCodeUrl = `https://vt.quark.cn/blm/qk-souti-759/login??${ucParams}&token=${qrToken}`;
                    qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUrl)}" alt="Quark Login QR Code">`;
                    document.getElementById('quark-status-text').textContent = '等待扫码确认...';
                    pollingInterval = setInterval(async () => {
                        try {
                            const stData = await this._gmRequest({
                                method: "POST",
                                url: "https://api.open.uc.cn/cas/ajax/getServiceTicketByQrcodeToken",
                                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                                data: `client_id=574&request_id=${crypto.randomUUID().replace(/-/g, '')}&v=1.2&token=${qrToken}`
                            });
                            if (stData.status === 2000000) {
                                clearInterval(pollingInterval);
                                document.getElementById('quark-status-text').textContent = '授权成功，正在获取凭证...';
                                const stLoginTicket = stData.data.members.service_ticket;
                                const finalStData = await this._gmRequest({
                                    method: "GET",
                                    url: `https://page-souti.myquark.cn/api/user/st?st=${stLoginTicket}`
                                });
                                if (finalStData.code === 0 && finalStData.data.serviceTicket) {
                                    const finalTicket = finalStData.data.serviceTicket;
                                    this._setServiceTicket(finalTicket);
                                    showNotification(`夸克登录成功，欢迎你，${finalStData.data.nickname}！`, { type: 'success' });
                                    closeModal();
                                    resolve(finalTicket);
                                } else {
                                    throw new Error('获取最终ServiceTicket失败: ' + (finalStData.msg || '未知错误'));
                                }
                            } else if (stData.status === 50004002) {
                                b(!0)
                                clearInterval(pollingInterval);
                                document.getElementById('quark-status-text').textContent = '二维码已失效，请重新尝试。';
                                reject(new Error('二维码已失效'));
                                closeModal();
                            } else if (stData.status !== 50004001) {
                                throw new Error(`轮询登录状态失败: ${stData.message}`);
                            }
                        } catch (pollError) {
                            clearInterval(pollingInterval);
                            closeModal();
                            reject(pollError);
                        }
                    }, 3000);
                } catch (error) {
                    console.error('夸克登录流程出错:', error);
                    closeModal();
                    reject(error);
                }
            });
        },
        _handleCaptcha: function () {
            return new Promise((resolve, reject) => {
                const modalOverlay = document.createElement('div');
                modalOverlay.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(8px);
                    z-index: 10003;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.3s ease-out;
                `;
                const modalContent = document.createElement('div');
                modalContent.style.cssText = `
                    background: linear-gradient(145deg, #ffffff, #f8f9fa);
                    padding: 40px;
                    border-radius: 24px;
                    text-align: center;
                    width: 420px;
                    max-width: 90vw;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    position: relative;
                    animation: scaleIn 0.3s ease-out forwards;
                `;
                const closeModal = () => {
                    if (document.body.contains(modalOverlay)) {
                        document.body.removeChild(modalOverlay);
                    }
                };
                modalContent.innerHTML = `
                    <style>
                        @keyframes fadeIn {
                            from { opacity: 0; }
                            to { opacity: 1; }
                        }
                        @keyframes scaleIn {
                            from { transform: scale(0.9); opacity: 0; }
                            to { transform: scale(1); opacity: 1; }
                        }
                        .captcha-close-btn {
                            position: absolute;
                            top: 12px;
                            right: 12px;
                            width: 36px;
                            height: 36px;
                            border-radius: 10px;
                            background: #f3f4f6;
                            border: 1px solid #e5e7eb;
                            color: #6b7280;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            cursor: pointer;
                            transition: all .2s ease;
                        }
                        .captcha-close-btn:hover { background: #e5e7eb; color: #111827; transform: rotate(90deg); }
                        .captcha-title {
                            font-size: 24px;
                            font-weight: 800;
                            margin: 0 0 10px 0;
                            background: linear-gradient(135deg, #0ea5e9, #6366f1);
                            -webkit-background-clip: text;
                            background-clip: text;
                        }
                        .captcha-subtitle {
                            font-size: 14px;
                            color: #6b7280;
                            margin-bottom: 18px;
                            line-height: 1.6;
                        }
                        #quark-captcha-container {
                            width: 100%;
                            margin: 10px 0 16px;
                            background: #fff;
                            border-radius: 14px;
                            border: 1px solid #e5e7eb;
                            box-shadow: 0 8px 24px rgba(0,0,0,0.06);
                            padding: 12px;
                        }
                        .captcha-footer {
                            font-size: 12px;
                            color: #6b7280;
                            background: #f9fafb;
                            border: 1px dashed #e5e7eb;
                            padding: 8px 10px;
                            border-radius: 10px;
                        }
                    </style>
                    <button class="captcha-close-btn" aria-label="关闭">✕</button>
                    <h3 class="captcha-title">🔐 夸克人机验证</h3>
                    <p class="captcha-subtitle">检测到需要人机验证，请完成下方滑块验证</p>
                    <div id="quark-captcha-container"></div>
                    <div class="captcha-footer">若长时间未加载，请刷新页面后重试。</div>
                `;
                modalOverlay.appendChild(modalContent);
                document.body.appendChild(modalOverlay);
                modalOverlay.onclick = (e) => {
                    if (e.target === modalOverlay) {
                        closeModal();
                        reject(new Error('用户取消验证'));
                    }
                };
                const closeBtn = modalContent.querySelector('.captcha-close-btn');
                if (closeBtn) closeBtn.addEventListener('click', () => { closeModal(); reject(new Error('用户取消验证')); });
                const self = this;
                const loadCaptchaScript = () => {
                    return new Promise((scriptResolve, scriptReject) => {
                        const pageWindow = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
                        if (self._captchaScriptLoadingPromise) {
                            console.log("♻️ 复用已存在的 NoCaptcha 加载任务...");
                            self._captchaScriptLoadingPromise.then(() => scriptResolve()).catch(scriptReject);
                            return;
                        }
                        if (pageWindow.NoCaptcha) {
                            console.log("✅ NoCaptcha 已存在于页面上下文，直接使用");
                            self._captchaScriptLoadingPromise = Promise.resolve();
                            scriptResolve();
                            return;
                        }
                        console.log("📥 使用 <script> 标签加载验证码脚本（注入到页面上下文）...");
                        self._captchaScriptLoadingPromise = new Promise((innerResolve, innerReject) => {
                            const script = document.createElement('script');
                            script.type = 'text/javascript';
                            script.charset = 'utf-8';
                            script.async = true;
                            script.src = 'https://g.alicdn.com/sd/nch5/index.js';
                            let resolved = false;
                            const handleLoad = () => {
                                if (resolved) return;
                                console.log("✅ 脚本标签 onload 触发");
                                console.log("🔍 沙箱 window.NoCaptcha:", window.NoCaptcha);
                                try {
                                    console.log("🔍 页面 unsafeWindow.NoCaptcha:", (typeof unsafeWindow !== 'undefined' ? unsafeWindow.NoCaptcha : 'unsafeWindow 不可用'));
                                } catch (e) {
                                    console.log("🔍 读取 unsafeWindow.NoCaptcha 异常:", e);
                                }
                                try {
                                    console.log("🔍 页面上下文 keys(部分):", Object.keys(pageWindow).slice(0, 50));
                                } catch (_) { }
                                setTimeout(() => {
                                    console.log("⏱️ 延迟 500ms 后检查...");
                                    console.log("🔍 pageWindow.NoCaptcha:", pageWindow.NoCaptcha);
                                    if (pageWindow.NoCaptcha) {
                                        resolved = true;
                                        console.log("✅ NoCaptcha 对象已就绪");
                                        innerResolve();
                                    } else {
                                        console.log("⏳ NoCaptcha 仍未定义，开始轮询...");
                                        let checkCount = 0;
                                        const checkInterval = setInterval(() => {
                                            checkCount++;
                                            console.log(`🔍 检查 NoCaptcha 对象 (${checkCount}/30)...`, pageWindow.NoCaptcha);
                                            if (pageWindow.NoCaptcha) {
                                                clearInterval(checkInterval);
                                                resolved = true;
                                                console.log("✅ NoCaptcha 对象已就绪");
                                                innerResolve();
                                            } else if (checkCount >= 30) {
                                                clearInterval(checkInterval);
                                                resolved = true;
                                                console.error("❌ 等待超时，pageWindow.NoCaptcha 仍未定义");
                                                try { console.error("📋 页面 window 属性采样:", Object.keys(pageWindow).slice(0, 50)); } catch (_) { }
                                                innerReject(new Error('NoCaptcha 对象初始化超时'));
                                            }
                                        }, 200);
                                    }
                                }, 500);
                            };
                            const handleError = (e) => {
                                if (resolved) return;
                                resolved = true;
                                console.error("❌ 脚本加载失败:", e);
                                innerReject(new Error('脚本文件加载失败'));
                            };
                            try {
                                let injectedEl = null;
                                if (typeof GM_addElement === 'function') {
                                    console.log("📌 使用 GM_addElement 注入脚本到页面");
                                    injectedEl = GM_addElement(document.head || document.documentElement, 'script', { src: script.src });
                                }
                                const el = injectedEl || script;
                                el.onload = handleLoad;
                                el.onreadystatechange = handleLoad;
                                el.onerror = handleError;
                                if (!injectedEl) {
                                    console.log("📌 将脚本标签添加到 document.head");
                                    (document.head || document.documentElement).appendChild(el);
                                }
                            } catch (e) {
                                console.log("📌 回退：直接 appendChild 注入脚本");
                                script.onload = handleLoad;
                                script.onreadystatechange = handleLoad;
                                script.onerror = handleError;
                                (document.head || document.documentElement).appendChild(script);
                            }
                        });
                        self._captchaScriptLoadingPromise
                            .then(() => scriptResolve())
                            .catch((err) => { self._captchaScriptLoadingPromise = null; scriptReject(err); });
                    });
                };
                loadCaptchaScript().then(() => {
                    console.log("🔧 开始初始化验证码组件...");
                    const nc_token = ["FFFF0N0000000000ABDE", new Date().getTime(), Math.random()].join(":");
                    console.log("🎫 生成 nc_token:", nc_token);
                    try {
                        const pageWindow = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
                        const nc = pageWindow.NoCaptcha.init({
                            appkey: "FFFF0N0000000000ABDE",
                            scene: "nc_other_h5",
                            token: nc_token,
                            trans: { key1: "code200" },
                            elementID: ["quark-captcha-container"],
                            is_Opt: 0,
                            language: "cn",
                            timeout: 10000,
                            retryTimes: 5,
                            errorTimes: 5,
                            inline: false,
                            renderTo: "#quark-captcha-container",
                            bannerHidden: false,
                            initHidden: false,
                            callback: function (data) {
                                if (data && data.csessionid) {
                                    console.log("✅ 验证码验证成功:", data);
                                    closeModal();
                                    resolve({
                                        csessionid: data.csessionid,
                                        nc_token: nc_token,
                                        sig: data.sig,
                                        scene: "nc_other_h5"
                                    });
                                }
                            },
                            error: function (error) {
                                console.error("❌ 验证码错误:", error);
                                showNotification('验证失败，请重试', { type: 'error' });
                            },
                            upLang: {
                                cn: {
                                    SLIDER_LABEL: "请向右滑动完成验证",
                                    CHECK_Y: "验证通过"
                                }
                            }
                        });
                        console.log("✅ NoCaptcha 实例创建成功:", nc);
                        pageWindow.NoCaptcha.setEnabled(true);
                        nc.reset();
                        console.log("✅ 验证码组件已渲染，等待用户操作...");
                    } catch (initError) {
                        console.error("❌ 初始化验证码组件失败:", initError);
                        closeModal();
                        reject(initError);
                    }
                }).catch(error => {
                    console.error("加载验证码脚本失败:", error);
                    closeModal();
                    reject(error);
                });
            });
        },
        _elementToImageBase64: async function (element) {
            const getStyles = async () => {
                const cssPromises = Array.from(document.styleSheets).map(sheet => {
                    return new Promise(resolve => {
                        if (sheet.href) {
                            GM_xmlhttpRequest({
                                method: 'GET',
                                url: sheet.href,
                                onload: (response) => resolve(response.responseText),
                                onerror: (error) => {
                                    console.warn(`无法加载样式表: ${sheet.href}`, error);
                                    resolve('');
                                },
                                ontimeout: () => {
                                    console.warn(`加载样式表超时: ${sheet.href}`);
                                    resolve('');
                                }
                            });
                        } else {
                            try {
                                resolve(Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n'));
                            } catch (e) {
                                console.warn("读取内联样式规则失败，将直接使用textContent。", e);
                                resolve(sheet.ownerNode.textContent || '');
                            }
                        }
                    });
                });
                const cssTexts = await Promise.all(cssPromises);
                return cssTexts.join('\n');
            };
            const rect = element.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            const clonedElement = element.cloneNode(true);
            clonedElement.style.backgroundColor = '#FFFFFF';
            clonedElement.querySelectorAll('script').forEach(s => s.remove());
            const allDescendants = clonedElement.querySelectorAll('*');
            allDescendants.forEach(el => {
                for (const attr of el.attributes) {
                    if (attr.name.startsWith('on')) {
                        el.removeAttribute(attr.name);
                    }
                }
            });
            const styles = await getStyles();
            const cleanedStyles = styles.replace(/@import url\(.*?\);/g, '');
            const svgString = `
                <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
                    <foreignObject width="100%" height="100%">
                        <div xmlns="http://www.w3.org/1999/xhtml" style="width: 100%; height: 100%;">
                            <style>${cleanedStyles}</style>
                            ${clonedElement.outerHTML}
                        </div>
                    </foreignObject>
                </svg>
            `;
            const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const scale = 2;
                    canvas.width = width * scale;
                    canvas.height = height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.scale(scale, scale);
                    ctx.drawImage(img, 0, 0);
                    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    resolve(jpegDataUrl);
                };
                img.onerror = (e) => {
                    console.error("SVG图像加载失败，这通常是因为SVG内容或其引用的资源存在安全问题或错误。", e);
                    console.log("生成的SVG Data URL (部分):", svgDataUrl.substring(0, 200) + "...");
                    reject(new Error('无法将SVG加载为图像，请检查控制台以获取详细信息'));
                };
                img.src = svgDataUrl;
            });
        },
        search: async function (questionElement, questionData) {
            let serviceTicket = this._getServiceTicket();
            if (!serviceTicket) {
                showNotification('需要夸克授权才能搜题，请扫码登录。', { type: 'info' });
                try { serviceTicket = await this._initiateLoginFlow(); }
                catch (error) {
                    showNotification(`夸克登录失败: ${error.message}`, { type: 'error' });
                    return null;
                }
            }
            showNotification('正在生成题目快照并上传夸克...', { type: 'info', id: 'quark-search-progress' });
            try {
                const imgBase64 = await domtoimage.toJpeg(questionElement, {
                    quality: 0.9,
                    bgcolor: '#FFFFFF',
                });
                const boundary = `----WebKitFormBoundary${crypto.randomUUID().replace(/-/g, '')}`;
                const reqJson = {
                    product: "photo_page",
                    img_url: imgBase64,
                    websiteUrl: encodeURIComponent(window.location.href),
                    chid: crypto.randomUUID().replace(/-/g, ''),
                    timestamp: Date.now(),
                    st: serviceTicket
                };
                const bodyParts = [
                    `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="imgFile"; filename="question.jpeg"\r\n` +
                    `Content-Type: image/jpeg\r\n\r\n`,
                    `\r\n--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="reqJson"\r\n` +
                    `Content-Type: application/json\r\n\r\n` +
                    JSON.stringify(reqJson) +
                    `\r\n--${boundary}--`
                ];
                const fetchRes = await fetch(imgBase64);
                const imgBlob = await fetchRes.blob();
                const imgArrayBuffer = await imgBlob.arrayBuffer();
                const textEncoder = new TextEncoder();
                const part1Buffer = textEncoder.encode(bodyParts[0]);
                const part2Buffer = textEncoder.encode(bodyParts[1]);
                const finalBody = new Uint8Array(part1Buffer.length + imgArrayBuffer.byteLength + part2Buffer.length);
                finalBody.set(part1Buffer, 0);
                finalBody.set(new Uint8Array(imgArrayBuffer), part1Buffer.length);
                finalBody.set(part2Buffer, part1Buffer.length + imgArrayBuffer.byteLength);
                let searchData = await this._gmRequest({
                    method: "POST",
                    url: "https://page-souti.myquark.cn/api/pc/souti",
                    headers: {
                        "Content-Type": `multipart/form-data; boundary=${boundary}`
                    },
                    data: finalBody.buffer,
                    binary: true
                });
                if (searchData.code !== 0 || searchData.data?.extJson?.abnormal_status === 'risk_req') {
                    if (searchData.msg && (searchData.msg.includes('st fail') || searchData.msg.includes('过期') || searchData.msg.includes('未登录'))) {
                        localStorage.removeItem(this.SERVICE_TICKET_KEY);
                        localStorage.removeItem(this.TICKET_EXPIRY_KEY);
                        showNotification('夸克授权已过期，请重试以重新登录。', { type: 'warning' });
                        return null;
                    }
                    if (searchData.code === 2001 || searchData.data?.extJson?.abnormal_status === 'risk_req') {
                        showNotification('需要完成人机验证，请稍候...', { type: 'info', id: 'quark-search-progress' });
                        try {
                            const captchaResult = await this._handleCaptcha();
                            if (!captchaResult) {
                                showNotification('验证已取消或失败。', { type: 'warning' });
                                return null;
                            }
                            const retryReqJson = {
                                ...reqJson,
                                aliSessionId: captchaResult.csessionid,
                                aliToken: captchaResult.nc_token,
                                aliSig: captchaResult.sig,
                                aliScene: captchaResult.scene
                            };
                            const retryBodyParts = [
                                `--${boundary}\r\n` +
                                `Content-Disposition: form-data; name="imgFile"; filename="question.jpeg"\r\n` +
                                `Content-Type: image/jpeg\r\n\r\n`,
                                `\r\n--${boundary}\r\n` +
                                `Content-Disposition: form-data; name="reqJson"\r\n` +
                                `Content-Type: application/json\r\n\r\n` +
                                JSON.stringify(retryReqJson) +
                                `\r\n--${boundary}--`
                            ];
                            const retryPart1Buffer = textEncoder.encode(retryBodyParts[0]);
                            const retryPart2Buffer = textEncoder.encode(retryBodyParts[1]);
                            const retryFinalBody = new Uint8Array(retryPart1Buffer.length + imgArrayBuffer.byteLength + retryPart2Buffer.length);
                            retryFinalBody.set(retryPart1Buffer, 0);
                            retryFinalBody.set(new Uint8Array(imgArrayBuffer), retryPart1Buffer.length);
                            retryFinalBody.set(retryPart2Buffer, retryPart1Buffer.length + imgArrayBuffer.byteLength);
                            const retrySearchData = await this._gmRequest({
                                method: "POST",
                                url: "https://page-souti.myquark.cn/api/pc/souti",
                                headers: {
                                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                                },
                                data: retryFinalBody.buffer,
                                binary: true
                            });
                            if (retrySearchData.code !== 0) {
                                throw new Error(`验证后搜题仍失败: ${retrySearchData.msg}`);
                            }
                            searchData = retrySearchData;
                        } catch (captchaError) {
                            console.error("处理验证码时出错:", captchaError);
                            showNotification(`验证处理失败: ${captchaError.message}`, { type: 'error', id: 'quark-search-progress' });
                            return null;
                        }
                    } else {
                        throw new Error(`夸克搜题失败: ${searchData.msg}`);
                    }
                }
                console.log("夸克搜题原始结果:", searchData);
                const results = searchData.data?.extJson?.result?.[0]?.sub_result?.questions;
                if (!results || results.length === 0) {
                    showNotification('夸克题库中未找到匹配的答案。', { type: 'warning' });
                    return null;
                }
                const questionTypeStr = getQuestionType(questionData.type);
                const sortedResults = [...results].sort((a, b) => {
                    const aMatch = a.question_type === questionTypeStr ? 1 : 0;
                    const bMatch = b.question_type === questionTypeStr ? 1 : 0;
                    return bMatch - aMatch;
                });
                console.log(`找到 ${sortedResults.length} 个搜题结果:`, sortedResults);
                return sortedResults;
            } catch (error) {
                console.error("夸克搜题流程出错:", error);
                showNotification(`夸克搜题出错: ${error.message}`, { type: 'error', id: 'quark-search-progress' });
                return null;
            }
        }
    };
    let modelsDevCache = null;
    async function fetchModelsDevApi() {
        if (modelsDevCache) return modelsDevCache;
        const CACHE_KEY = 'xiaoya_models_dev_cache';
        const CACHE_EXPIRY = 60 * 60 * 1000;
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_EXPIRY) {
                    modelsDevCache = data;
                    return data;
                }
            }
        } catch (e) {
            console.warn('读取 models.dev 缓存失败', e);
        }
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest === 'undefined') {
                console.warn('GM_xmlhttpRequest 未定义，无法获取 models.dev API。');
                resolve(null);
                return;
            }
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://models.dev/api.json",
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            modelsDevCache = data;
                            try {
                                localStorage.setItem(CACHE_KEY, JSON.stringify({
                                    data: data,
                                    timestamp: Date.now()
                                }));
                            } catch (e) {
                                console.warn('写入 models.dev 缓存失败', e);
                            }
                            resolve(data);
                        } catch (e) {
                            console.warn('解析 models.dev API 响应失败', e);
                            resolve(null);
                        }
                    } else {
                        console.warn('获取 models.dev API 失败', response.statusText);
                        resolve(null);
                    }
                },
                onerror: function (error) {
                    console.warn('网络错误，获取 models.dev API 失败', error);
                    resolve(null);
                },
                ontimeout: function () {
                    console.warn('获取 models.dev API 超时');
                    resolve(null);
                }
            });
        });
    }
    fetchModelsDevApi();
    const updateChecker = {
        API_URL: 'https://api.zygame1314.site/check/scripts',
        SCRIPT_NAME: '小雅答答答',
        CURRENT_VERSION: GM_info.script.version,
        async check() {
            console.log(`[更新检查] 当前版本: ${this.CURRENT_VERSION}，正在请求版本列表...`);
            try {
                const response = await fetch(this.API_URL);
                if (!response.ok) {
                    console.error('[更新检查] 请求版本API失败:', response.statusText);
                    return;
                }
                const scriptsData = await response.json();
                if (!Array.isArray(scriptsData)) {
                    console.error('[更新检查] API返回数据格式不正确，期望一个数组，但收到了:', scriptsData);
                    return;
                }
                const targetScript = scriptsData.find(s => s.name === this.SCRIPT_NAME);
                if (!targetScript) {
                    console.warn(`[更新检查] 在API列表中未找到脚本: ${this.SCRIPT_NAME}`);
                    return;
                }
                console.log(`[更新检查] 最新版本: ${targetScript.version}`);
                if (this.isNewerVersion(targetScript.version, this.CURRENT_VERSION)) {
                    console.log('[更新检查] 发现新版本！准备推送更新通知。');
                    this.showUpdateNotification(targetScript);
                } else {
                    console.log('[更新检查] 当前已是最新版本。');
                }
            } catch (error) {
                console.error('[更新检查] 发生错误:', error);
            }
        },
        isNewerVersion(newVersion, oldVersion) {
            const newParts = newVersion.split('.').map(Number);
            const oldParts = oldVersion.split('.').map(Number);
            for (let i = 0; i < Math.max(newParts.length, oldParts.length); i++) {
                const newPart = newParts[i] || 0;
                const oldPart = oldParts[i] || 0;
                if (newPart > oldPart) return true;
                if (newPart < oldPart) return false;
            }
            return false;
        },
        showUpdateNotification(scriptInfo) {
            showNotification(
                `发现新版本 v${scriptInfo.version}！点击立即更新。`,
                {
                    type: 'success',
                    duration: 0,
                    keywords: ['新版本', `v${scriptInfo.version}`, '更新'],
                    animation: 'scale'
                }
            );
            setTimeout(() => {
                const container = document.getElementById('notification-container');
                if (container && container.lastChild) {
                    const notificationElement = container.lastChild;
                    notificationElement.style.cursor = 'pointer';
                    notificationElement.onclick = () => {
                        window.open(scriptInfo.downloadUrl, '_blank');
                        notificationElement.innerHTML = '正在跳转至更新页面...<br>更新完成后回到本页将自动刷新';
                        const reloadOnFocus = () => {
                            window.removeEventListener('focus', reloadOnFocus);
                            location.reload();
                        };
                        window.addEventListener('focus', reloadOnFocus);
                        setTimeout(() => {
                            if (container.contains(notificationElement)) {
                                container.removeChild(notificationElement);
                            }
                        }, 2000);
                    };
                }
            }, 100);
        },
        init() {
            setTimeout(() => this.check(), 10000);
            setInterval(() => this.check(), 4 * 60 * 60 * 1000);
        }
    };
    updateChecker.init();
})();