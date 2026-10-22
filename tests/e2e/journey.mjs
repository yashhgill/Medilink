// End-to-end browser test of one complete patient visit, driven through the
// real UI exactly as clinic staff and a patient would use it:
//
//   kiosk check-in -> triage -> queue ticket -> doctor consultation + prescription
//   -> kiosk payment (DuitNow) -> front desk confirms money -> pharmacy dispenses
//
// Usage: node tests/e2e/journey.mjs [baseUrl] [screenshotDir]
// Needs a running clinic node with seeded staff (see README) and Playwright.
import { chromium } from 'playwright'
import fs from 'node:fs'

const B = process.argv[2] || 'http://127.0.0.1:8001'
const OUT = process.argv[3] || 'tests/e2e/shots'
fs.mkdirSync(OUT, { recursive: true })
const IC = '940812-04-5318'
const steps = []
const t0 = Date.now()
function step(name, ok, detail = '') {
  steps.push({ name, ok, detail, ms: Date.now() - t0 })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) throw new Error(name + ': ' + detail)
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })
async function staffPage(email, password, vp = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp })
  const p = await ctx.newPage()
  await p.goto(B + '/login')
  await p.getByTestId('login-email').fill(email)
  await p.getByTestId('login-password').fill(password)
  await p.getByTestId('login-submit').click()
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 })
  return p
}

try {
  // 1. Kiosk: new walk-in registers and checks in
  const kctx = await browser.newContext({ viewport: { width: 1180, height: 820 } })
  const k = await kctx.newPage()
  await k.goto(B + '/kiosk')
  await k.getByTestId('kiosk-ic-input').fill(IC)
  await k.getByTestId('kiosk-lookup-btn').click()
  await k.getByTestId('kiosk-register-screen').waitFor({ timeout: 10000 })
  await k.getByTestId('kiosk-reg-name').fill('Nurul Huda binti Kamal')
  await k.getByTestId('kiosk-reg-phone').fill('0127788990')
  await shot(k, 'e2e-01-kiosk-register')
  await k.getByTestId('kiosk-reg-submit').click()
  await k.getByTestId('kiosk-found-screen').waitFor({ timeout: 10000 })
  step('kiosk: new patient registered from IC', true)

  await k.getByTestId('kiosk-symptoms').fill('sakit dada dan sesak nafas sejak pagi')
  await shot(k, 'e2e-02-kiosk-symptoms')
  await k.getByTestId('kiosk-confirm-checkin').click()
  await k.getByTestId('kiosk-booked-screen').waitFor({ timeout: 20000 })
  const zone = await k.locator('.ticket-stub').getAttribute('data-zone')
  await shot(k, 'e2e-03-kiosk-ticket')
  step('kiosk: queue ticket issued', true, `zone ${zone || 'none'}`)
  step('triage: Malay chest pain + breathlessness is Red', zone === 'Red', `got ${zone}`)

  // 2. Reception sees them at the top
  const r = await staffPage('reception@medilink.io', 'Recep@123')
  await r.getByTestId('queue-row').first().waitFor()
  const firstRow = await r.getByTestId('queue-row').first().innerText()
  await shot(r, 'e2e-04-reception-queue')
  step('reception: most urgent patient listed first', firstRow.includes('Nurul Huda'), firstRow.split('\n')[0])

  // 3. Doctor consults and prescribes
  const d = await staffPage('dr.tan@medilink.io', 'Doctor@123')
  await d.getByRole('button', { name: 'Whole clinic' }).click()
  await d.getByTestId('queue-item').filter({ hasText: 'Nurul Huda' }).first().click()
  await d.getByTestId('new-record-btn').click()
  await d.getByTestId('record-dialog').waitFor()
  await d.getByTestId('rec-diagnosis').fill('Chest pain for evaluation; referred')
  await d.getByTestId('rec-allergies').fill('Penicillin')
  await d.getByTestId('rx-med-0').fill('Paracetamol')
  await d.waitForTimeout(400)
  const opt = d.getByRole('option').first()
  if (await opt.isVisible().catch(() => false)) await opt.click()
  await d.getByTestId('rx-dose-0').fill('1 tablet')
  await d.getByTestId('rx-freq-0').fill('TDS')
  await d.getByTestId('rx-dur-0').fill('3 days')
  await shot(d, 'e2e-05-doctor-record')
  await d.getByTestId('rec-save-btn').click()
  await d.getByTestId('record-dialog').waitFor({ state: 'hidden', timeout: 15000 })
  step('doctor: record and prescription saved', true)

  // 4. Patient cannot be released medicine before paying; kiosk payment
  // the kiosk opens its print-ticket dialog after check-in; close it like a patient would
  if (await k.getByTestId('print-chit-dialog').isVisible().catch(() => false)) await k.keyboard.press('Escape')
  await k.getByTestId('kiosk-done-btn').click()
  await k.getByTestId('kiosk-tab-pay').click()
  await k.getByTestId('kiosk-pay-ic').fill(IC)
  await k.getByTestId('kiosk-pay-lookup').click()
  await k.getByTestId('kiosk-pay-row').first().waitFor({ timeout: 10000 })
  await shot(k, 'e2e-06-kiosk-bill')
  await k.locator('[data-testid^="kiosk-pay-btn-"]').first().click()
  await k.getByTestId('kiosk-pay-started').waitFor({ timeout: 10000 })
  await shot(k, 'e2e-07-kiosk-duitnow')
  step('kiosk: DuitNow QR shown, payment pending', true)

  const ph = await staffPage('pharmacy@medilink.io', 'Pharm@123')
  await ph.waitForTimeout(1200)
  const heldBefore = await ph.getByTestId('pharmacy-row').filter({ hasText: 'Nurul Huda' }).count()
  step('pharmacy: medicine held until payment is confirmed', heldBefore === 0, `${heldBefore} rows`)

  // 5. Front desk confirms the money
  await r.reload()
  await r.getByTestId('pending-payments').waitFor({ timeout: 10000 })
  await shot(r, 'e2e-08-reception-confirm')
  await r.getByTestId('pending-payment-row').filter({ hasText: 'Nurul Huda' }).getByRole('button', { name: 'Money received' }).click()
  await r.waitForTimeout(800)
  step('reception: payment confirmed', true)

  // 6. Pharmacy sees the allergy and dispenses
  await ph.reload()
  const row = ph.getByTestId('pharmacy-row').filter({ hasText: 'Nurul Huda' })
  await row.waitFor({ timeout: 10000 })
  const allergy = await row.getByTestId('pharmacy-allergy').innerText().catch(() => '')
  await shot(ph, 'e2e-09-pharmacy')
  step('pharmacy: allergy shown before dispensing', /penicillin/i.test(allergy), allergy)
  await row.locator('[data-testid^="dispense-btn-"]').click()
  await ph.getByTestId('dispense-confirm-btn').click()
  await row.waitFor({ state: 'detached', timeout: 10000 })
  step('pharmacy: medicine dispensed, visit closed', true)
} catch (e) {
  console.error(e.message)
} finally {
  fs.writeFileSync(`${OUT}/journey-result.json`, JSON.stringify({ base: B, at: new Date().toISOString(), steps }, null, 2))
  await browser.close()
  const failed = steps.some(s => !s.ok) || steps.length < 10
  console.log(`\n${steps.filter(s => s.ok).length}/10 steps passed`)
  process.exit(failed ? 1 : 0)
}
