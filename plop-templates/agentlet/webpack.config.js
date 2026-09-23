const path = require('path');

module.exports = {
  entry: {
    core: './src/index.js',
    module: './src/module.js',
  },
  output: {
    filename: '[name]-bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    fullySpecified: false, // Allow importing .mjs files without full extension
    // agentlet-core is typically installed as a `file:` dependency (a symlink
    // in node_modules). With the default `symlinks: true`, webpack resolves
    // such symlinks to their real, outside-of-node_modules path, which makes
    // the babel-loader `exclude: /node_modules/` rule below fail to exclude
    // it, causing the whole pre-built agentlet-core bundle to be needlessly
    // (and slowly) re-transpiled. Keeping the symlink path as-is fixes that.
    symlinks: false,
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['@babel/plugin-transform-class-properties']
          }
        }
      },
      {
        test: /\.mjs$/,
        include: /node_modules/,
        type: 'javascript/auto',
      }
    ]
  },
  plugins: [
    // Plugins will be added conditionally by plop based on selected libraries
  ],
  devServer: {
    static: './dist',
    port: 8080,
    client: false, // disable WebSocket
    hot: false, // disable Hot Module Replacement
    liveReload: false, // disable Live Reload
    allowedHosts: 'all', // allow all origins
    headers: {
      'Access-Control-Allow-Origin': '*', // allow all origins
    },
    compress: true, // enable gzip compression
  },
};