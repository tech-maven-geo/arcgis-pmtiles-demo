const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  configureWebpack: {
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'node_modules/@arcgis/core/assets',
            to: 'assets'
          }
        ]
      }),
      new webpack.DefinePlugin({
        // Define relative base path in browsers for @arcgis/core
        '__ARCGIS_JSAPI_CDN_URL__': JSON.stringify('./assets')
      })
    ]
  }
};
