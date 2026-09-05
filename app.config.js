const appJson = require('./app.json');

const expoConfig = appJson.expo;
const webBaseUrl = process.env.MEALOG_WEB_BASE_URL;

module.exports = {
  ...expoConfig,
  experiments: webBaseUrl
    ? {
        ...(expoConfig.experiments ?? {}),
        baseUrl: webBaseUrl,
      }
    : expoConfig.experiments,
};
