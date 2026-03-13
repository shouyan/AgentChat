import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AgentChat',
  description: 'Local-first coding agents with web and mobile control',
  base: '/docs/',

  head: [
    ['link', { rel: 'icon', href: '/docs/favicon.ico' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Quick Start', link: '/guide/quick-start' },
      { text: 'Installation', link: '/guide/installation' },
      { text: 'Provider Setup', link: '/guide/provider-setup' }
    ],

    sidebar: [
      { text: 'Quick Start', link: '/guide/quick-start' },
      { text: 'Installation', link: '/guide/installation' },
      { text: 'Provider Setup', link: '/guide/provider-setup' },
      { text: 'Support Matrix', link: '/guide/support-matrix' },
      { text: 'Feishu', link: '/guide/feishu' },
      { text: 'PWA', link: '/guide/pwa' },
      { text: 'How it Works', link: '/guide/how-it-works' },
      { text: 'Namespace', link: '/guide/namespace' },
      { text: 'FAQ', link: '/guide/faq' }
    ],

    footer: {
      message: 'Released under the AGPL-3.0-only license.',
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
