import { chromium } from 'playwright-core';
const B='http://localhost:3000';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME });
const page = await (await browser.newContext({viewport:{width:1500,height:1100}})).newPage();
page.on('pageerror',e=>console.log('  PAGEERR', e.message.slice(0,140)));

await page.goto(`${B}/login`,{waitUntil:'domcontentloaded'});
await page.fill('#email','tomas@meridian.example'); await page.fill('#password','Polytrail!2026');
await page.click('button[type=submit]'); await page.waitForTimeout(2600);

await page.goto(`${B}/console/passports/new`,{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1200);
await page.fill('#productName','Wren Boiled Wool Coat');
await page.selectOption('#category','apparel.outerwear.coat');
await page.fill('#styleNumber','MRD-2701');
await page.fill('#sku','MRD-2701-MOSS-40');
await page.fill('#gtin','08712345000011');
await page.fill('#colourName','Moss');
await page.fill('#size','40');
await page.waitForTimeout(400);
await page.click('button[type=submit]');
await page.waitForTimeout(3500);
console.log('  landed on:', new URL(page.url()).pathname);

// What does the identity section actually offer?
const fields = await page.evaluate(() =>
  [...document.querySelectorAll('fieldset input,fieldset select,fieldset textarea')]
    .filter(el => el.name && !el.name.startsWith('$'))
    .map(el => `${el.tagName.toLowerCase()} ${el.name}`));
console.log('  identity fields:', fields.length);
fields.slice(0,24).forEach(f=>console.log('    '+f));
await browser.close();
