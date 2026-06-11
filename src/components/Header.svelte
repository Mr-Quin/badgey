<script lang="ts">
  import ThemeToggle from './ThemeToggle.svelte'
  import BadgeMark from './BadgeMark.svelte'

  const repoUrl = 'https://github.com/Mr-Quin/badgey'
</script>

<header class="header">
  <div class="brand">
    <BadgeMark size={40} />
    <div class="wordmark">Badgey</div>
  </div>

  <div class="actions">
    <a
      class="icon-link"
      href={repoUrl}
      target="_blank"
      rel="noopener"
      title="View source on GitHub"
      aria-label="View source on GitHub"
    >
      <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"
        ><path
          d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
        /></svg
      >
    </a>

    <ThemeToggle />
  </div>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 22px;
    flex-wrap: wrap;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 13px;
  }
  .wordmark {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.4px;
    color: var(--p-text);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .icon-link {
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 9px;
    border: 1px solid var(--p-divider);
    background: var(--p-paper);
    display: grid;
    place-items: center;
    color: var(--p-text);
  }
  .icon-link:hover {
    background: var(--p-action-hover);
  }
</style>
