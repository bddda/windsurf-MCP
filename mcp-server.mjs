import fs from 'fs';
import os from 'os';
import path from 'path';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// ⚠️ 核心修复：引入 Resources 和 Prompts 的请求 Schema
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ListPromptsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

const IPC_FILE = path.join(os.homedir(), '.windsurf_ask_continue_ipc.json');
const LOG_FILE = path.join(os.homedir(), '.windsurf_mcp_debug.log');

function log(msg) {
    try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch(e){}
}

log("=== [START] 终极防吞消息版 MCP 启动 ===");

// ⚠️ 终极防弹壳：彻底屏蔽所有默认的控制台输出，保护 stdio 不被任何杂质污染
console.log = () => {};
console.warn = () => {};
console.error = () => {};
console.info = () => {};

process.on('uncaughtException', err => {
    log(`[FATAL] 崩溃: ${err.message}`);
    process.exit(1);
});

// ⚠️ 核心修复：在 capabilities 里声明我们支持 resources 和 prompts
const server = new Server(
    { name: "windsurf-interceptor", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// =================================================================
// 🚨 救命稻草：拦截 Resources 和 Prompts 请求，返回空数组！
// 防止 Windsurf 收到 MethodNotFound 报错从而导致整个对话流崩溃吞消息！
// =================================================================
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    log("[REQ] Windsurf 拉取了资源列表 (返回空)");
    return { resources: [] };
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
    log("[REQ] Windsurf 拉取了 Prompt 列表 (返回空)");
    return { prompts: [] };
});

// 正常的工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
    log("[REQ] Windsurf 拉取了工具列表");
    return {
        tools: [{
            name: "log_dev_memo",
            description: "Save a development memo. Must be called after finishing a task phase.",
            inputSchema: {
                type: "object",
                properties: {
                    memo_content: { type: "string", description: "Summary in Chinese." }
                },
                required: ["memo_content"]
            }
        }]
    };
});

// 工具调用处理
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "log_dev_memo") {
        const message = request.params.arguments.memo_content;
        log(`[CALL] AI 调用了拦截工具: ${message}`);
        fs.writeFileSync(IPC_FILE, JSON.stringify({ status: "pending", message: message }));

        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                try {
                    const data = JSON.parse(fs.readFileSync(IPC_FILE, 'utf8'));
                    if (data.status === "resolved") {
                        clearInterval(checkInterval);
                        const feedback = data.choice;
                        fs.writeFileSync(IPC_FILE, JSON.stringify({ status: "idle" }));
                        
                        let systemPrompt = feedback === "Stop" 
                            ? "User clicked Stop." 
                            : `User new instructions: "${feedback}"`;
                            
                        resolve({ content: [{ type: "text", text: systemPrompt }] });
                    }
                } catch (e) {}
            }, 500);
        });
    }
    throw new Error("Tool not found");
});

async function start() {
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        log("✅ MCP 服务器连接成功！等待 AI 召唤...");
    } catch (e) {
        log(`[CRASH] 连接失败: ${e.message}`);
    }
}

start();