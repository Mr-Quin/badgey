import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { BadgePage } from '../pages/badge-page'

const image = fileURLToPath(new URL('../fixtures/sample.png', import.meta.url))

test('a two-finger pinch resizes the image', async ({ page }) => {
  const badge = new BadgePage(page)
  await badge.goto()
  await badge.connect()
  await badge.pickImage(image)
  await expect(badge.previewImage()).toBeVisible()

  const size = page.getByRole('slider', { name: 'Size' })
  const before = Number(await size.inputValue())

  // Dispatch a spreading two-pointer gesture on the editor stage.
  const stage = page.getByRole('application')
  const box = await stage.boundingBox()
  if (!box) throw new Error('no stage box')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await stage.evaluate(
    (el, { cx, cy }) => {
      const fire = (type: string, id: number, x: number, y: number) =>
        el.dispatchEvent(
          new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true }),
        )
      fire('pointerdown', 1, cx - 20, cy)
      fire('pointerdown', 2, cx + 20, cy)
      fire('pointermove', 1, cx - 90, cy)
      fire('pointermove', 2, cx + 90, cy)
      fire('pointerup', 1, cx - 90, cy)
      fire('pointerup', 2, cx + 90, cy)
    },
    { cx, cy },
  )

  const after = Number(await size.inputValue())
  expect(after).toBeGreaterThan(before)
})
