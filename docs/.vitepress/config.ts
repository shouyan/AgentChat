import { defineConfig } from 'vitepress'

export default defineConfig({
    title: 'AgentChat',
    description: '本地优先的 AI 编程代理控制台',
    base: '/docs/',

    lang: 'zh-CN',
    cleanUrls: true,

    head: [
        ['link', { rel: 'icon', href: '/docs/favicon.ico' }],
    ],

    themeConfig: {
        logo: '/logo.svg',

        nav: [
            { text: '快速开始', link: '/guide/quick-start' },
            { text: '安装', link: '/guide/installation' },
            { text: '飞书接入', link: '/guide/feishu' },
            { text: 'FAQ', link: '/guide/faq' },
        ],

        sidebar: [
            {
                text: '开始使用',
                items: [
                    { text: '文档首页', link: '/' },
                    { text: '快速开始', link: '/guide/quick-start' },
                    { text: '安装总览', link: '/guide/installation' },
                    { text: 'Release 安装', link: '/guide/release-install' },
                    { text: '源码安装', link: '/guide/source-install' },
                ],
            },
            {
                text: '使用指南',
                items: [
                    { text: 'Provider 配置', link: '/guide/provider-setup' },
                    { text: '支持矩阵', link: '/guide/support-matrix' },
                    { text: 'PWA 安装', link: '/guide/pwa' },
                    { text: 'Cursor Agent', link: '/guide/cursor' },
                    { text: '语音助手', link: '/guide/voice-assistant' },
                ],
            },
            {
                text: '集成与进阶',
                items: [
                    { text: '飞书接入', link: '/guide/feishu' },
                    { text: '工作原理', link: '/guide/how-it-works' },
                    { text: 'Namespace（高级）', link: '/guide/namespace' },
                    { text: '为什么是 AgentChat', link: '/guide/why-agentchat' },
                ],
            },
            {
                text: '帮助',
                items: [
                    { text: 'FAQ', link: '/guide/faq' },
                    { text: '故障排查', link: '/guide/troubleshooting' },
                ],
            },
        ],

        footer: {
            message: '基于 AGPL-3.0-only 许可证发布。',
            copyright: 'Copyright © 2026 AgentChat'
        },

        search: {
            provider: 'local'
        }
    },

    vite: {
        server: {
            allowedHosts: true
        }
    }
})
