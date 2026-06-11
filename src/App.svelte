<script lang="ts">
  import { connection } from './lib/stores/badge'
  import Header from './components/Header.svelte'
  import ConnectionCard from './components/ConnectionCard.svelte'
  import FileList from './components/FileList.svelte'
  import Composer from './components/Composer.svelte'
  import HistoryList from './components/HistoryList.svelte'
</script>

<main data-testid="app-root" class="page">
  <div class="shell">
    <Header />
    <!-- Machine-readable connection state for assistive tech + e2e hooks. -->
    <span class="sr-only" data-testid="connection-status">{$connection}</span>

    <!-- Capability-first: the editor is ALWAYS visible. The left rail swaps its
         status card by connection state; it never replaces the editor. -->
    <div class="layout">
      <div class="col-left">
        <ConnectionCard />
        {#if $connection === 'connected'}
          <FileList />
        {/if}
      </div>
      <div class="col-right">
        <Composer />
        <HistoryList />
      </div>
    </div>
  </div>
</main>

<style>
  .page {
    min-height: 100vh;
    padding: 28px 24px 64px;
  }
  .shell {
    max-width: 1060px;
    margin: 0 auto;
  }
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: flex-start;
  }
  .col-left {
    flex: 1 1 300px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .col-right {
    flex: 1.7 1 360px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
</style>
