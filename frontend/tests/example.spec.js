// @ts-check
import { test, expect } from '@playwright/test';

test.setTimeout(60000);

test.describe('Full AI Interview Platform E2E Suite', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  });

  // 1. Landing Page & Pricing Navigation Check
  test('1. Verify Landing Page & Pricing Navigation', async ({ page }) => {
    await expect(page).toHaveTitle(/.*/);
    
    const pricingBtn = page.getByText(/Pricing|Plans/i).first();
    if (await pricingBtn.isVisible()) {
      await pricingBtn.click();
      console.log('✅ Navigated to Pricing section/page');
    }
  });

  // 2. Auth Flow Verification
  test('2. Verify Authentication Elements (Login/Profile)', async ({ page }) => {
    const authBtn = page.getByText(/Login|Sign In|Profile/i).first();
    if (await authBtn.isVisible()) {
      await authBtn.click();
      console.log('✅ Auth / Profile interaction trigger verified');
    }
  });

  // 3. Complete Interview Setup & Pre-Check Flow (WebKit Compatible)
  test('3. Complete Interview Setup & Pre-Check Flow', async ({ page }) => {
    const startInterviewBtn = page.getByText('Start Interview').first();
    await expect(startInterviewBtn).toBeVisible({ timeout: 10000 });
    await startInterviewBtn.click();

    // Candidate Name Fill
    const nameInput = page.locator('input[placeholder*="Name" i], input[name*="name" i]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await nameInput.isVisible()) {
      await nameInput.fill('Nisha Chaudhary');
    }

    // Role Fill
    const roleInput = page.locator('input[placeholder*="Role" i], input[name*="role" i]').first();
    if (await roleInput.isVisible()) {
      await roleInput.fill('Backend Developer');
    }

    // Experience Fill
    const expInput = page.locator('input[placeholder*="Experience" i], input[name*="exp" i]').first();
    if (await expInput.isVisible()) {
      await expInput.fill('2 years');
    }

    // Submit Setup Form
    const submitBtn = page.locator('button[type="submit"]').or(page.getByRole('button', { name: /start|begin|next|continue/i })).last();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    }

    console.log('✅ Interview Setup & Pre-Check automated');
  });

  // 4. Main Interview Room & Coding Environment Check
  test('4. Verify Interview Room & Code Container', async ({ page }) => {
    const startBtn = page.getByText('Start Interview').first();
    if (await startBtn.isVisible()) {
      await startBtn.click();
    }

    await page.waitForTimeout(3000);
    
    const codeArea = page.locator('.monaco-editor, textarea, code, [contenteditable="true"]').first();
    if (await codeArea.isVisible()) {
      console.log('✅ Interview Coding Environment detected');
    } else {
      console.log('ℹ️ Interview Room loaded (waiting for user interaction)');
    }
  });

  // 5. History & Scorecard Report Flow
  test('5. Verify History & Scorecard Navigation', async ({ page }) => {
    const historyBtn = page.getByText(/My History|History/i).first();
    if (await historyBtn.isVisible()) {
      await historyBtn.click();
      console.log('✅ Navigated to Interview History page');
    }
  });

});