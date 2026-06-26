import { JSDOM } from 'jsdom';
const dom = new JSDOM(`<!DOCTYPE html><html lang="en"><body><div id="tabs"></div><div id="bottomNav"></div></body></html>`, { url: "http://localhost/", runScripts: "dangerously" });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
import('./static/app.js').then(() => {
  console.log("App.js loaded successfully!");
}).catch(e => {
  console.error("App.js failed to load:", e);
});
