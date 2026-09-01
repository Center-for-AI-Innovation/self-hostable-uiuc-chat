// next.config.mjs
/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import nextI18NextConfig from './next-i18next.config.mjs'
import withBundleAnalyzer from '@next/bundle-analyzer'

const bundleAnalyzerConfig = {
  enabled: process.env.ANALYZE === 'true',
}

/** @type {import("next").NextConfig} */
const config = {
  i18n: nextI18NextConfig.i18n,
  serverRuntimeConfig: {
    bodyParser: {
      sizeLimit: '100mb',
    },
  },
  webpack(config, { isServer, webpack }) {
    // Merge existing experiments with the required ones
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
      layers: true, // Enable layers experiment
    }

    // Adjust the module rules for WASM files
    config.module.rules.push({
      test: /\.wasm$/,
      // Exclude the Next.js middleware WASM loader from processing your WASM files
      exclude:
        /node_modules\/next\/dist\/build\/webpack\/loaders\/next-middleware-wasm-loader\.js/,
      type: 'webassembly/async',
    })

    // Keep postgres (Node-only; uses tls, net, perf_hooks) out of client bundle. Server uses it via API routes.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve?.fallback,
        tls: false,
        net: false,
        perf_hooks: false,
      }

      // mathjax-full falls back to eval('require') for its version unless this is defined.
      config.plugins.push(
        new webpack.DefinePlugin({
          PACKAGE_VERSION: JSON.stringify('3.2.1'),
        }),
      )
    }

    return config
  },

  /**
   * If you have `experimental: { appDir: true }` set, then you must comment the below `i18n` config
   * out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  // i18n: {
  //   locales: ['en'],
  //   defaultLocale: 'en',
  // },
  images: {
    unoptimized: true,
    domains: [
      'images.unsplash.com',
      'github.com',
      'uiuc-chatbot.s3.us-east-1.amazonaws.com',
      'images.squarespace-cdn.com',
      'raw.githubusercontent.com',
      'avatars.githubusercontent.com',
      'anthropic.com',
      'via.placeholder.com',
    ],
  },
  experimental: {
    esmExternals: false, // To make certain packages work with the /pages router.
    // Let Node require() these directly instead of webpack bundling them:
    // postgres is Node-only; sanitize-html/undici trip up webpack's ESM/CJS resolution.
    serverComponentsExternalPackages: [
      'postgres',
      'sanitize-html',
      'undici',
      '@qdrant/js-client-rest',
    ],
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,PUT,POST,DELETE,OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept',
          },
        ],
      },
    ]
  },
}

export default withBundleAnalyzer(bundleAnalyzerConfig)(config)
