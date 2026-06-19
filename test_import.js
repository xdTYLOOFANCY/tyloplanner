global.window = { addEventListener: () => {}, location: {}, dispatchEvent: () => {} };
global.document = {
  documentElement: { setAttribute: () => {} },
  getElementById: () => ({ value: '', addEventListener: () => {}, style: {} }),
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({}),
  body: { appendChild: () => {} }
};
global.localStorage = { getItem: () => null };
global.navigator = {};
import('./static/app.js').then(() => console.log('OK')).catch(console.error);
