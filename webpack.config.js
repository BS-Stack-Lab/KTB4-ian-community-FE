import path from "node:path";
import { fileURLToPath } from "node:url";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";

const root = path.dirname(fileURLToPath(import.meta.url));
const appVersion = (process.env.APP_VERSION || "local").trim();

if (!/^(?:local|[0-9a-f]{40})$/.test(appVersion)) {
  throw new Error("APP_VERSION must be 'local' or a 40-character commit SHA");
}

class VersionManifestPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap(
      "VersionManifestPlugin",
      (compilation) => {
        const { Compilation, sources } = compiler.webpack;
        compilation.hooks.processAssets.tap(
          {
            name: "VersionManifestPlugin",
            stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
          },
          () => {
            const assets = compilation
              .getAssets()
              .map(({ name }) => `/${name}`)
              .sort();
            const manifest = {
              schemaVersion: 1,
              version: appVersion,
              assets: {
                js: assets.filter((name) => name.endsWith(".js")),
                css: assets.filter((name) => name.endsWith(".css")),
              },
            };
            compilation.emitAsset(
              "version.json",
              new sources.RawSource(`${JSON.stringify(manifest, null, 2)}\n`),
            );
          },
        );
      },
    );
  }
}

export default {
  entry: "./src/app/main.jsx",
  output: {
    path: path.join(root, "build"),
    filename: "dist/app.[contenthash:12].js",
    assetModuleFilename: "dist/assets/[name].[contenthash:12][ext]",
    clean: true,
    publicPath: "/",
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              ["@babel/preset-env", { targets: "defaults" }],
              [
                "@babel/preset-react",
                { runtime: "automatic", development: false },
              ],
            ],
          },
        },
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
      {
        test: /\.(png|svg|woff2)$/i,
        type: "asset/resource",
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: "dist/app.[contenthash:12].css",
    }),
    new HtmlWebpackPlugin({
      template: "./index.html",
      filename: "index.html",
      inject: "body",
      scriptLoading: "defer",
      appVersion,
    }),
    new VersionManifestPlugin(),
  ],
  resolve: { extensions: [".js", ".jsx"] },
  devServer: {
    port: 4173,
    host: "127.0.0.1",
    historyApiFallback: true,
    static: { directory: root, watch: false },
  },
};
