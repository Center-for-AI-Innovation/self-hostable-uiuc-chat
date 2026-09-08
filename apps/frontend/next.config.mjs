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
  // `next build` type-checks every file tsconfig `include` matches. Point it at a
  // build-only tsconfig that omits tests so a spec's type error cannot fail the
  // production build; tests are still checked against tsconfig.json.
  typescript: {
    tsconfigPath: 'tsconfig.build.json',
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'github.com' },
      {
        protocol: 'https',
        hostname: 'uiuc-chatbot.s3.us-east-1.amazonaws.com',
      },
      { protocol: 'https', hostname: 'images.squarespace-cdn.com' },
      { protocol: 'https', hostname: 'raw.githubusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'anthropic.com' },
      { protocol: 'https', hostname: 'via.placeholder.com' },
    ],
  },
  // Let Node require() these directly instead of webpack bundling them:
  // postgres is Node-only; sanitize-html/undici trip up webpack's ESM/CJS resolution.
  serverExternalPackages: [
    'postgres',
    'sanitize-html',
    'undici',
    '@qdrant/js-client-rest',
  ],
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
