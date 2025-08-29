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