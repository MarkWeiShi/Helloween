import {test,expect} from '@playwright/test';
test('static boot loads public catalogs from pinned CDN files and never API content routes',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(new URL(r.url()).pathname));
 await page.goto('/?lang=ja');await expect(page.locator('.play-unlock')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('lang','ja');
 expect(requests).not.toContain('/api/catalog');expect(requests).not.toContain('/api/motions');
 expect(requests.some(p=>/^\/releases\/[a-f0-9]{20}\/content\/catalog.json$/.test(p))).toBe(true);
 expect(errors).toEqual([]);
 await page.goto('/rankings?lang=en');await expect(page.locator('[data-scope="trick"]')).toBeVisible();
 await page.goto('/my-links?lang=en');await expect(page.locator('.ghost-links-page')).toBeVisible();
 await page.goto('/i/missing?lang=ar');await expect(page.locator('.play-unlock')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('dir','rtl');
});
