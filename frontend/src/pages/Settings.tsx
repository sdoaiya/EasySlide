import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Key, Image, Zap, Save, RotateCcw, Globe, FileText, Brain, ArrowUp, HelpCircle, Link2, ChevronDown, Volume2, Info, Settings as SettingsIcon, Sparkles, LayoutDashboard, FolderOpen, Box, ImagePlus } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { getStaticAssetUrl } from '@/api/client';

// 组件内翻译
const settingsI18n = {
  zh: {
    nav: {
      backToHome: '返回工作台',
      home: '首页',
      createProject: '创建项目',
      history: '我的项目',
      materialCenter: '素材中心',
      materialGenerate: '素材生成',
      settings: '设置',
    },
    settings: {
      sections: {
        aiProviderOpenAI: "AI 提供商与 OpenAI",
        appearance: "工作区与外观", language: "界面语言", apiConfig: "默认 AI 提供商",
        apiConfigDesc: "下方模型未单独指定提供商时，将使用此处的配置",
        modelConfig: "模型配置", mineruConfig: "MinerU 配置", imageConfig: "图像生成配置",
        performanceConfig: "性能配置", outputLanguage: "输出语言设置",
        textReasoning: "文本推理模式", imageReasoning: "图像推理模式",
        baiduOcr: "百度 Inpaint 配置", serviceTest: "服务测试", lazyllmConfig: "LazyLLM 厂商配置",
        vendorApiKeys: "厂商 API Key 配置",
        exportConfig: "导出设置",
        advancedSettings: "高级设置",
        elevenlabs: "ElevenLabs 语音合成"
      },
      openaiOAuth: {
        title: "OpenAI 授权连接",
        description: "通过 OAuth 授权 OpenAI，无需手动输入 API Key 即可使用 OpenAI 的模型（如 GPT Image）",
        authorizeBtn: "授权连接 OpenAI",
        disconnectBtn: "断开连接",
        connected: "已连接",
        disconnected: "未连接",
        account: "授权标识",
        connecting: "连接中...",
        disconnecting: "断开中...",
        connectFailed: "OpenAI 授权连接失败。若授权窗口显示 unsupported_country_region_territory，表示当前网络地区暂不支持 OpenAI 授权，请切换可用网络后重试，或使用 API Key / 兼容地址配置。",
        disconnectFailed: "断开失败",
        disconnectSuccess: "已断开 OpenAI 授权",
        hint: "授权后，可在上方模型配置中选择 Codex 作为提供商，使用你的 OpenAI 额度",
        availableModels: "可用模型",
        selectModel: "选择模型...",
        loadingModels: "正在加载可用模型...",
        noAvailableModels: "暂无可用模型",
        connectFirst: "请先授权连接 OpenAI",
        textModels: "OpenAI 文本模型",
        imageModels: "OpenAI 图片模型",
        setupConnect: "授权连接 OpenAI",
        setupRecommended: "应用推荐配置",
        setupCreate: "开始创作演示文稿",
        applyRecommendedBtn: "应用 OpenAI 推荐配置",
        recommendedApplied: "已应用 OpenAI 推荐模型配置",
        manualCallbackLabel: "连接后仍失败？",
        manualCallbackHint: "请复制弹窗浏览器地址栏中的完整地址，粘贴到下方即可完成连接",
        manualCallbackPlaceholder: "粘贴回调地址...",
        manualCallbackSubmit: "提交",
        manualCallbackSuccess: "连接成功",
        callbackPortBusy: "检测到本机 1455 端口被占用，请授权后复制弹窗地址栏中的完整地址并粘贴到下方。",
        authLinkReady: "授权链接已准备好，若没有弹出窗口，请使用下方入口继续。",
        authRegionHint: "如果授权窗口显示 unsupported_country_region_territory，表示当前网络地区暂不支持 OpenAI 授权，请切换可用网络后重试，或改用 OpenAI API Key / 兼容地址配置。",
        openAuthPage: "打开授权页面",
        copyAuthLink: "复制授权链接",
      },
      theme: { label: "主题模式", light: "浅色", dark: "深色", system: "跟随系统" },
      language: { label: "界面语言", zh: "中文", en: "English" },
      fields: {
        aiProviderFormat: "AI 提供商格式",
        aiProviderFormatDesc: "选择 API 请求格式，影响后端如何构造和发送请求。保存设置后生效。",
        openaiFormat: "OpenAI 格式", geminiFormat: "Gemini 格式", lazyllmFormat: "LazyLLM 格式",
        apiBaseUrl: "API Base URL", apiBaseUrlPlaceholder: "https://api.example.com",
        apiBaseUrlDesc: "设置大模型提供商 API 的基础 URL",
        apiKey: "API Key", apiKeyPlaceholder: "输入新的 API Key",
        apiKeyDesc: "留空则保持当前设置不变，输入新值则更新",
        apiKeySet: "已设置（长度: {{length}}）",
        textModel: "文本大模型", textModelPlaceholder: "留空使用环境变量配置 (如: gemini-3-flash-preview)",
        textModelDesc: "用于生成大纲、描述等文本内容的模型名称",
        imageModel: "图像生成模型", imageModelPlaceholder: "留空使用环境变量配置 (如: imagen-3.0-generate-001)",
        imageModelDesc: "用于生成页面图片的模型名称",
        imageCaptionModel: "图片识别模型", imageCaptionModelPlaceholder: "留空使用环境变量配置 (如: gemini-3-flash-preview)",
        imageCaptionModelDesc: "用于识别参考文件中的图片并生成描述",
        mineruApiBase: "MinerU API Base", mineruApiBasePlaceholder: "留空使用环境变量配置 (如: https://mineru.net)",
        mineruApiBaseDesc: "MinerU 服务地址，用于解析参考文件",
        mineruToken: "MinerU Token", mineruTokenPlaceholder: "输入新的 MinerU Token",
        mineruTokenDesc: "留空则保持当前设置不变，输入新值则更新",
        imageResolution: "图像清晰度（某些OpenAI格式中转调整该值无效）",
        imageResolutionDesc: "更高的清晰度会生成更详细的图像，但需要更长时间",
        descriptionGenerationMode: "描述生成模式", descriptionGenerationModeDesc: "流式模式通过一次 AI 调用逐页生成，体验更流畅；并行模式为每页独立调用 AI，速度更快",
        descriptionGenerationModeStreaming: "流式", descriptionGenerationModeParallel: "并行",
        maxDescriptionWorkers: "描述生成最大并发数", maxDescriptionWorkersDesc: "并行模式下同时生成描述的最大工作线程数 (1-20)，越大速度越快",
        maxImageWorkers: "图像生成最大并发数", maxImageWorkersDesc: "同时生成图像的最大工作线程数 (1-20)，越大速度越快",
        defaultOutputLanguage: "默认输出语言", defaultOutputLanguageDesc: "AI 生成内容时使用的默认语言",
        enableTextReasoning: "启用文本推理", enableTextReasoningDesc: "开启后，文本生成（大纲、描述等）会使用 extended thinking 进行深度推理",
        textThinkingBudget: "文本思考负载", textThinkingBudgetDesc: "文本推理的思考 token 预算 (1-8192)，数值越大推理越深入",
        enableImageReasoning: "启用图像推理", enableImageReasoningDesc: "开启后，图像生成会使用思考链模式，可能获得更好的构图效果",
        imageThinkingBudget: "图像思考负载", imageThinkingBudgetDesc: "图像推理的思考 token 预算 (1-8192)，数值越大推理越深入",
        baiduOcrApiKey: "百度 Inpaint 服务 Key", baiduOcrApiKeyPlaceholder: "输入百度 Inpaint API Key",
        baiduOcrApiKeyDesc: "仅用于可编辑 PPTX 导出的百度图像修复 / Inpaint 服务；OCR 已内置 PaddleOCR-VL，无需填写 OCR Key",
        elevenLabsEnabled: "启用 ElevenLabs 语音合成",
        elevenLabsEnabledDesc: "开启后，视频导出将使用 ElevenLabs 代替 edge-tts 生成旁白音频，音质更自然",
        elevenLabsApiKey: "ElevenLabs API Key", elevenLabsApiKeyPlaceholder: "输入 ElevenLabs API Key",
        elevenLabsApiKeyDesc: "留空则保持当前设置不变，API Key 可在 ElevenLabs 控制台获取",
        applyLink: "，请点击此处申请",
        textModelSource: "文本模型提供商格式", textModelSourceDesc: "选择文本生成使用的提供商格式", textModelSourcePlaceholder: "-- 请选择 --",
        imageModelSource: "图片模型提供商格式", imageModelSourceDesc: "选择图片生成使用的提供商格式", imageModelSourcePlaceholder: "-- 请选择 --",
        imageCaptionModelSource: "图片识别模型提供商格式", imageCaptionModelSourceDesc: "选择图片识别使用的提供商格式", imageCaptionModelSourcePlaceholder: "-- 请选择 --",
        vendorApiKey: "{{vendor}} API Key", vendorApiKeyPlaceholder: "输入 {{vendor}} API Key",
        vendorApiKeyDesc: "留空则保持当前设置不变，输入新值则更新",
        vendorApiKeySet: "已设置（长度: {{length}}）",
        selectPlaceholder: "-- 请选择 --",
        modelProvider: "提供商", modelProviderDesc: "为此模型选择独立的提供商，不选则使用上方默认配置",
        modelProviderPlaceholder: "-- 使用默认配置 --",
        perModelApiBaseUrl: "API Base URL", perModelApiBaseUrlPlaceholder: "留空使用默认 Base URL",
        perModelApiKey: "API Key", perModelApiKeyPlaceholder: "输入 API Key",
        perModelApiKeyDesc: "留空则保持当前设置不变",
        perModelApiKeySet: "已设置（长度: {{length}}）",
        imageApiProtocol: "图片 API 协议",
        imageApiProtocolDesc: "选择图片生成使用的 API 路径。自动检测根据模型名判断，也可强制指定",
        imageApiProtocolAuto: "自动检测",
        imageApiProtocolImages: "images.generate",
        imageApiProtocolChat: "chat.completions",
      },
      apiKeyHelp: {
        title: "如何获取 API 密钥",
        step1: "打开 {{link}}，进入控制台",
        step2: "在 OpenAI Platform 中进入 API keys 页面",
        step3: "点击「Create new secret key」生成新的 API Key",
        step4: "复制生成的 API Key，并粘贴到本页完成配置",
        linkLabel: "访问 OpenAI Platform →",
        copyLink: "复制链接",
      },
      apiKeyTip: { before: "若使用 API Key 模式，可前往 ", linkLabel: "OpenAI Platform", after: " 创建和管理密钥" },
      exportPath: {
        label: "导出路径",
        description: "下载导出的文件会直接保存到此目录；应用重启后，后台生成导出文件也会使用此目录。",
        desktopOnly: "导出路径设置仅桌面版可用",
        notSet: "未读取到导出路径",
      },
      serviceTest: {
        title: "服务测试", description: "提前验证关键服务配置是否可用，避免使用期间异常。",
        tip: "提示：图像生成测试可能需要数分钟（取决于模型），请耐心等待。",
        startTest: "开始测试", testing: "测试中...", testTimeout: "测试超时，请重试", testFailed: "测试失败",
        tests: {
          baiduOcr: { title: "OCR 服务", description: "使用内置 PaddleOCR-VL 识别测试图片文字" },
          textModel: { title: "文本生成模型", description: "发送短提示词，验证文本模型与 API 配置" },
          captionModel: { title: "图片识别模型", description: "生成测试图片并请求模型输出描述" },
          baiduInpaint: { title: "百度 Inpaint 服务", description: "使用测试图片执行修复，验证百度图像修复服务 Key" },
          imageModel: { title: "图像生成模型", description: "基于测试图片生成演示文稿背景图（固定分辨率，可能需要 20-40 秒）" },
          mineruPdf: { title: "Paddle PDF 解析", description: "使用内置 PaddleOCR-VL 解析测试 PDF（可能需要 30-60 秒）" }
        },
        results: {
          recognizedText: "识别结果：{{text}}", modelReply: "模型回复：{{reply}}",
          captionDesc: "识别描述：{{caption}}", imageSize: "输出尺寸：{{width}}x{{height}}",
          parsePreview: "解析预览：{{preview}}"
        }
      },
      actions: { save: "保存设置", saving: "保存中...", resetToDefault: "重置为默认配置", openDataDir: "打开数据目录", chooseExportDir: "选择导出路径", openExportDir: "打开导出路径" },
      messages: {
        loadFailed: "加载设置失败", saveSuccess: "设置保存成功", saveFailed: "保存设置失败",
        resetConfirm: "将把大模型、图像生成和并发等所有配置恢复为环境默认值，已保存的自定义设置将丢失，确定继续吗？",
        resetTitle: "确认重置为默认配置", resetSuccess: "设置已重置", resetFailed: "重置设置失败",
        testServiceTip: "建议在本页底部进行服务测试，验证关键配置",
        resetConfirmBtn: "确定重置", resetCancelBtn: "取消", unknownError: "未知错误",
        exportDirUpdated: "导出路径已更新",
        testSuccess: "测试成功"
      }
    }
  },
  en: {
    nav: {
      backToHome: 'Back to workspace',
      home: 'Home',
      createProject: 'Create Project',
      history: 'My Projects',
      materialCenter: 'Material Center',
      materialGenerate: 'Material Generation',
      settings: 'Settings',
    },
    settings: {
      sections: {
        aiProviderOpenAI: "AI Provider & OpenAI",
        appearance: "Workspace & Appearance", language: "Interface Language", apiConfig: "Default AI Provider",
        apiConfigDesc: "Used as fallback when a model below has no provider specified",
        modelConfig: "Model Configuration", mineruConfig: "MinerU Configuration", imageConfig: "Image Generation Configuration",
        performanceConfig: "Performance Configuration", outputLanguage: "Output Language Settings",
        textReasoning: "Text Reasoning Mode", imageReasoning: "Image Reasoning Mode",
        baiduOcr: "Baidu Inpaint Configuration", serviceTest: "Service Test", lazyllmConfig: "LazyLLM Provider Configuration",
        vendorApiKeys: "Vendor API Key Configuration",
        exportConfig: "Export Settings",
        advancedSettings: "Advanced Settings",
        elevenlabs: "ElevenLabs Text-to-Speech"
      },
      openaiOAuth: {
        title: "OpenAI Authorization",
        description: "Authorize OpenAI via OAuth to use OpenAI models (e.g. GPT Image) without entering an API key",
        authorizeBtn: "Authorize OpenAI",
        disconnectBtn: "Disconnect",
        connected: "Connected",
        disconnected: "Not connected",
        account: "Authorization identity",
        connecting: "Connecting...",
        disconnecting: "Disconnecting...",
        connectFailed: "Connection failed",
        disconnectFailed: "Disconnect failed",
        disconnectSuccess: "OpenAI authorization disconnected",
        hint: "When authorized, select Codex as the provider in model configuration above to use your OpenAI credits",
        availableModels: "Available Models",
        selectModel: "Select a model...",
        loadingModels: "Loading available models...",
        noAvailableModels: "No models available yet",
        connectFirst: "Please authorize OpenAI first",
        textModels: "OpenAI Text Models",
        imageModels: "OpenAI Image Models",
        setupConnect: "Authorize OpenAI",
        setupRecommended: "Apply recommended setup",
        setupCreate: "Start creating slides",
        applyRecommendedBtn: "Use OpenAI recommended setup",
        recommendedApplied: "OpenAI recommended model settings applied",
        manualCallbackLabel: "Connection still failing?",
        manualCallbackHint: "Copy the full URL from the popup's address bar and paste it below to complete the connection",
        manualCallbackPlaceholder: "Paste callback URL...",
        manualCallbackSubmit: "Submit",
        manualCallbackSuccess: "Connected successfully",
        callbackPortBusy: "Port 1455 is already in use. After authorization, copy the full popup address-bar URL and paste it below.",
        authLinkReady: "Authorization link is ready. If no popup appears, use the links below to continue.",
        authRegionHint: "If the authorization window shows unsupported_country_region_territory, the current network region does not support OpenAI authorization. Switch to a supported network, or use an API key / compatible endpoint.",
        openAuthPage: "Open authorization page",
        copyAuthLink: "Copy authorization link",
      },
      theme: { label: "Theme", light: "Light", dark: "Dark", system: "System" },
      language: { label: "Interface Language", zh: "中文", en: "English" },
      fields: {
        aiProviderFormat: "AI Provider Format",
        aiProviderFormatDesc: "Select API request format, affects how backend constructs and sends requests. Takes effect after saving.",
        openaiFormat: "OpenAI Format", geminiFormat: "Gemini Format", lazyllmFormat: "LazyLLM Format",
        apiBaseUrl: "API Base URL", apiBaseUrlPlaceholder: "https://api.example.com",
        apiBaseUrlDesc: "Set the base URL for the LLM provider API",
        apiKey: "API Key", apiKeyPlaceholder: "Enter new API Key",
        apiKeyDesc: "Leave empty to keep current setting, enter new value to update",
        apiKeySet: "Set (length: {{length}})",
        textModel: "Text Model", textModelPlaceholder: "Leave empty to use env config (e.g., gemini-3-flash-preview)",
        textModelDesc: "Model name for generating outlines, descriptions, etc.",
        imageModel: "Image Generation Model", imageModelPlaceholder: "Leave empty to use env config (e.g., imagen-3.0-generate-001)",
        imageModelDesc: "Model name for generating page images",
        imageCaptionModel: "Image Caption Model", imageCaptionModelPlaceholder: "Leave empty to use env config (e.g., gemini-3-flash-preview)",
        imageCaptionModelDesc: "Model for recognizing images in reference files and generating descriptions",
        mineruApiBase: "MinerU API Base", mineruApiBasePlaceholder: "Leave empty to use env config (e.g., https://mineru.net)",
        mineruApiBaseDesc: "MinerU service address for parsing reference files",
        mineruToken: "MinerU Token", mineruTokenPlaceholder: "Enter new MinerU Token",
        mineruTokenDesc: "Leave empty to keep current setting, enter new value to update",
        imageResolution: "Image Resolution (may not work with some OpenAI format proxies)",
        imageResolutionDesc: "Higher resolution generates more detailed images but takes longer",
        descriptionGenerationMode: "Description Generation Mode", descriptionGenerationModeDesc: "Streaming mode generates all pages in a single AI call for a smoother experience; Parallel mode calls AI independently per page for faster speed",
        descriptionGenerationModeStreaming: "Streaming", descriptionGenerationModeParallel: "Parallel",
        maxDescriptionWorkers: "Max Description Workers", maxDescriptionWorkersDesc: "Maximum concurrent workers for description generation in parallel mode (1-20), higher is faster",
        maxImageWorkers: "Max Image Workers", maxImageWorkersDesc: "Maximum concurrent workers for image generation (1-20), higher is faster",
        defaultOutputLanguage: "Default Output Language", defaultOutputLanguageDesc: "Default language for AI-generated content",
        enableTextReasoning: "Enable Text Reasoning", enableTextReasoningDesc: "When enabled, text generation uses extended thinking for deeper reasoning",
        textThinkingBudget: "Text Thinking Budget", textThinkingBudgetDesc: "Token budget for text reasoning (1-8192), higher values enable deeper reasoning",
        enableImageReasoning: "Enable Image Reasoning", enableImageReasoningDesc: "When enabled, image generation uses chain-of-thought mode for better composition",
        imageThinkingBudget: "Image Thinking Budget", imageThinkingBudgetDesc: "Token budget for image reasoning (1-8192), higher values enable deeper reasoning",
        baiduOcrApiKey: "Baidu Inpaint Service Key", baiduOcrApiKeyPlaceholder: "Enter Baidu Inpaint API Key",
        baiduOcrApiKeyDesc: "Only used for Baidu image repair / inpaint in editable PPTX export. OCR uses built-in PaddleOCR-VL and needs no OCR key.",
        elevenLabsEnabled: "Enable ElevenLabs Text-to-Speech",
        elevenLabsEnabledDesc: "When enabled, video export uses ElevenLabs instead of edge-tts for narration audio, providing more natural voice quality",
        elevenLabsApiKey: "ElevenLabs API Key", elevenLabsApiKeyPlaceholder: "Enter ElevenLabs API Key",
        elevenLabsApiKeyDesc: "Leave empty to keep current setting. Get your API key from the ElevenLabs dashboard",
        applyLink: ", click here to apply",
        textModelSource: "Text Model Provider Format", textModelSourceDesc: "Select the provider format for text generation", textModelSourcePlaceholder: "-- Select --",
        imageModelSource: "Image Model Provider Format", imageModelSourceDesc: "Select the provider format for image generation", imageModelSourcePlaceholder: "-- Select --",
        imageCaptionModelSource: "Image Caption Model Provider Format", imageCaptionModelSourceDesc: "Select the provider format for image captioning", imageCaptionModelSourcePlaceholder: "-- Select --",
        vendorApiKey: "{{vendor}} API Key", vendorApiKeyPlaceholder: "Enter {{vendor}} API Key",
        vendorApiKeyDesc: "Leave empty to keep current setting, enter new value to update",
        vendorApiKeySet: "Set (length: {{length}})",
        selectPlaceholder: "-- Select --",
        modelProvider: "Provider", modelProviderDesc: "Select an independent provider for this model, leave empty to use default config",
        modelProviderPlaceholder: "-- Use default config --",
        perModelApiBaseUrl: "API Base URL", perModelApiBaseUrlPlaceholder: "Leave empty to use default Base URL",
        perModelApiKey: "API Key", perModelApiKeyPlaceholder: "Enter API Key",
        perModelApiKeyDesc: "Leave empty to keep current setting",
        perModelApiKeySet: "Set (length: {{length}})",
        imageApiProtocol: "Image API Protocol",
        imageApiProtocolDesc: "Select the API path for image generation. Auto detects by model name, or force a specific path",
        imageApiProtocolAuto: "Auto detect",
        imageApiProtocolImages: "images.generate",
        imageApiProtocolChat: "chat.completions",
      },
      apiKeyHelp: {
        title: "How to get an API key",
        step1: "Open {{link}}, then enter the console",
        step2: "Go to the API keys page in OpenAI Platform",
        step3: "Click \"Create new secret key\" to generate a new API key",
        step4: "Copy the generated API key and paste it into this page",
        linkLabel: "Open OpenAI Platform →",
        copyLink: "Copy link",
      },
      apiKeyTip: { before: "For API key mode, create and manage keys in ", linkLabel: "OpenAI Platform", after: "" },
      exportPath: {
        label: "Export Path",
        description: "Downloaded export files are saved here directly. After restarting the app, backend export generation will also use this folder.",
        desktopOnly: "Export path settings are only available in the desktop app",
        notSet: "Export path not loaded",
      },
      serviceTest: {
        title: "Service Test", description: "Verify key service configurations before use to avoid issues.",
        tip: "Tip: Image generation tests may take several minutes depending on the model, please be patient.",
        startTest: "Start Test", testing: "Testing...", testTimeout: "Test timeout, please retry", testFailed: "Test failed",
        tests: {
          baiduOcr: { title: "OCR Service", description: "Recognize text in a test image with built-in PaddleOCR-VL" },
          textModel: { title: "Text Generation Model", description: "Send short prompt to verify text model and API configuration" },
          captionModel: { title: "Image Caption Model", description: "Generate test image and request model to output description" },
          baiduInpaint: { title: "Baidu Inpaint Service", description: "Use a test image to verify the Baidu image repair key" },
          imageModel: { title: "Image Generation Model", description: "Generate presentation background from test image (fixed resolution, may take 20-40 seconds)" },
          mineruPdf: { title: "Paddle PDF Parsing", description: "Parse a test PDF with built-in PaddleOCR-VL (may take 30-60 seconds)" }
        },
        results: {
          recognizedText: "Recognized: {{text}}", modelReply: "Model reply: {{reply}}",
          captionDesc: "Caption: {{caption}}", imageSize: "Output size: {{width}}x{{height}}",
          parsePreview: "Parse preview: {{preview}}"
        }
      },
      actions: { save: "Save Settings", saving: "Saving...", resetToDefault: "Reset to Default", openDataDir: "Open Data Folder", chooseExportDir: "Choose Export Path", openExportDir: "Open Export Path" },
      messages: {
        loadFailed: "Failed to load settings", saveSuccess: "Settings saved successfully", saveFailed: "Failed to save settings",
        resetConfirm: "This will reset all configurations (LLM, image generation, concurrency, etc.) to environment defaults. Custom settings will be lost. Continue?",
        resetTitle: "Confirm Reset to Default", resetSuccess: "Settings reset successfully", resetFailed: "Failed to reset settings",
        testServiceTip: "It's recommended to test services at the bottom of this page to verify configurations",
        resetConfirmBtn: "Confirm Reset", resetCancelBtn: "Cancel", unknownError: "Unknown error",
        exportDirUpdated: "Export path updated",
        testSuccess: "Test passed"
      }
    }
  }
};
import { Button, Input, Card, Loading, Modal, useToast, useConfirm } from '@/components/shared';
import * as api from '@/api/endpoints';
import type { OutputLanguage } from '@/api/endpoints';
import { OUTPUT_LANGUAGE_OPTIONS } from '@/api/endpoints';
import type { Settings as SettingsType } from '@/types';

// 配置项类型定义
type FieldType = 'text' | 'password' | 'number' | 'select' | 'buttons' | 'switch';

interface FieldConfig {
  key: keyof typeof initialFormData;
  label: string;
  type: FieldType;
  placeholder?: string;
  description?: string;
  sensitiveField?: boolean;  // 是否为敏感字段（如 API Key）
  lengthKey?: keyof SettingsType;  // 用于显示已有长度的 key（如 api_key_length）
  options?: { value: string; label: string }[];  // select 类型的选项
  min?: number;
  max?: number;
  link?: string;  // 申请链接 URL
}

interface SectionConfig {
  title: string;
  icon: React.ReactNode;
  fields: FieldConfig[];
}

type TestStatus = 'idle' | 'loading' | 'success' | 'error';

interface ServiceTestState {
  status: TestStatus;
  message?: string;
  detail?: string;
}

const OPENAI_PLATFORM_URL = 'https://platform.openai.com/api-keys';
// LazyLLM 支持的厂商列表
const LAZYLLM_SOURCES = [
  { value: 'qwen', label: 'Qwen (通义千问)' },
  { value: 'doubao', label: 'Doubao (豆包)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'glm', label: 'GLM (智谱)' },
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'sensenova', label: 'SenseNova (商汤)' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'kimi', label: 'Kimi' },
];

// 所有可用的提供商选项（Gemini/OpenAI/Codex + LazyLLM 厂商）
const ALL_PROVIDER_SOURCES = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'codex', label: 'Codex (OpenAI OAuth)' },
  ...LAZYLLM_SOURCES.filter(s => s.value !== 'openai'), // avoid duplicate 'openai'
];

// 需要 API Key + Base URL 的提供商（非 LazyLLM 厂商）
const API_KEY_PROVIDERS = new Set(['gemini', 'openai']);

// LazyLLM 厂商名集合
const LAZYLLM_VENDOR_SET = new Set(LAZYLLM_SOURCES.map(s => s.value));

// 初始表单数据
const initialFormData = {
  ai_provider_format: 'gemini' as string,
  api_base_url: '',
  api_key: '',
  text_model: '',
  image_model: '',
  image_caption_model: '',
  mineru_api_base: '',
  mineru_token: '',
  image_resolution: '2K',
  max_description_workers: 5,
  max_image_workers: 8,
  output_language: 'zh' as OutputLanguage,
  // 推理模式配置（分别控制文本和图像）
  enable_text_reasoning: false,
  text_thinking_budget: 1024,
  enable_image_reasoning: false,
  image_thinking_budget: 1024,
  baidu_api_key: '',
  // LazyLLM 配置
  text_model_source: '',
  image_model_source: '',
  image_caption_model_source: '',
  lazyllm_api_keys: {} as Record<string, string>,
  // Per-model API credentials (for gemini/openai per-model overrides)
  text_api_key: '',
  text_api_base_url: '',
  image_api_key: '',
  image_api_base_url: '',
  image_caption_api_key: '',
  image_caption_api_base_url: '',
  openai_image_api_protocol: 'auto',
  // ElevenLabs TTS
  elevenlabs_api_key: '',
};

const isLazyllmVendor = (vendor: string) =>
  LAZYLLM_VENDOR_SET.has(vendor) && vendor !== 'openai';

// When backend returns "lazyllm", infer specific vendor from configured keys
const resolveLazyllmVendor = (format: string, keysInfo?: Record<string, number>): string => {
  if (format !== 'lazyllm') return format;
  if (keysInfo) {
    const vendor = LAZYLLM_SOURCES.find(s => isLazyllmVendor(s.value) && keysInfo[s.value]);
    if (vendor) return vendor.value;
  }
  return LAZYLLM_SOURCES.find(s => isLazyllmVendor(s.value))?.value || 'deepseek';
};

const GlobalVendorKeyInput: React.FC<{
  vendor: string; formData: typeof initialFormData;
  setFormData: React.Dispatch<React.SetStateAction<typeof initialFormData>>;
  settings: SettingsType | null; t: ReturnType<typeof useT>;
}> = ({ vendor, formData, setFormData, settings, t }) => {
  const vendorLabel = LAZYLLM_SOURCES.find(s => s.value === vendor)?.label || vendor.toUpperCase();
  const keyLength = settings?.lazyllm_api_keys_info?.[vendor] || 0;
  const placeholder = keyLength > 0
    ? t('settings.fields.vendorApiKeySet', { length: keyLength })
    : t('settings.fields.vendorApiKeyPlaceholder', { vendor: vendorLabel });
  return (
    <div className="pl-3 border-l-2 border-cyan-200 dark:border-cyan-700">
      <Input
        label={t('settings.fields.vendorApiKey', { vendor: vendorLabel })}
        type="password"
        placeholder={placeholder}
        value={formData.lazyllm_api_keys[vendor] || ''}
        onChange={(e) => {
          setFormData(prev => ({
            ...prev,
            lazyllm_api_keys: { ...prev.lazyllm_api_keys, [vendor]: e.target.value }
          }));
        }}
      />
      <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{t('settings.fields.vendorApiKeyDesc')}</p>
    </div>
  );
};

const formDataFromSettings = (data: SettingsType): typeof initialFormData => ({
  ai_provider_format: resolveLazyllmVendor(data.ai_provider_format || 'gemini', data.lazyllm_api_keys_info),
  api_base_url: data.api_base_url || '',
  api_key: '',
  image_resolution: data.image_resolution || '2K',
  max_description_workers: data.max_description_workers || 5,
  max_image_workers: data.max_image_workers || 8,
  text_model: data.text_model || '',
  image_model: data.image_model || '',
  mineru_api_base: data.mineru_api_base || '',
  mineru_token: '',
  image_caption_model: data.image_caption_model || '',
  output_language: data.output_language || 'zh',
  enable_text_reasoning: data.enable_text_reasoning || false,
  text_thinking_budget: data.text_thinking_budget || 1024,
  enable_image_reasoning: data.enable_image_reasoning || false,
  image_thinking_budget: data.image_thinking_budget || 1024,
  baidu_api_key: '',
  text_model_source: data.text_model_source || '',
  image_model_source: data.image_model_source || '',
  image_caption_model_source: data.image_caption_model_source || '',
  lazyllm_api_keys: {},
  text_api_key: '',
  text_api_base_url: data.text_api_base_url || '',
  image_api_key: '',
  image_api_base_url: data.image_api_base_url || '',
  image_caption_api_key: '',
  image_caption_api_base_url: data.image_caption_api_base_url || '',
  openai_image_api_protocol: data.openai_image_api_protocol || 'auto',
  elevenlabs_api_key: '',
});

const settingsPayloadFromResponse = (response: unknown): SettingsType | null => {
  if (!response || typeof response !== 'object') return null;
  const wrappedData = (response as { data?: SettingsType }).data;
  if (wrappedData) return wrappedData;
  if ('ai_provider_format' in response) return response as SettingsType;
  return null;
};

// Settings 组件 - 纯嵌入模式（可复用）
export const Settings: React.FC = () => {
  const t = useT(settingsI18n);
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    show({ message: '链接已复制到剪贴板', type: 'success' });
  };

  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [serviceTestStates, setServiceTestStates] = useState<Record<string, ServiceTestState>>({});
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [manualCallbackUrl, setManualCallbackUrl] = useState('');
  const [manualCallbackOpen, setManualCallbackOpen] = useState(false);
  const [lastOAuthAuthUrl, setLastOAuthAuthUrl] = useState('');
  const [manualCallbackSubmitting, setManualCallbackSubmitting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [openAIModels, setOpenAIModels] = useState<string[]>([]);
  const [openAITextModels, setOpenAITextModels] = useState<string[]>([]);
  const [openAIImageModels, setOpenAIImageModels] = useState<string[]>([]);
  const [openAIModelsLoading, setOpenAIModelsLoading] = useState(false);
  const [exportDir, setExportDir] = useState('');

  const refreshOpenAIModels = async (connected: boolean) => {
    if (!connected) {
      setOpenAIModels([]);
      setOpenAITextModels([]);
      setOpenAIImageModels([]);
      return;
    }

    setOpenAIModelsLoading(true);
    try {
      const modelsResp = await api.getOpenAIOAuthModels();
      const allModels = modelsResp.data?.models || [];
      setOpenAIModels(allModels);
      setOpenAITextModels(modelsResp.data?.text_models || allModels.filter((model) => !model.includes('image')));
      setOpenAIImageModels(modelsResp.data?.image_models || allModels.filter((model) => model.includes('image')));
    } catch {
      setOpenAIModels([]);
      setOpenAITextModels([]);
      setOpenAIImageModels([]);
    } finally {
      setOpenAIModelsLoading(false);
    }
  };

  const handleOAuthAuthorize = async () => {
    setOauthConnecting(true);
    try {
      const resp = await api.getOpenAIOAuthUrl();
      if (resp.success && resp.data?.auth_url) {
        setLastOAuthAuthUrl(resp.data.auth_url);
        if (resp.data.callback_server_available === false) {
          setManualCallbackOpen(true);
          show({ message: t('settings.openaiOAuth.callbackPortBusy'), type: 'warning' });
        }
        const popup = window.open(resp.data.auth_url, 'openai-oauth', 'width=600,height=700');
        if (!popup) {
          setOauthConnecting(false);
          setManualCallbackOpen(true);
          return;
        }
        const onMessage = async (event: MessageEvent) => {
          if (event.data?.type === 'openai-oauth-callback') {
            window.removeEventListener('message', onMessage);
            setOauthConnecting(false);
            if (event.data.success) {
              const statusResp = await api.getOpenAIOAuthStatus();
              if (statusResp.success && statusResp.data) {
                setSettings(prev => prev ? {
                  ...prev,
                  openai_oauth_connected: statusResp.data!.connected,
                  openai_oauth_account_id: statusResp.data!.account_id || undefined,
                } : prev);
                await refreshOpenAIModels(statusResp.data.connected);
              }
            } else {
              show({ message: t('settings.openaiOAuth.connectFailed'), type: 'error' });
            }
          }
        };
        window.addEventListener('message', onMessage);
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            setOauthConnecting(false);
            window.removeEventListener('message', onMessage);
          }
        }, 1000);
      }
    } catch {
      setOauthConnecting(false);
      show({ message: t('settings.openaiOAuth.connectFailed'), type: 'error' });
    }
  };

  const handleOAuthDisconnect = async () => {
    try {
      const resp = await api.disconnectOpenAIOAuth();
      if (resp.success) {
        setSettings(prev => prev ? {
          ...prev,
          openai_oauth_connected: false,
          openai_oauth_account_id: undefined,
        } : prev);
        setOpenAIModels([]);
        setOpenAITextModels([]);
        setOpenAIImageModels([]);
        show({ message: t('settings.openaiOAuth.disconnectSuccess'), type: 'success' });
      }
    } catch {
      show({ message: t('settings.openaiOAuth.disconnectFailed'), type: 'error' });
    }
  };

  const handleManualCallback = async () => {
    if (!manualCallbackUrl.trim()) return;
    setManualCallbackSubmitting(true);
    try {
      const resp = await api.submitOAuthManualCallback(manualCallbackUrl.trim());
      if (resp.success) {
        setManualCallbackUrl('');
        setManualCallbackOpen(false);
        const statusResp = await api.getOpenAIOAuthStatus();
        if (statusResp.success && statusResp.data) {
          setSettings(prev => prev ? {
            ...prev,
            openai_oauth_connected: statusResp.data!.connected,
            openai_oauth_account_id: statusResp.data!.account_id || undefined,
          } : prev);
          await refreshOpenAIModels(statusResp.data.connected);
        }
        show({ message: t('settings.openaiOAuth.manualCallbackSuccess'), type: 'success' });
      } else {
        show({ message: t('settings.openaiOAuth.connectFailed'), type: 'error' });
      }
    } catch {
      show({ message: t('settings.openaiOAuth.connectFailed'), type: 'error' });
    } finally {
      setManualCallbackSubmitting(false);
    }
  };

  const handleApplyOpenAIRecommended = () => {
    const provider = settings?.openai_oauth_connected ? 'codex' : 'openai';
    const textModel = openAITextModels[0] || openAIModels.find((model) => !model.includes('image')) || 'gpt-5.5';
    const imageModel = openAIImageModels[0] || openAIModels.find((model) => model.includes('image')) || 'gpt-image-2';
    const captionModel = openAITextModels.find((model) => /mini|nano|4o/i.test(model)) || textModel;

    setFormData(prev => ({
      ...prev,
      ai_provider_format: provider,
      text_model_source: provider,
      image_model_source: provider,
      image_caption_model_source: provider,
      text_model: textModel,
      image_model: imageModel,
      image_caption_model: captionModel,
      openai_image_api_protocol: provider === 'openai' ? 'images' : prev.openai_image_api_protocol,
    }));
    show({ message: t('settings.openaiOAuth.recommendedApplied'), type: 'success' });
  };

  // 配置驱动的表单区块定义（使用翻译）
  const settingsSections: SectionConfig[] = [
    // Global API config & Model config are rendered separately above
    {
      title: t('settings.sections.mineruConfig'),
      icon: <FileText size={20} />,
      fields: [
        {
          key: 'mineru_api_base',
          label: t('settings.fields.mineruApiBase'),
          type: 'text',
          placeholder: t('settings.fields.mineruApiBasePlaceholder'),
          description: t('settings.fields.mineruApiBaseDesc'),
        },
        {
          key: 'mineru_token',
          label: t('settings.fields.mineruToken'),
          type: 'password',
          placeholder: t('settings.fields.mineruTokenPlaceholder'),
          sensitiveField: true,
          lengthKey: 'mineru_token_length',
          description: t('settings.fields.mineruTokenDesc'),
          link: 'https://mineru.net/apiManage/token',
        },
      ],
    },
    {
      title: t('settings.sections.imageConfig'),
      icon: <Image size={20} />,
      fields: [
        {
          key: 'image_resolution',
          label: t('settings.fields.imageResolution'),
          type: 'select',
          description: t('settings.fields.imageResolutionDesc'),
          options: [
            { value: '1K', label: '1K (1024px)' },
            { value: '2K', label: '2K (2048px)' },
            { value: '4K', label: '4K (4096px)' },
          ],
        },
      ],
    },
    {
      title: t('settings.sections.performanceConfig'),
      icon: <Zap size={20} />,
      fields: [
        {
          key: 'max_description_workers',
          label: t('settings.fields.maxDescriptionWorkers'),
          type: 'number',
          min: 1,
          max: 20,
          description: t('settings.fields.maxDescriptionWorkersDesc'),
        },
        {
          key: 'max_image_workers',
          label: t('settings.fields.maxImageWorkers'),
          type: 'number',
          min: 1,
          max: 20,
          description: t('settings.fields.maxImageWorkersDesc'),
        },
      ],
    },
    {
      title: t('settings.sections.outputLanguage'),
      icon: <Globe size={20} />,
      fields: [
        {
          key: 'output_language',
          label: t('settings.fields.defaultOutputLanguage'),
          type: 'buttons',
          description: t('settings.fields.defaultOutputLanguageDesc'),
          options: OUTPUT_LANGUAGE_OPTIONS,
        },
      ],
    },
    {
      title: t('settings.sections.textReasoning'),
      icon: <Brain size={20} />,
      fields: [
        {
          key: 'enable_text_reasoning',
          label: t('settings.fields.enableTextReasoning'),
          type: 'switch',
          description: t('settings.fields.enableTextReasoningDesc'),
        },
        {
          key: 'text_thinking_budget',
          label: t('settings.fields.textThinkingBudget'),
          type: 'number',
          min: 1,
          max: 8192,
          description: t('settings.fields.textThinkingBudgetDesc'),
        },
      ],
    },
    {
      title: t('settings.sections.imageReasoning'),
      icon: <Brain size={20} />,
      fields: [
        {
          key: 'enable_image_reasoning',
          label: t('settings.fields.enableImageReasoning'),
          type: 'switch',
          description: t('settings.fields.enableImageReasoningDesc'),
        },
        {
          key: 'image_thinking_budget',
          label: t('settings.fields.imageThinkingBudget'),
          type: 'number',
          min: 1,
          max: 8192,
          description: t('settings.fields.imageThinkingBudgetDesc'),
        },
      ],
    },
    {
      title: t('settings.sections.baiduOcr'),
      icon: <FileText size={20} />,
      fields: [
        {
          key: 'baidu_api_key',
          label: t('settings.fields.baiduOcrApiKey'),
          type: 'password',
          placeholder: t('settings.fields.baiduOcrApiKeyPlaceholder'),
          sensitiveField: true,
          lengthKey: 'baidu_api_key_length',
          description: t('settings.fields.baiduOcrApiKeyDesc'),
          link: 'https://cloud.baidu.com/',
        },
      ],
    },
    {
      title: t('settings.sections.elevenlabs'),
      icon: <Volume2 size={20} />,
      fields: [
        {
          key: 'elevenlabs_api_key',
          label: t('settings.fields.elevenLabsApiKey'),
          type: 'password',
          placeholder: t('settings.fields.elevenLabsApiKeyPlaceholder'),
          sensitiveField: true,
          lengthKey: 'elevenlabs_api_key_length',
          description: t('settings.fields.elevenLabsApiKeyDesc'),
          link: 'https://elevenlabs.io/app/settings/api-keys',
        },
      ],
    },
  ];

  useEffect(() => {
    loadSettings();
    loadExportDir();
  }, []);

  const loadExportDir = async () => {
    if (!window.electronAPI?.getExportDir) return;
    const dir = await window.electronAPI.getExportDir();
    setExportDir(dir);
  };

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await api.getSettings();
      const loadedSettings = settingsPayloadFromResponse(response);
      if (loadedSettings) {
        setSettings(loadedSettings);
        setFormData(formDataFromSettings(loadedSettings));
        sessionStorage.setItem('easyslide-settings', JSON.stringify(loadedSettings));
        await refreshOpenAIModels(Boolean(loadedSettings.openai_oauth_connected));
      }
    } catch {
      const cachedSettings = sessionStorage.getItem('easyslide-settings');
      if (cachedSettings) {
        try {
          const parsedSettings = JSON.parse(cachedSettings);
          setSettings(parsedSettings);
          setFormData(formDataFromSettings(parsedSettings));
          await refreshOpenAIModels(Boolean(parsedSettings.openai_oauth_connected));
        } catch {
          sessionStorage.removeItem('easyslide-settings');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const markOpenAIOAuthDisconnected = () => {
    setOpenAIModels([]);
    setSettings(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        openai_oauth_connected: false,
        openai_oauth_account_id: undefined,
      };
      sessionStorage.setItem('easyslide-settings', JSON.stringify(next));
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const {
        api_key, mineru_token, baidu_api_key, elevenlabs_api_key, lazyllm_api_keys,
        text_api_key, image_api_key, image_caption_api_key,
        ...otherData
      } = formData;
      const payload: Parameters<typeof api.updateSettings>[0] = {
        ...otherData,
        ai_provider_format: otherData.ai_provider_format,
      };

      // Only send sensitive fields if user entered a new value
      if (api_key) payload.api_key = api_key;
      if (mineru_token) payload.mineru_token = mineru_token;
      if (baidu_api_key) payload.baidu_api_key = baidu_api_key;
      if (elevenlabs_api_key) payload.elevenlabs_api_key = elevenlabs_api_key;
      if (text_api_key) payload.text_api_key = text_api_key;
      if (image_api_key) payload.image_api_key = image_api_key;
      if (image_caption_api_key) payload.image_caption_api_key = image_caption_api_key;

      // Send lazyllm API keys (only non-empty values)
      const nonEmptyKeys = Object.fromEntries(
        Object.entries(lazyllm_api_keys).filter(([, v]) => v)
      );
      if (Object.keys(nonEmptyKeys).length > 0) {
        payload.lazyllm_api_keys = nonEmptyKeys;
      }

      const response = await api.updateSettings(payload);
      const savedSettings = settingsPayloadFromResponse(response);
      if (savedSettings) {
        setSettings(savedSettings);
        sessionStorage.setItem('easyslide-settings', JSON.stringify(savedSettings));
        show({ message: t('settings.messages.saveSuccess'), type: 'success' });
        show({ message: t('settings.messages.testServiceTip'), type: 'info' });
        // Clear all sensitive fields after save
        setFormData(prev => ({
          ...prev,
          api_key: '', mineru_token: '', baidu_api_key: '', elevenlabs_api_key: '',
          lazyllm_api_keys: {},
          text_api_key: '', image_api_key: '', image_caption_api_key: '',
        }));
      }
    } catch (error: any) {
      console.error('保存设置失败:', error);
      show({
        message: t('settings.messages.saveFailed') + ': ' + (error?.response?.data?.error?.message || error?.message || t('settings.messages.unknownError')),
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    confirm(
      t('settings.messages.resetConfirm'),
      async () => {
        setIsSaving(true);
        try {
          const response = await api.resetSettings();
          const resetSettings = settingsPayloadFromResponse(response);
          if (resetSettings) {
            setSettings(resetSettings);
            setFormData(formDataFromSettings(resetSettings));
            show({ message: t('settings.messages.resetSuccess'), type: 'success' });
          }
        } catch (error: any) {
          console.error('重置设置失败:', error);
          show({
            message: t('settings.messages.resetFailed') + ': ' + (error?.message || t('settings.messages.unknownError')),
            type: 'error'
          });
        } finally {
          setIsSaving(false);
        }
      },
      {
        title: t('settings.messages.resetTitle'),
        confirmText: t('settings.messages.resetConfirmBtn'),
        cancelText: t('settings.messages.resetCancelBtn'),
        variant: 'warning',
      }
    );
  };

  const handleOpenDataDir = async () => {
    if (!window.electronAPI?.openDataDir) {
      show({ message: `${t('settings.actions.openDataDir')}仅桌面版可用`, type: 'info' });
      return;
    }
    await window.electronAPI.openDataDir();
  };

  const handleChooseExportDir = async () => {
    if (!window.electronAPI?.chooseExportDir) {
      show({ message: t('settings.exportPath.desktopOnly'), type: 'info' });
      return;
    }
    const dir = await window.electronAPI.chooseExportDir();
    setExportDir(dir);
    show({ message: t('settings.messages.exportDirUpdated'), type: 'success' });
  };

  const handleOpenExportDir = async () => {
    if (!window.electronAPI?.openExportDir) {
      show({ message: t('settings.exportPath.desktopOnly'), type: 'info' });
      return;
    }
    await window.electronAPI.openExportDir();
  };

  const handleFieldChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const updateServiceTest = (key: string, nextState: ServiceTestState) => {
    setServiceTestStates(prev => ({ ...prev, [key]: nextState }));
  };

  const handleServiceTest = async (
    key: string,
    action: (settings?: any) => Promise<any>,
    formatDetail: (data: any) => string
  ) => {
    updateServiceTest(key, { status: 'loading' });
    try {
      // 准备测试时要使用的设置（包括未保存的修改）
      const testSettings: any = {};

      // 只传递用户已填写的非空值
      if (formData.api_key) testSettings.api_key = formData.api_key;
      if (formData.api_base_url) testSettings.api_base_url = formData.api_base_url;
      if (formData.ai_provider_format) {
        testSettings.ai_provider_format = formData.ai_provider_format;
      }
      if (formData.text_model) testSettings.text_model = formData.text_model;
      if (formData.image_model) testSettings.image_model = formData.image_model;
      if (formData.image_caption_model) testSettings.image_caption_model = formData.image_caption_model;
      if (formData.mineru_api_base) testSettings.mineru_api_base = formData.mineru_api_base;
      if (formData.mineru_token) testSettings.mineru_token = formData.mineru_token;
      if (formData.baidu_api_key) testSettings.baidu_api_key = formData.baidu_api_key;
      if (formData.image_resolution) testSettings.image_resolution = formData.image_resolution;

      // Per-model provider source overrides (always send, even empty, to clear saved values)
      testSettings.text_model_source = formData.text_model_source || '';
      testSettings.image_model_source = formData.image_model_source || '';
      testSettings.image_caption_model_source = formData.image_caption_model_source || '';

      // Per-model API credentials
      if (formData.text_api_key) testSettings.text_api_key = formData.text_api_key;
      if (formData.text_api_base_url) testSettings.text_api_base_url = formData.text_api_base_url;
      if (formData.image_api_key) testSettings.image_api_key = formData.image_api_key;
      if (formData.image_api_base_url) testSettings.image_api_base_url = formData.image_api_base_url;
      if (formData.image_caption_api_key) testSettings.image_caption_api_key = formData.image_caption_api_key;
      if (formData.image_caption_api_base_url) testSettings.image_caption_api_base_url = formData.image_caption_api_base_url;

      // 推理模式设置
      if (formData.enable_text_reasoning !== undefined) {
        testSettings.enable_text_reasoning = formData.enable_text_reasoning;
      }
      if (formData.text_thinking_budget !== undefined) {
        testSettings.text_thinking_budget = formData.text_thinking_budget;
      }
      if (formData.enable_image_reasoning !== undefined) {
        testSettings.enable_image_reasoning = formData.enable_image_reasoning;
      }
      if (formData.image_thinking_budget !== undefined) {
        testSettings.image_thinking_budget = formData.image_thinking_budget;
      }

      // 启动异步测试，获取任务ID
      const response = await action(testSettings);
      const taskId = response.data.task_id;

      // isActive tracks whether this test round is still pending — avoids stale closure
      let isActive = true;
      // eslint-disable-next-line prefer-const
      let pollInterval: ReturnType<typeof setInterval>;
      const finish = (nextState: ServiceTestState, toastMsg: string, toastType: 'success' | 'error') => {
        if (!isActive) return;
        isActive = false;
        clearInterval(pollInterval);
        updateServiceTest(key, nextState);
        show({ message: toastMsg, type: toastType });
      };

      // 开始轮询任务状态
      pollInterval = setInterval(async () => {
        try {
          const statusResponse = await api.getTestStatus(taskId);
          const statusData = statusResponse?.data;
          if (!statusData) {
            throw new Error(t('settings.serviceTest.testFailed'));
          }
          const taskStatus = statusData.status;

          if (taskStatus === 'COMPLETED') {
            const detail = formatDetail(statusData.result || {});
            const message = statusData.message || t('settings.messages.testSuccess');
            finish({ status: 'success', message, detail }, message, 'success');
          } else if (taskStatus === 'FAILED') {
            const errorMessage = statusData.error || t('settings.serviceTest.testFailed');
            if (statusData.openai_oauth_disconnected) {
              markOpenAIOAuthDisconnected();
            }
            finish({ status: 'error', message: errorMessage }, `${t('settings.serviceTest.testFailed')}: ${errorMessage}`, 'error');
          }
          // 如果是 PENDING 或 PROCESSING，继续轮询
        } catch (pollError: any) {
          const errorMessage = pollError?.response?.data?.error?.message || pollError?.message || t('settings.serviceTest.testFailed');
          finish({ status: 'error', message: errorMessage }, `${t('settings.serviceTest.testFailed')}: ${errorMessage}`, 'error');
        }
      }, 2000); // 每2秒轮询一次

      // 设置最大轮询时间（2分钟）
      setTimeout(() => {
        finish({ status: 'error', message: t('settings.serviceTest.testTimeout') }, t('settings.serviceTest.testTimeout'), 'error');
      }, 600000); // 10 分钟，覆盖 gpt-image-2 等慢模型的生成时间

    } catch (error: any) {
      const errorMessage = error?.response?.data?.error?.message || error?.message || t('common.unknownError');
      updateServiceTest(key, { status: 'error', message: errorMessage });
      show({ message: `${t('settings.serviceTest.testFailed')}: ${errorMessage}`, type: 'error' });
    }
  };

  const renderField = (field: FieldConfig) => {
    const value = formData[field.key] as string | number | boolean;

    if (field.type === 'buttons' && field.options) {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
            {field.label}
          </label>
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleFieldChange(field.key, option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  value === option.value
                    ? option.value === 'openai'
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                      : option.value === 'lazyllm'
                        ? 'bg-gradient-to-r from-sky-500 to-cyan-600 text-white shadow-md'
                        : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md'
                    : 'bg-white dark:bg-background-secondary border border-gray-200 dark:border-border-primary text-gray-700 dark:text-foreground-secondary hover:bg-gray-50 dark:hover:bg-background-hover hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {field.description && (
            <p className="mt-1 text-xs text-gray-500 dark:text-foreground-tertiary">{field.description}</p>
          )}
        </div>
      );
    }

    if (field.type === 'select' && field.options) {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
            {field.label}
          </label>
          <select
            value={value as string}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            {!(value as string) && (
              <option value="" disabled>
                {field.placeholder || t('settings.fields.selectPlaceholder')}
              </option>
            )}
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {field.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{field.description}</p>
          )}
        </div>
      );
    }

    // switch 类型 - 开关切换
    if (field.type === 'switch') {
      const isEnabled = Boolean(value);
      return (
        <div key={field.key}>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary">
              {field.label}
            </label>
            <button
              type="button"
              onClick={() => handleFieldChange(field.key, !isEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 ${
                isEnabled ? 'bg-cyan-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-background-secondary transition-transform ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {field.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{field.description}</p>
          )}
        </div>
      );
    }

    // text, password, number 类型
    const placeholder = field.sensitiveField && settings && field.lengthKey && (settings[field.lengthKey] as number) > 0
      ? t('settings.fields.apiKeySet', { length: settings[field.lengthKey] as string | number })
      : field.placeholder || '';

    // 判断是否禁用（思考负载字段在对应开关关闭时禁用）
    let isDisabled = false;
    if (field.key === 'text_thinking_budget') {
      isDisabled = !formData.enable_text_reasoning;
    } else if (field.key === 'image_thinking_budget') {
      isDisabled = !formData.enable_image_reasoning;
    }

    return (
      <div key={field.key} className={isDisabled ? 'opacity-50' : ''}>
        <Input
          label={field.label}
          type={field.type === 'number' ? 'number' : field.type}
          placeholder={placeholder}
          value={value as string | number}
          onChange={(e) => {
            const newValue = field.type === 'number' 
              ? parseInt(e.target.value) || (field.min ?? 0)
              : e.target.value;
            handleFieldChange(field.key, newValue);
          }}
          min={field.min}
          max={field.max}
          disabled={isDisabled}
        />
        {(field.description || field.link) && (
          <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
            {field.description}
            {field.link && (
              <a href={field.link} target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline">{t('settings.fields.applyLink')}</a>
            )}
          </p>
        )}
      </div>
    );
  };

  // 模型配置项定义：每种模型类型的 key、source key、api key/base key、标签等
  const modelConfigItems = [
    {
      modelKey: 'text_model' as keyof typeof initialFormData,
      sourceKey: 'text_model_source' as keyof typeof initialFormData,
      apiKeyKey: 'text_api_key' as keyof typeof initialFormData,
      apiBaseKey: 'text_api_base_url' as keyof typeof initialFormData,
      apiKeyLengthKey: 'text_api_key_length' as keyof SettingsType,
      label: t('settings.fields.textModel'),
      placeholder: t('settings.fields.textModelPlaceholder'),
      description: t('settings.fields.textModelDesc'),
      sourceLabel: t('settings.fields.textModelSource'),
    },
    {
      modelKey: 'image_model' as keyof typeof initialFormData,
      sourceKey: 'image_model_source' as keyof typeof initialFormData,
      apiKeyKey: 'image_api_key' as keyof typeof initialFormData,
      apiBaseKey: 'image_api_base_url' as keyof typeof initialFormData,
      apiKeyLengthKey: 'image_api_key_length' as keyof SettingsType,
      label: t('settings.fields.imageModel'),
      placeholder: t('settings.fields.imageModelPlaceholder'),
      description: t('settings.fields.imageModelDesc'),
      sourceLabel: t('settings.fields.imageModelSource'),
    },
    {
      modelKey: 'image_caption_model' as keyof typeof initialFormData,
      sourceKey: 'image_caption_model_source' as keyof typeof initialFormData,
      apiKeyKey: 'image_caption_api_key' as keyof typeof initialFormData,
      apiBaseKey: 'image_caption_api_base_url' as keyof typeof initialFormData,
      apiKeyLengthKey: 'image_caption_api_key_length' as keyof SettingsType,
      label: t('settings.fields.imageCaptionModel'),
      placeholder: t('settings.fields.imageCaptionModelPlaceholder'),
      description: t('settings.fields.imageCaptionModelDesc'),
      sourceLabel: t('settings.fields.imageCaptionModelSource'),
    },
  ];

  // 渲染单个模型配置组（模型名 + 提供商选择 + 条件凭证）
  const renderModelConfigGroup = (item: typeof modelConfigItems[0]) => {
    const sourceValue = formData[item.sourceKey] as string;
    const isApiKeyProvider = API_KEY_PROVIDERS.has(sourceValue);
    const isLazyllm = sourceValue && isLazyllmVendor(sourceValue);
    // 'openai' in source dropdown means OpenAI format (API key provider), not lazyllm openai vendor
    // lazyllm openai vendor is handled separately

    return (
      <div key={item.modelKey} className="pb-6 border-b border-gray-200 dark:border-border-primary last:border-b-0 last:pb-0 space-y-3">
        {/* 模型名称 */}
        <Input
          label={item.label}
          type="text"
          placeholder={item.placeholder}
          value={formData[item.modelKey] as string}
          onChange={(e) => handleFieldChange(item.modelKey, e.target.value)}
        />
        {item.description && (
          <p className="-mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{item.description}</p>
        )}

        {/* 提供商选择 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
            {item.sourceLabel}
          </label>
          <select
            value={sourceValue}
            onChange={(e) => handleFieldChange(item.sourceKey, e.target.value)}
            className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="">{t('settings.fields.modelProviderPlaceholder')}</option>
            {ALL_PROVIDER_SOURCES.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.value === 'codex' && !settings?.openai_oauth_connected}
              >
                {option.label}{option.value === 'codex' && !settings?.openai_oauth_connected ? ` (${t('settings.openaiOAuth.disconnected')})` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
            {t('settings.fields.modelProviderDesc')}
          </p>
        </div>

        {/* Gemini/OpenAI 提供商：显示 API Base URL + API Key */}
        {isApiKeyProvider && (
          <div className="space-y-3 pl-3 border-l-2 border-cyan-300 dark:border-cyan-700">
            <Input
              label={t('settings.fields.perModelApiBaseUrl')}
              type="text"
              placeholder={t('settings.fields.perModelApiBaseUrlPlaceholder')}
              value={formData[item.apiBaseKey] as string}
              onChange={(e) => handleFieldChange(item.apiBaseKey, e.target.value)}
            />
            <div>
              <Input
                label={t('settings.fields.perModelApiKey')}
                type="password"
                placeholder={
                  settings && (settings[item.apiKeyLengthKey] as number) > 0
                    ? t('settings.fields.perModelApiKeySet', { length: settings[item.apiKeyLengthKey] as number })
                    : t('settings.fields.perModelApiKeyPlaceholder')
                }
                value={formData[item.apiKeyKey] as string}
                onChange={(e) => handleFieldChange(item.apiKeyKey, e.target.value)}
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
                {t('settings.fields.perModelApiKeyDesc')}
              </p>
            </div>
          </div>
        )}

        {/* Image API Protocol: for image model when effective provider is openai */}
        {item.sourceKey === 'image_model_source' && (sourceValue === 'openai' || (!sourceValue && formData.ai_provider_format === 'openai')) && (
          <div className="pl-3 border-l-2 border-cyan-300 dark:border-cyan-700">
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
              {t('settings.fields.imageApiProtocol')}
            </label>
            <select
              value={formData.openai_image_api_protocol}
              onChange={(e) => handleFieldChange('openai_image_api_protocol', e.target.value)}
              className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            >
              <option value="auto">{t('settings.fields.imageApiProtocolAuto')}</option>
              <option value="images">{t('settings.fields.imageApiProtocolImages')}</option>
              <option value="chat">{t('settings.fields.imageApiProtocolChat')}</option>
            </select>
            <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
              {t('settings.fields.imageApiProtocolDesc')}
            </p>
          </div>
        )}

        {/* LazyLLM 厂商：显示厂商 API Key */}
        {isLazyllm && (() => {
          const vendorLabel = LAZYLLM_SOURCES.find(s => s.value === sourceValue)?.label || sourceValue.toUpperCase();
          const keyLength = settings?.lazyllm_api_keys_info?.[sourceValue] || 0;
          const placeholder = keyLength > 0
            ? t('settings.fields.vendorApiKeySet', { length: keyLength })
            : t('settings.fields.vendorApiKeyPlaceholder', { vendor: vendorLabel });
          return (
            <div className="pl-3 border-l-2 border-cyan-200 dark:border-cyan-700">
              <Input
                label={t('settings.fields.vendorApiKey', { vendor: vendorLabel })}
                type="password"
                placeholder={placeholder}
                value={formData.lazyllm_api_keys[sourceValue] || ''}
                onChange={(e) => {
                  setFormData(prev => ({
                    ...prev,
                    lazyllm_api_keys: { ...prev.lazyllm_api_keys, [sourceValue]: e.target.value }
                  }));
                }}
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
                {t('settings.fields.vendorApiKeyDesc')}
              </p>
            </div>
          );
        })()}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loading message={t('common.loading')} />
      </div>
    );
  }

  return (
    <>
      <ToastContainer />
      {ConfirmDialog}
      <div className="space-y-10 pb-28">
        <div className="rounded-[1.75rem] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 md:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-sky-600 border border-sky-100 shadow-sm">
                <Sparkles size={14} />
                {t('settings.sections.aiProviderOpenAI')}
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-950 dark:text-foreground-primary">{t('settings.sections.apiConfig')}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-foreground-tertiary">
                {t('settings.sections.apiConfigDesc')} · {t('settings.openaiOAuth.description')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm">
                <div className="text-slate-400">{t('settings.fields.aiProviderFormat')}</div>
                <div className="mt-1 font-semibold text-slate-900 dark:text-foreground-primary">{formData.ai_provider_format || 'openai'}</div>
              </div>
              <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-sm">
                <div className="text-slate-400">{t('settings.openaiOAuth.title')}</div>
                <div className={settings?.openai_oauth_connected ? 'mt-1 font-semibold text-emerald-600' : 'mt-1 font-semibold text-slate-900 dark:text-foreground-primary'}>
                  {settings?.openai_oauth_connected ? t('settings.openaiOAuth.connected') : t('settings.openaiOAuth.disconnected')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm dark:bg-background-secondary dark:border-border-primary">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground-primary mb-2 flex items-center">
            <FolderOpen size={20} />
            <span className="ml-2">{t('settings.sections.exportConfig')}</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-foreground-tertiary mb-4">{t('settings.exportPath.description')}</p>
          <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 dark:border-border-primary dark:bg-background-primary">
            <div className="text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">{t('settings.exportPath.label')}</div>
            <div className="min-h-10 rounded-xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm break-all dark:bg-background-secondary dark:text-foreground-secondary">
              {exportDir || t('settings.exportPath.notSet')}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={<FolderOpen size={18} />}
                onClick={handleChooseExportDir}
              >
                {t('settings.actions.chooseExportDir')}
              </Button>
              <Button
                variant="secondary"
                icon={<FolderOpen size={18} />}
                onClick={handleOpenExportDir}
              >
                {t('settings.actions.openExportDir')}
              </Button>
            </div>
            {!window.electronAPI?.chooseExportDir && (
              <p className="mt-3 text-xs text-amber-600">{t('settings.exportPath.desktopOnly')}</p>
            )}
          </div>
        </div>

        <div data-testid="openai-primary-section" className="rounded-[2rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm dark:bg-background-secondary dark:border-border-primary">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground-primary mb-1 flex items-center">
            <Link2 size={20} className="text-emerald-500" />
            <span className="ml-2">{t('settings.openaiOAuth.title')}</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-foreground-tertiary mb-4">{t('settings.openaiOAuth.description')}</p>
          <div className="p-4 border border-sky-100 dark:border-border-primary rounded-2xl bg-gradient-to-br from-white to-sky-50/60 dark:from-background-secondary dark:to-background-tertiary">
            <div className="mb-4 grid gap-2 md:grid-cols-3">
              {[
                t('settings.openaiOAuth.setupConnect'),
                t('settings.openaiOAuth.setupRecommended'),
                t('settings.openaiOAuth.setupCreate'),
              ].map((label, index) => (
                <div key={label} className="flex items-center gap-2 rounded-2xl border border-sky-100 bg-white/80 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm dark:border-border-primary dark:bg-background-primary dark:text-foreground-secondary">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-600 dark:bg-sky-900/30 dark:text-sky-300">
                    {index + 1}
                  </span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${settings?.openai_oauth_connected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                <div>
                  <span className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">
                    {settings?.openai_oauth_connected ? t('settings.openaiOAuth.connected') : t('settings.openaiOAuth.disconnected')}
                  </span>
                  {settings?.openai_oauth_connected && settings?.openai_oauth_account_id && (
                    <span className="ml-2 text-sm text-gray-500 dark:text-foreground-tertiary">
                      ({settings.openai_oauth_account_id})
                    </span>
                  )}
                </div>
              </div>
              <div>
                {settings?.openai_oauth_connected ? (
                  <button
                    onClick={handleOAuthDisconnect}
                    className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    {t('settings.openaiOAuth.disconnectBtn')}
                  </button>
                ) : (
                  <button
                    onClick={handleOAuthAuthorize}
                    disabled={oauthConnecting}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {oauthConnecting ? t('settings.openaiOAuth.connecting') : t('settings.openaiOAuth.authorizeBtn')}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-foreground-tertiary">{t('settings.openaiOAuth.hint')}</p>
            {!settings?.openai_oauth_connected && (
              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs font-medium text-sky-700 dark:border-border-primary dark:bg-background-primary dark:text-sky-300">
                <Info size={14} />
                <span>{t('settings.openaiOAuth.connectFirst')}</span>
              </div>
            )}
            {!settings?.openai_oauth_connected && lastOAuthAuthUrl && (
              <div className="mt-3 rounded-2xl border border-cyan-100 bg-white/90 p-3 text-xs text-slate-600 shadow-sm dark:border-border-primary dark:bg-background-primary dark:text-foreground-secondary">
                <p className="mb-2 font-medium text-cyan-700 dark:text-cyan-300">
                  {t('settings.openaiOAuth.authLinkReady')}
                </p>
                <p className="mb-2 text-slate-500 dark:text-foreground-tertiary">
                  {t('settings.openaiOAuth.authRegionHint')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={lastOAuthAuthUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-cyan-600 px-3 py-1.5 font-semibold text-white transition hover:bg-cyan-700"
                  >
                    {t('settings.openaiOAuth.openAuthPage')}
                  </a>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(lastOAuthAuthUrl)}
                    className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1.5 font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-border-primary dark:bg-background-secondary dark:text-cyan-300"
                  >
                    {t('settings.openaiOAuth.copyAuthLink')}
                  </button>
                </div>
              </div>
            )}
            <div className="mt-3">
              <button
                type="button"
                onClick={handleApplyOpenAIRecommended}
                className="rounded-full border border-emerald-100 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 dark:bg-background-primary dark:border-border-primary dark:text-emerald-300"
              >
                {t('settings.openaiOAuth.applyRecommendedBtn')}
              </button>
            </div>
            {!settings?.openai_oauth_connected && (
              <div className="mt-3">
                <button
                  onClick={() => setManualCallbackOpen(v => !v)}
                  className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
                >
                  {t('settings.openaiOAuth.manualCallbackLabel')}
                </button>
                {manualCallbackOpen && (
                  <div className="mt-2 p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl">
                    <p className="text-xs text-sky-700 dark:text-sky-300 mb-2">{t('settings.openaiOAuth.manualCallbackHint')}</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualCallbackUrl}
                        onChange={(e) => setManualCallbackUrl(e.target.value)}
                        placeholder={t('settings.openaiOAuth.manualCallbackPlaceholder')}
                        className="flex-1 px-3 py-1.5 text-xs border border-gray-300 dark:border-border-primary rounded-md bg-white dark:bg-background-secondary text-gray-900 dark:text-foreground-primary placeholder-gray-400"
                      />
                      <button
                        onClick={handleManualCallback}
                        disabled={manualCallbackSubmitting || !manualCallbackUrl.trim()}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-white dark:text-gray-900 rounded-md hover:bg-slate-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50"
                      >
                        {t('settings.openaiOAuth.manualCallbackSubmit')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {settings?.openai_oauth_connected && (
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/80 p-4 dark:bg-background-primary dark:border-border-primary">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-foreground-primary">
                    {t('settings.openaiOAuth.availableModels')}
                  </h3>
                  {settings.openai_oauth_account_id && (
                    <span className="text-xs text-slate-400">{settings.openai_oauth_account_id}</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {openAIModelsLoading ? (
                    <span className="text-xs text-slate-500">{t('settings.openaiOAuth.loadingModels')}</span>
                  ) : openAIModels.length > 0 ? (
                    <div className="grid w-full gap-3 md:grid-cols-2">
                      {[
                        {
                          title: t('settings.openaiOAuth.textModels'),
                          models: openAITextModels.length > 0 ? openAITextModels : openAIModels.filter((model) => !model.includes('image')),
                        },
                        {
                          title: t('settings.openaiOAuth.imageModels'),
                          models: openAIImageModels.length > 0 ? openAIImageModels : openAIModels.filter((model) => model.includes('image')),
                        },
                      ].filter((group) => group.models.length > 0).map((group) => (
                        <div key={group.title} className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                          <div className="text-xs font-semibold text-emerald-800">{group.title}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {group.models.slice(0, 8).map((model) => (
                              <span key={model} className="rounded-full border border-emerald-100 bg-white px-3 py-1 text-xs font-medium text-emerald-700">
                                {model}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">{t('settings.openaiOAuth.noAvailableModels')}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 默认 API 配置区块 */}
        <div data-testid="global-api-config-section" className="rounded-3xl border border-slate-100 bg-white p-5 md:p-6 shadow-sm dark:bg-background-secondary dark:border-border-primary">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground-primary mb-1 flex items-center">
            <Key size={20} className="text-sky-500" />
            <span className="ml-2">{t('settings.sections.apiConfig')}</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-foreground-tertiary mb-4">{t('settings.sections.apiConfigDesc')}</p>
          <div className="space-y-4">
            {/* 提供商下拉 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
                {t('settings.fields.aiProviderFormat')}
              </label>
              <select
                value={formData.ai_provider_format}
                onChange={(e) => handleFieldChange('ai_provider_format', e.target.value)}
                className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                {ALL_PROVIDER_SOURCES.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.value === 'codex' && !settings?.openai_oauth_connected}
                  >
                    {option.label}{option.value === 'codex' && !settings?.openai_oauth_connected ? ` (${t('settings.openaiOAuth.disconnected')})` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{t('settings.fields.aiProviderFormatDesc')}</p>
            </div>

            {/* Gemini/OpenAI: API Base URL + API Key */}
            {API_KEY_PROVIDERS.has(formData.ai_provider_format) && (
              <div className="space-y-3 pl-3 border-l-2 border-cyan-300 dark:border-cyan-700">
                <Input
                  label={t('settings.fields.apiBaseUrl')}
                  type="text"
                  placeholder={t('settings.fields.apiBaseUrlPlaceholder')}
                  value={formData.api_base_url}
                  onChange={(e) => handleFieldChange('api_base_url', e.target.value)}
                />
                <p className="-mt-2 text-sm text-gray-500 dark:text-foreground-tertiary">{t('settings.fields.apiBaseUrlDesc')}</p>
                <div>
                  <Input
                    label={t('settings.fields.apiKey')}
                    type="password"
                    placeholder={
                      settings && (settings.api_key_length as number) > 0
                        ? t('settings.fields.apiKeySet', { length: settings.api_key_length })
                        : t('settings.fields.apiKeyPlaceholder')
                    }
                    value={formData.api_key}
                    onChange={(e) => handleFieldChange('api_key', e.target.value)}
                  />
                  <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{t('settings.fields.apiKeyDesc')}</p>
                </div>
              </div>
            )}

            {/* LazyLLM 厂商: 厂商 API Key */}
            {isLazyllmVendor(formData.ai_provider_format) && (
              <GlobalVendorKeyInput vendor={formData.ai_provider_format} formData={formData} setFormData={setFormData} settings={settings} t={t} />
            )}
          </div>

          {/* OpenAI API Key tip */}
          <div className="mt-3 pl-4 border-l-4 border-blue-300 dark:border-blue-600">
            <p className="text-sm text-gray-700 dark:text-foreground-secondary">
              {t('settings.apiKeyTip.before')}
              <a href={OPENAI_PLATFORM_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline font-medium">{t('settings.apiKeyTip.linkLabel')}</a>
              {t('settings.apiKeyTip.after')}
            </p>
          </div>

          {/* API Key 获取指南 */}
          <div className="mt-2 pl-4 border-l-4 border-blue-300 dark:border-blue-600">
            <p className="text-sm font-medium text-gray-800 dark:text-foreground-primary flex items-center gap-1.5 mb-2">
              <HelpCircle size={15} className="text-blue-500" />
              {t('settings.apiKeyHelp.title')}
            </p>
            <ol className="text-sm text-gray-700 dark:text-foreground-secondary space-y-1 list-decimal list-inside ml-1">
              <li>
                {t('settings.apiKeyHelp.step1', { link: '{{link}}' }).split('{{link}}')[0]}
                <span className="inline-flex items-center gap-2">
                  <a
                    href={OPENAI_PLATFORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline font-medium"
                  >
                    {t('settings.apiKeyHelp.linkLabel')}
                  </a>
                  <button
                    onClick={() => copyToClipboard(OPENAI_PLATFORM_URL)}
                    className="text-xs px-2 py-0.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded transition-colors"
                  >
                    {t('settings.apiKeyHelp.copyLink')}
                  </button>
                </span>
                {t('settings.apiKeyHelp.step1', { link: '{{link}}' }).split('{{link}}')[1]}
              </li>
              <li>{t('settings.apiKeyHelp.step2')}</li>
              <li>{t('settings.apiKeyHelp.step3')}</li>
              <li>{t('settings.apiKeyHelp.step4')}</li>
            </ol>
          </div>
        </div>

        {/* 模型配置区块 */}
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm dark:bg-background-secondary dark:border-border-primary">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground-primary mb-5 flex items-center">
            <FileText size={20} />
            <span className="ml-2">{t('settings.sections.modelConfig')}</span>
          </h2>
          <div className="space-y-5">
            {modelConfigItems.map(renderModelConfigGroup)}
          </div>
        </div>

        {/* 其余配置区块（配置驱动，排除性能配置和推理模式） */}
        <div className="space-y-10">
          {settingsSections.filter((section) =>
            section.title !== t('settings.sections.performanceConfig') &&
            section.title !== t('settings.sections.textReasoning') &&
            section.title !== t('settings.sections.imageReasoning')
          ).map((section) => (
            <div key={section.title} className="rounded-[2rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm dark:bg-background-secondary dark:border-border-primary">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground-primary mb-5 flex items-center">
                {section.icon}
                <span className="ml-2">{section.title}</span>
              </h2>
              <div className="space-y-5">
                {section.fields.map((field) => renderField(field))}
              </div>
            </div>
          ))}
        </div>

        {/* 高级设置（折叠区域） */}
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm dark:bg-background-secondary dark:border-border-primary">
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="w-full flex items-center justify-between px-0 py-3 text-left hover:opacity-80 transition-opacity"
          >
            <span className="text-lg font-semibold text-gray-900 dark:text-foreground-primary">
              {t('settings.sections.advancedSettings')}
            </span>
            <ChevronDown
              size={20}
              className={`text-gray-500 dark:text-foreground-tertiary transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {advancedOpen && (
            <div className="pb-4 space-y-8">
              {/* 并发性能配置 + 推理模式 */}
              {settingsSections.filter((section) =>
                section.title === t('settings.sections.performanceConfig') ||
                section.title === t('settings.sections.textReasoning') ||
                section.title === t('settings.sections.imageReasoning')
              ).map((section) => (
                <div key={section.title}>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground-primary mb-4 flex items-center">
                    {section.icon}
                    <span className="ml-2">{section.title}</span>
                  </h2>
                  <div className="space-y-5">
                    {section.fields.map((field) => renderField(field))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 服务测试区 */}
        <div className="space-y-5 rounded-[2rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm dark:bg-background-secondary dark:border-border-primary">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground-primary mb-2 flex items-center">
            <FileText size={20} />
            <span className="ml-2">{t('settings.serviceTest.title')}</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-foreground-tertiary">
            {t('settings.serviceTest.description')}
          </p>
          <div className="pl-4 border-l-4 border-sky-200 dark:border-sky-700">
            <p className="text-sm text-gray-700 dark:text-foreground-secondary">
              💡 {t('settings.serviceTest.tip')}
            </p>
          </div>
          <div className="space-y-5">
            {[
              {
                key: 'baidu-ocr',
                titleKey: 'settings.serviceTest.tests.baiduOcr.title',
                descriptionKey: 'settings.serviceTest.tests.baiduOcr.description',
                resultKey: 'settings.serviceTest.results.recognizedText',
                action: api.testBaiduOcr,
                formatDetail: (data: any) => (data?.recognized_text ? t('settings.serviceTest.results.recognizedText', { text: data.recognized_text }) : ''),
              },
              {
                key: 'text-model',
                titleKey: 'settings.serviceTest.tests.textModel.title',
                descriptionKey: 'settings.serviceTest.tests.textModel.description',
                resultKey: 'settings.serviceTest.results.modelReply',
                action: api.testTextModel,
                formatDetail: (data: any) => (data?.reply ? t('settings.serviceTest.results.modelReply', { reply: data.reply }) : ''),
              },
              {
                key: 'caption-model',
                titleKey: 'settings.serviceTest.tests.captionModel.title',
                descriptionKey: 'settings.serviceTest.tests.captionModel.description',
                resultKey: 'settings.serviceTest.results.captionDesc',
                action: api.testCaptionModel,
                formatDetail: (data: any) => (data?.caption ? t('settings.serviceTest.results.captionDesc', { caption: data.caption }) : ''),
              },
              {
                key: 'baidu-inpaint',
                titleKey: 'settings.serviceTest.tests.baiduInpaint.title',
                descriptionKey: 'settings.serviceTest.tests.baiduInpaint.description',
                resultKey: 'settings.serviceTest.results.imageSize',
                action: api.testBaiduInpaint,
                formatDetail: (data: any) => (data?.image_size ? t('settings.serviceTest.results.imageSize', { width: data.image_size[0], height: data.image_size[1] }) : ''),
              },
              {
                key: 'image-model',
                titleKey: 'settings.serviceTest.tests.imageModel.title',
                descriptionKey: 'settings.serviceTest.tests.imageModel.description',
                resultKey: 'settings.serviceTest.results.imageSize',
                action: api.testImageModel,
                formatDetail: (data: any) => (data?.image_size ? t('settings.serviceTest.results.imageSize', { width: data.image_size[0], height: data.image_size[1] }) : ''),
              },
              {
                key: 'mineru-pdf',
                titleKey: 'settings.serviceTest.tests.mineruPdf.title',
                descriptionKey: 'settings.serviceTest.tests.mineruPdf.description',
                resultKey: 'settings.serviceTest.results.parsePreview',
                action: api.testMineruPdf,
                formatDetail: (data: any) => (data?.content_preview ? t('settings.serviceTest.results.parsePreview', { preview: data.content_preview }) : data?.message || ''),
              },
            ].map((item) => {
              const testState = serviceTestStates[item.key] || { status: 'idle' as TestStatus };
              const isLoadingTest = testState.status === 'loading';
              return (
                <div
                  key={item.key}
                  className="py-4 border-b border-gray-200 dark:border-border-primary last:border-b-0 space-y-2"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-base font-semibold text-gray-800 dark:text-foreground-primary">{t(item.titleKey)}</div>
                      <div className="text-sm text-gray-500 dark:text-foreground-tertiary">{t(item.descriptionKey)}</div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={isLoadingTest}
                      onClick={() => handleServiceTest(item.key, item.action, item.formatDetail)}
                    >
                      {isLoadingTest ? t('settings.serviceTest.testing') : t('settings.serviceTest.startTest')}
                    </Button>
                  </div>
                  {testState.status === 'success' && (
                    <p className="text-sm text-green-600">
                      {testState.message}{testState.detail ? `｜${testState.detail}` : ''}
                    </p>
                  )}
                  {testState.status === 'error' && (
                    <p className="text-sm text-red-600">
                      {testState.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sky-100 bg-white/90 px-4 py-3 shadow-[0_-18px_45px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-border-primary dark:bg-background-primary/90">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                icon={<RotateCcw size={18} />}
                onClick={handleReset}
                disabled={isSaving}
              >
                {t('settings.actions.resetToDefault')}
              </Button>
              <Button
                variant="secondary"
                icon={<FolderOpen size={18} />}
                onClick={handleOpenDataDir}
              >
                {t('settings.actions.openDataDir')}
              </Button>
            </div>
            <Button
              variant="primary"
              icon={<Save size={18} />}
              onClick={handleSave}
              loading={isSaving}
            >
              {isSaving ? t('settings.actions.saving') : t('settings.actions.save')}
            </Button>
          </div>
        </div>

      </div>
    </>
  );
};

// SettingsPage 组件 - 完整页面包装
const SCROLL_SHOW_THRESHOLD = 300;

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT(settingsI18n);
  const [showTop, setShowTop] = useState(false);
  const hasInAppBackHistory = typeof window !== 'undefined' && typeof window.history.state?.idx === 'number'
    ? window.history.state.idx > 0
    : false;
  const canNavigateBack = hasInAppBackHistory || Boolean((location.state as { from?: string } | null)?.from);

  const handleBack = () => {
    if (canNavigateBack) {
      navigate(-1);
      return;
    }
    navigate('/app');
  };

  const navItems = [
    { label: t('nav.home'), icon: Home, path: '/' },
    { label: t('nav.createProject'), icon: LayoutDashboard, path: '/app' },
    { label: t('nav.history'), icon: FolderOpen, path: '/history' },
    { label: t('nav.materialCenter'), icon: Box, path: '/app' },
    { label: t('nav.materialGenerate'), icon: ImagePlus, path: '/app' },
    { label: t('nav.settings'), icon: SettingsIcon, path: '/settings' },
  ];

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > SCROLL_SHOW_THRESHOLD);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f9fc] dark:bg-background-primary">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Card className="p-0 overflow-hidden border-sky-100 shadow-[0_25px_80px_rgba(15,70,120,0.10)]">
          <div className="space-y-0">
            <nav className="flex flex-col gap-4 border-b border-sky-100 bg-white/90 p-4 dark:border-border-primary dark:bg-background-secondary/90 lg:flex-row lg:items-center lg:justify-between">
              <button
                type="button"
                onClick={() => navigate('/app')}
                className="flex items-center gap-2 text-left font-semibold text-cyan-700"
              >
                <img src={getStaticAssetUrl('/logo-nav.png')} alt="EasySlide Logo" className="h-8 w-8 rounded-full" />
                <span>EasySlide</span>
              </button>
              <div className="flex flex-wrap items-center gap-1 text-sm text-slate-600 dark:text-foreground-secondary">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => navigate(item.path)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 transition-colors hover:bg-sky-50 hover:text-cyan-700 dark:hover:bg-background-hover ${
                        item.path === '/settings' ? 'bg-sky-50 text-cyan-700 dark:bg-background-hover' : ''
                      }`}
                    >
                      <Icon size={15} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </nav>
            <div className="border-b border-sky-100 bg-white/70 p-5 dark:border-border-primary dark:bg-background-secondary/70">
                <Button
                  variant="secondary"
                  icon={<Home size={18} />}
                  onClick={handleBack}
                >
                  {t('nav.backToHome')}
                </Button>
            </div>

            <div className="p-6 md:p-10">
              <Settings />
            </div>
          </div>
        </Card>
      </div>

      {showTop && (
        <button
          data-testid="back-to-top-button"
          aria-label="Back to top"
          title="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-24 right-6 p-3 rounded-full bg-cyan-600 text-white shadow-lg hover:bg-cyan-700 transition-all z-50"
        >
          <ArrowUp size={20} />
        </button>
      )}
    </div>
  );
};

