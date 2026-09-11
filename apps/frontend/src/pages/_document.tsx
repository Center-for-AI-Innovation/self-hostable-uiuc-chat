import { type DocumentProps, Head, Html, Main, NextScript } from 'next/document'
import { useEffect, useState } from 'react'
import { DEFAULT_THEME } from '~/contexts/ThemeContext'
import i18nextConfig from '../../next-i18next.config.mjs'

type Props = DocumentProps & {
  // add custom document props
}

export default function Document(props: Props) {
  const currentLocale =
    props.__NEXT_DATA__.locale ?? i18nextConfig.i18n.defaultLocale
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false)

  useEffect(() => {
    const checkMaintenanceMode = async () => {
      try {
        const response = await fetch('/api/UIUC-api/getMaintenanceModeFast')
        const data = await response.json()
        setIsMaintenanceMode(data.isMaintenanceMode)
      } catch (error) {
        console.error('Failed to check maintenance mode:', error)
        setIsMaintenanceMode(false)
      }
    }

    checkMaintenanceMode()
  }, [])

  if (isMaintenanceMode) {
    return (
      <Html lang={currentLocale}>
        <Head>
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-title" content="UIUC.chat"></meta>
          {/* Prevent search engine indexing of Maintenance page: https://github.com/vercel/next.js/discussions/12850#discussioncomment-3335807  */}
          <meta name="robots" content="noindex" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }

  return (
    <Html lang={currentLocale}>
      <Head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="UIUC.chat"></meta>
        {/*
          mathjax-full reads its own version via eval('require') unless the
          PACKAGE_VERSION global is set, which throws "require is not defined"
          in the browser as soon as rehype-mathjax is imported. The webpack
          build defines it via DefinePlugin (see next.config.mjs); Turbopack has
          no DefinePlugin equivalent and mathjax requires the module by relative
          path, so resolveAlias cannot intercept it. Setting the global in an
          inline head script runs before the deferred bundles and works for both
          bundlers. Keep in sync with the installed mathjax-full version.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.PACKAGE_VERSION = window.PACKAGE_VERSION || '3.2.1'`,
          }}
        />
        {/* TODO: review if this is actually necessary, given toggle ThemeToggle.tsx */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                // Falls back to ThemeContext's DEFAULT_THEME (interpolated at build
                // time), or a mismatched default here flashes the wrong theme on
                // first paint before React mounts. Explicit 'system' follows the OS.
                const t = localStorage.theme || '${DEFAULT_THEME}'
                if (t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark')
                } else {
                  document.documentElement.classList.remove('dark')
                }
              } catch (_) {}
            `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
