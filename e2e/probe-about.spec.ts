import { test, _electron as electron } from '@playwright/test';

test('About IPC returns version + changelog', async () => {
  const app = await electron.launch({ args: ['.'] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  const about = await win.evaluate(async () => await window.api.getAbout());
  console.log('about:', about.name, about.version, 'changelog lines:', about.changelog.split('\n').length);
  console.log('first line:', about.changelog.split('\n')[0]);

  await app.close();
});
