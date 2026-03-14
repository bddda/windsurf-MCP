const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
// 动态获取系统临时目录，无论 Mac 还是 Windows 都能完美运行
const IPC_FILE = path.join(os.homedir(), '.windsurf_ask_continue_ipc.json');

let currentPanel = null;

function autoInjectRules() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const rootPath = workspaceFolders[0].uri.fsPath;
    const rulesPath = path.join(rootPath, '.windsurfrules');
    
const magicRule = `
# === Auto-Injected by Windsurf Ask Continue Plugin ===
# MANDATORY SYSTEM OVERRIDE: TOOL EXECUTION
You have access to a local tool named \`log_dev_memo\`. 
Whenever you write code, modify files, or finish a task phase, you MUST call the \`log_dev_memo\` tool to summarize what you did and wait for the user's next instructions BEFORE finishing your response.
⚠️ IMPORTANT: The summary provided in \`memo_content\` MUST BE WRITTEN IN CHINESE (你必须使用中文进行系统汇报).
# =====================================================
`;

    try {
        if (fs.existsSync(rulesPath)) {
            const content = fs.readFileSync(rulesPath, 'utf8');
            if (!content.includes('Windsurf Ask Continue Plugin')) {
                fs.appendFileSync(rulesPath, '\n' + magicRule);
            }
        } else {
            fs.writeFileSync(rulesPath, magicRule);
        }
    } catch (error) {
        console.error('自动注入规则失败:', error);
    }
}

function activate(context) {
    console.log('Windsurf Ask Continue 插件已激活！(Element UI 增强版)');

    autoInjectRules();

    if (!fs.existsSync(IPC_FILE)) {
        fs.writeFileSync(IPC_FILE, JSON.stringify({ status: "idle" }));
    }

    let waitingForInput = false;

    function handleIPCChange() {
        try {
            const data = JSON.parse(fs.readFileSync(IPC_FILE, 'utf8'));
            
            if (data.status === 'pending' && !waitingForInput) {
                waitingForInput = true;

                if (!currentPanel) {
                    currentPanel = vscode.window.createWebviewPanel(
                        'aiControlPanel', 
                        '⚙️ AI 研发控制台', 
                        vscode.ViewColumn.Beside, 
                        {
                            enableScripts: true, 
                            retainContextWhenHidden: true 
                        }
                    );

                    currentPanel.webview.html = getWebviewContent();

                    currentPanel.webview.onDidReceiveMessage(message => {
                        if (message.command === 'submit') {
                            waitingForInput = false;
                            const input = message.text.trim();
                            let feedback = input === "" ? "Continue" : input;

                            // 处理附件：保存到磁盘，将路径附加到反馈中
                            if (message.attachments && message.attachments.length > 0) {
                                const attachDir = path.join(path.dirname(IPC_FILE), '.windsurf-attachments');
                                if (!fs.existsSync(attachDir)) {
                                    fs.mkdirSync(attachDir, { recursive: true });
                                }
                                const filePaths = [];
                                for (const att of message.attachments) {
                                    const safeName = Date.now() + '_' + att.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                                    const filePath = path.join(attachDir, safeName);
                                    const base64Data = att.data.replace(/^data:[^;]+;base64,/, '');
                                    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                                    filePaths.push(filePath);
                                }
                                feedback += '\n\n[用户附件 - 请使用 Read 工具查看以下文件]\n' + filePaths.join('\n');
                            }

                            fs.writeFileSync(IPC_FILE, JSON.stringify({ status: "resolved", choice: feedback }));
                        } else if (message.command === 'stop') {
                            waitingForInput = false;
                            fs.writeFileSync(IPC_FILE, JSON.stringify({ status: "resolved", choice: "Stop" }));
                            currentPanel.dispose();
                        }
                    }, undefined, context.subscriptions);

                    currentPanel.onDidDispose(() => {
                        waitingForInput = false;
                        const currentStatus = JSON.parse(fs.readFileSync(IPC_FILE, 'utf8')).status;
                        if (currentStatus === 'pending') {
                            fs.writeFileSync(IPC_FILE, JSON.stringify({ status: "resolved", choice: "Stop" }));
                        }
                        currentPanel = null;
                    }, null, context.subscriptions);
                }

                currentPanel.webview.postMessage({ 
                    command: 'showPrompt', 
                    text: data.message || "AI 正在等待下一步指示..." 
                });
            }
        } catch (e) {
            // 忽略冲突
        }
    }

    // fs.watch: 快速响应，但在 macOS 上不可靠（可能漏事件或发 rename 而非 change）
    const watcher = fs.watch(IPC_FILE, () => {
        handleIPCChange();
    });

    // 轮询兜底：确保即使 fs.watch 漏掉事件，也能在 1.5s 内检测到 pending 状态
    const pollInterval = setInterval(() => {
        handleIPCChange();
    }, 1500);

    context.subscriptions.push({ dispose: () => { watcher.close(); clearInterval(pollInterval); } });
}

// 🎨 核心 UI 渲染：像素级复刻 Element UI
function getWebviewContent() {
    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            /* 提取 Element Plus 的核心设计变量，并根据 VS Code 主题动态适配 */
            :root {
                --el-color-primary: #409eff;
                --el-color-primary-hover: #66b1ff;
                --el-color-danger: #f56c6c;
                --el-color-danger-hover: #f78989;
                --el-border-radius-base: 4px;
                --el-font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", Arial, sans-serif;
            }

            /* 默认：VS Code 亮色主题下的 Element UI 配色 */
            body {
                --el-bg-color: #f2f3f5;
                --el-card-bg: #ffffff;
                --el-text-color-primary: #303133;
                --el-text-color-regular: #606266;
                --el-border-color: #dcdfe6;
                --el-alert-bg: #f4f9ff;
                --el-alert-border: #c6e2ff;
                
                font-family: var(--el-font-family);
                background-color: var(--el-bg-color);
                color: var(--el-text-color-primary);
                padding: 24px;
                margin: 0;
            }

            /* 适配：VS Code 暗色主题下的 Element Plus Dark Mode 配色 */
            body.vscode-dark {
                --el-bg-color: #141414;
                --el-card-bg: #1d1e1f;
                --el-text-color-primary: #e5eaf3;
                --el-text-color-regular: #cfd3dc;
                --el-border-color: #414243;
                --el-alert-bg: #18222c;
                --el-alert-border: #213d5b;
            }

            /* --- Element UI 组件样式 --- */
            
            /* el-card */
            .el-card {
                background-color: var(--el-card-bg);
                border: 1px solid var(--el-border-color);
                border-radius: var(--el-border-radius-base);
                box-shadow: 0 2px 12px 0 rgba(0,0,0,0.05);
                transition: .3s;
                overflow: hidden;
                max-width: 800px;
                margin: 0 auto;
            }
            .el-card__header {
                padding: 18px 20px;
                border-bottom: 1px solid var(--el-border-color);
                box-sizing: border-box;
                font-size: 16px;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .el-card__body {
                padding: 20px;
            }

            /* el-alert */
            .el-alert {
                width: 100%;
                padding: 12px 16px;
                margin: 0;
                box-sizing: border-box;
                border-radius: var(--el-border-radius-base);
                background-color: var(--el-alert-bg);
                border: 1px solid var(--el-alert-border);
                color: var(--el-color-primary);
                margin-bottom: 24px;
                display: flex;
                flex-direction: column;
            }
            .el-alert__title {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 8px;
            }
            .el-alert__description {
                font-size: 13px;
                line-height: 1.6;
                color: var(--el-text-color-regular);
                margin: 0;
                white-space: pre-wrap;
            }

            /* el-form */
            .el-form-item {
                margin-bottom: 22px;
            }
            .el-form-item__label {
                text-align: right;
                vertical-align: middle;
                float: left;
                font-size: 14px;
                color: var(--el-text-color-regular);
                line-height: 40px;
                padding: 0 12px 0 0;
                box-sizing: border-box;
                font-weight: 500;
            }

            /* el-textarea */
            .el-textarea__inner {
                display: block;
                resize: vertical;
                padding: 10px 15px;
                line-height: 1.5;
                box-sizing: border-box;
                width: 100%;
                font-size: 14px;
                color: var(--el-text-color-primary);
                background-color: var(--el-card-bg);
                background-image: none;
                border: 1px solid var(--el-border-color);
                border-radius: var(--el-border-radius-base);
                transition: border-color .2s cubic-bezier(.645,.045,.355,1);
                font-family: inherit;
                min-height: 100px;
            }
            .el-textarea__inner:focus {
                outline: none;
                border-color: var(--el-color-primary);
            }
            .el-textarea__inner::placeholder {
                color: #a8abb2;
            }

            /* el-button */
            .el-button {
                display: inline-block;
                line-height: 1;
                white-space: nowrap;
                cursor: pointer;
                background: var(--el-card-bg);
                border: 1px solid var(--el-border-color);
                color: var(--el-text-color-regular);
                -webkit-appearance: none;
                text-align: center;
                box-sizing: border-box;
                outline: none;
                margin: 0;
                transition: .1s;
                font-weight: 500;
                padding: 12px 20px;
                font-size: 14px;
                border-radius: var(--el-border-radius-base);
            }
            .el-button + .el-button {
                margin-left: 12px;
            }
            .el-button--primary {
                color: #fff;
                background-color: var(--el-color-primary);
                border-color: var(--el-color-primary);
            }
            .el-button--primary:hover {
                background: var(--el-color-primary-hover);
                border-color: var(--el-color-primary-hover);
                color: #fff;
            }
            .el-button--danger.is-plain {
                color: var(--el-color-danger);
                background: transparent;
                border-color: var(--el-color-danger);
            }
            .el-button--danger.is-plain:hover {
                background: var(--el-color-danger);
                border-color: var(--el-color-danger);
                color: #fff;
            }
            .dialog-footer {
                text-align: right;
                margin-top: 10px;
            }

            /* el-loading (经典的 Element SVG 加载动画) */
            .el-loading-mask {
                display: none;
                position: absolute;
                z-index: 2000;
                background-color: rgba(var(--el-card-bg), 0.9);
                margin: 0;
                top: 0; right: 0; bottom: 0; left: 0;
                transition: opacity 0.3s;
                border-radius: var(--el-border-radius-base);
            }
            .el-loading-spinner {
                top: 50%;
                margin-top: -21px;
                width: 100%;
                text-align: center;
                position: absolute;
            }
            .circular {
                height: 42px;
                width: 42px;
                animation: loading-rotate 2s linear infinite;
            }
            .path {
                animation: loading-dash 1.5s ease-in-out infinite;
                stroke-dasharray: 90, 150;
                stroke-dashoffset: 0;
                stroke-width: 2;
                stroke: var(--el-color-primary);
                stroke-linecap: round;
            }
            .el-loading-text {
                color: var(--el-color-primary);
                margin: 3px 0;
                font-size: 14px;
                margin-top: 10px;
            }

            @keyframes loading-rotate {
                100% { transform: rotate(360deg); }
            }
            @keyframes loading-dash {
                0% { stroke-dasharray: 1, 200; stroke-dashoffset: 0; }
                50% { stroke-dasharray: 90, 150; stroke-dashoffset: -40px; }
                100% { stroke-dasharray: 90, 150; stroke-dashoffset: -120px; }
            }

            /* el-upload 拖拽上传区 */
            .el-upload-dragger {
                background-color: var(--el-card-bg);
                border: 1px dashed var(--el-border-color);
                border-radius: 6px;
                cursor: pointer;
                text-align: center;
                padding: 20px;
                transition: border-color .2s, background-color .2s;
            }
            .el-upload-dragger:hover,
            .el-upload-dragger.is-dragover {
                border-color: var(--el-color-primary);
            }
            .el-upload-dragger.is-dragover {
                background-color: var(--el-alert-bg);
            }
            .el-upload__icon { font-size: 28px; margin-bottom: 6px; }
            .el-upload__text { color: var(--el-text-color-regular); font-size: 13px; }
            .el-upload__text em { color: var(--el-color-primary); font-style: normal; cursor: pointer; }

            /* 已上传文件列表 */
            .el-upload-list { margin-top: 8px; }
            .el-upload-list__item {
                display: flex;
                align-items: center;
                padding: 6px 8px;
                border-radius: var(--el-border-radius-base);
                background: var(--el-alert-bg);
                border: 1px solid var(--el-border-color);
                margin-bottom: 6px;
                gap: 8px;
                font-size: 13px;
            }
            .el-upload-list__item-thumbnail {
                width: 48px; height: 48px;
                object-fit: cover;
                border-radius: 4px;
                flex-shrink: 0;
            }
            .el-upload-list__item-icon {
                font-size: 20px; flex-shrink: 0;
                width: 48px; text-align: center;
            }
            .el-upload-list__item-name {
                flex: 1; overflow: hidden;
                text-overflow: ellipsis; white-space: nowrap;
                color: var(--el-text-color-primary);
            }
            .el-upload-list__item-size {
                color: var(--el-text-color-regular);
                font-size: 12px; flex-shrink: 0;
            }
            .el-upload-list__item-close {
                cursor: pointer;
                color: var(--el-text-color-regular);
                font-size: 16px; flex-shrink: 0;
                width: 20px; height: 20px;
                display: flex; align-items: center; justify-content: center;
                border-radius: 50%;
                transition: all .2s;
            }
            .el-upload-list__item-close:hover {
                background: var(--el-color-danger);
                color: #fff;
            }
        </style>
    </head>
    <body>
        
        <div class="el-card" id="interactionCard">
            <div class="el-loading-mask" id="loadingState">
                <div class="el-loading-spinner">
                    <svg viewBox="25 25 50 50" class="circular">
                        <circle cx="50" cy="50" r="20" fill="none" class="path"></circle>
                    </svg>
                    <p class="el-loading-text">执行中，请稍候...</p>
                </div>
            </div>

            <div class="el-card__header">
                <span>⚡️</span> <span>AI 流程控制台</span>
            </div>
            
            <div class="el-card__body">
                <div class="el-alert">
                    <span class="el-alert__title">系统汇报节点</span>
                    <p class="el-alert__description" id="aiMessage">等待数据载入...</p>
                </div>
                
                <div class="el-form-item" style="margin-top: 20px;">
                    <div class="el-form-item__label" style="float: none; text-align: left; padding-bottom: 8px;">下一步业务指令</div>
                    <textarea class="el-textarea__inner" id="userInput" placeholder="例如：提取一个公共工具类，并补充异常捕获逻辑...&#10;(按 ⌘+Enter 快捷提交)"></textarea>
                </div>

                <div class="el-form-item" style="margin-top: 16px;">
                    <div class="el-form-item__label" style="float: none; text-align: left; padding-bottom: 8px;">附件（可拖入文件或图片）</div>
                    <div class="el-upload-dragger" id="dropZone">
                        <div class="el-upload__icon">📎</div>
                        <div class="el-upload__text">将文件拖到此处，或 <em>点击上传</em></div>
                    </div>
                    <input type="file" id="fileInput" multiple style="display: none;">
                    <div class="el-upload-list" id="fileList"></div>
                </div>
                
                <div class="dialog-footer">
                    <button class="el-button el-button--danger is-plain" id="btnStop">
                        <span>终止任务</span>
                    </button>
                    <button class="el-button el-button--primary" id="btnContinue">
                        <span>提交并继续 (⌘+Enter)</span>
                    </button>
                </div>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            
            const btnContinue = document.getElementById('btnContinue');
            const btnStop = document.getElementById('btnStop');
            const userInput = document.getElementById('userInput');
            const loadingState = document.getElementById('loadingState');

            // === 附件管理 ===
            const attachments = [];
            const dropZone = document.getElementById('dropZone');
            const fileInput = document.getElementById('fileInput');
            const fileListEl = document.getElementById('fileList');
            const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

            // 全局阻止浏览器默认拖拽行为（防止在区域外松手时打开文件）
            document.addEventListener('dragover', (e) => e.preventDefault());
            document.addEventListener('drop', (e) => e.preventDefault());

            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault(); e.stopPropagation();
                dropZone.classList.add('is-dragover');
            });
            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault(); e.stopPropagation();
                dropZone.classList.remove('is-dragover');
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault(); e.stopPropagation();
                dropZone.classList.remove('is-dragover');
                handleFiles(e.dataTransfer.files);
            });
            fileInput.addEventListener('change', () => {
                handleFiles(fileInput.files);
                fileInput.value = '';
            });

            function handleFiles(files) {
                Array.from(files).forEach(file => {
                    if (file.size > MAX_FILE_SIZE) {
                        alert(file.name + ' 超过 10MB 限制，已跳过');
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        attachments.push({ name: file.name, type: file.type, size: file.size, data: ev.target.result });
                        renderFileList();
                    };
                    reader.readAsDataURL(file);
                });
            }

            function renderFileList() {
                fileListEl.innerHTML = attachments.map((att, idx) => {
                    const isImg = att.type.startsWith('image/');
                    const preview = isImg
                        ? '<img class="el-upload-list__item-thumbnail" src="' + att.data + '">'
                        : '<span class="el-upload-list__item-icon">📄</span>';
                    const sz = att.size < 1024 ? att.size + 'B'
                        : att.size < 1048576 ? (att.size / 1024).toFixed(1) + 'KB'
                        : (att.size / 1048576).toFixed(1) + 'MB';
                    return '<div class="el-upload-list__item">'
                        + preview
                        + '<span class="el-upload-list__item-name">' + att.name + '</span>'
                        + '<span class="el-upload-list__item-size">' + sz + '</span>'
                        + '<span class="el-upload-list__item-close" onclick="removeFile(' + idx + ')">×</span>'
                        + '</div>';
                }).join('');
            }

            function removeFile(idx) {
                attachments.splice(idx, 1);
                renderFileList();
            }

            // === 提交逻辑 ===
            function submit() {
                const files = attachments.map(a => ({ name: a.name, type: a.type, data: a.data }));
                vscode.postMessage({ command: 'submit', text: userInput.value, attachments: files });
                loadingState.style.display = 'block';
            }

            btnContinue.addEventListener('click', submit);
            
            userInput.addEventListener('keydown', function(e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    submit();
                }
            });

            btnStop.addEventListener('click', () => {
                vscode.postMessage({ command: 'stop' });
            });

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'showPrompt') {
                    loadingState.style.display = 'none';
                    document.getElementById('aiMessage').innerText = message.text;
                    userInput.value = '';
                    attachments.length = 0;
                    renderFileList();
                    userInput.focus();
                }
            });
        </script>
    </body>
    </html>
    `;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};