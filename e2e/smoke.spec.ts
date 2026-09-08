import { expect, test } from '@playwright/test'

test('mobile shell is usable at iPhone width', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/10\.5/)
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll')
  const configured = Boolean(process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_PUBLISHABLE_KEY)
  if (configured) {
    await expect(page.getByText('ゲームを作る')).toBeVisible()
    await expect(page.getByTestId('player-name')).toBeVisible()
  } else {
    await expect(page.getByText('SETUP REQUIRED')).toBeVisible()
  }
})

test('host and guest can create/join/start when E2E Supabase is configured', async ({ browser }) => {
  test.skip(!process.env.E2E_SUPABASE_URL || !process.env.E2E_SUPABASE_PUBLISHABLE_KEY, 'E2E Supabase env is not configured')
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()

  await host.goto('/')
  await host.getByTestId('player-name').fill('Host')
  await host.getByTestId('create-room').click()
  const code = await host.getByTestId('room-code').innerText()
  expect(code).toMatch(/^[A-F0-9]{6}$/)

  await guest.goto(`/?room=${code}`)
  await guest.getByTestId('player-name').fill('Guest')
  await guest.getByTestId('join-room').click()
  await expect(host.getByText('Guest')).toBeVisible({ timeout: 10_000 })

  await host.getByTestId('start-game').click()
  await expect(host.getByText('あなたのカード')).toBeVisible({ timeout: 10_000 })
  await expect(guest.getByText('あなたのカード')).toBeVisible({ timeout: 10_000 })
  await expect(host.getByText('🔒 非公開')).toBeVisible()
  await expect(guest.getByText('🔒 非公開')).toBeVisible()

  await hostContext.close()
  await guestContext.close()
})
