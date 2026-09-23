import { config } from './config.js';
import { createApp } from './app.js';
import { refreshSelectors } from './extractors/selectors.js';

await refreshSelectors();
setInterval(refreshSelectors, 15 * 60 * 1000).unref();

createApp().listen(config.port, () => {
  console.info(`Pluck API listening on :${config.port}`);
});
