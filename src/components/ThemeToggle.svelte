<script lang="ts">
  import { theme, setTheme, type ThemeChoice } from '../lib/stores/theme'

  const options: { value: ThemeChoice; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ]
</script>

<div class="toggle" role="group" aria-label="Colour theme">
  {#each options as opt (opt.value)}
    <button
      type="button"
      class="opt"
      class:active={$theme === opt.value}
      title={opt.label}
      aria-label={opt.label}
      aria-pressed={$theme === opt.value}
      onclick={() => setTheme(opt.value)}
    >
      {#if opt.value === 'light'}
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          ><circle cx="12" cy="12" r="4" /><path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          /></svg
        >
      {:else if opt.value === 'dark'}
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg
        >
      {:else}
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          ><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg
        >
      {/if}
    </button>
  {/each}
</div>

<style>
  .toggle {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--p-paper);
    border: 1px solid var(--p-divider);
    border-radius: 999px;
    padding: 3px;
  }
  .opt {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 999px;
    cursor: pointer;
    display: grid;
    place-items: center;
    background: transparent;
    color: var(--p-text-muted);
  }
  .opt:hover {
    background: var(--p-action-hover);
  }
  .opt.active {
    background: var(--p-primary-soft);
    color: var(--p-primary-ink);
  }
</style>
