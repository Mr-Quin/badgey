import { writable } from '../observable'

export type ThemeChoice = 'light' | 'dark' | 'system'

const KEY = 'badge-display-theme'

function initial(): ThemeChoice {
  if (typeof localStorage !== 'undefined') {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  }
  return 'system'
}

/**
 * Three-state theme preference: light / dark / system.
 *
 * Applied by toggling `data-theme` on <html>. For `system` we remove the
 * attribute entirely so Sakura's `prefers-color-scheme` media query (which
 * targets `:root:not([data-theme="light"])`) drives the colours live.
 */
export const theme = writable<ThemeChoice>(initial())

export function setTheme(choice: ThemeChoice): void {
  theme.set(choice)
}

function apply(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (choice === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', choice)
}

// Runs immediately on first import (writable invokes the subscriber synchronously),
// so importing this module applies the persisted theme before the app mounts.
theme.subscribe((choice) => {
  apply(choice)
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, choice)
})
