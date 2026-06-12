<script lang="ts">
  import { historyItems, requestRestore, removeHistory } from '../lib/stores/history'
  import Button from './Button.svelte'

  // Most items have no useful filename (pastes, clips), so label by relative time.
  function timeAgo(ts: number): string {
    const s = Math.max(0, (Date.now() - ts) / 1000)
    if (s < 45) return 'just now'
    const m = Math.round(s / 60)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.round(h / 24)}d ago`
  }

  // Thumbnail URLs, revoked on change/unmount. Must not read `urls` (would self-trigger).
  // Video items show a saved snapshot, never the video blob (which a <img> can't render).
  let urls = $state<Record<string, string>>({})
  $effect(() => {
    const next: Record<string, string> = {}
    for (const it of $historyItems) {
      const src = it.media === 'video' ? it.thumbnail : it.blob
      if (src) next[it.id] = URL.createObjectURL(src)
    }
    urls = next
    return () => {
      for (const u of Object.values(next)) URL.revokeObjectURL(u)
    }
  })
</script>

{#if $historyItems.length}
  <div class="history">
    <h3>Recent</h3>
    <p class="note">Saved in this browser. Reopen any to re-edit and send again.</p>
    <div class="rows">
      {#each $historyItems as it (it.id)}
        <div class="row" data-testid="history-item">
          <div class="thumb" aria-hidden="true">
            {#if urls[it.id]}<img src={urls[it.id]} alt="" />{/if}
          </div>
          <div class="meta">
            <div class="when">{timeAgo(it.updatedAt)}</div>
            <div class="chips">
              <span class="chip" class:up={it.uploaded}>{it.uploaded ? 'Uploaded' : 'Draft'}</span>
              {#if it.media === 'video'}<span class="chip clip">Clip</span>{/if}
            </div>
          </div>
          <Button
            variant="soft"
            size="sm"
            data-testid="history-restore"
            onclick={() => requestRestore(it)}
          >
            Restore
          </Button>
          <button
            type="button"
            class="del"
            title="Remove from history"
            aria-label="Remove {it.name} from history"
            onclick={() => removeHistory(it.id)}
          >
            ✕
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .history {
    display: flex;
    flex-direction: column;
  }
  h3 {
    font-size: 14px;
    font-weight: 800;
    color: var(--p-text);
    margin: 2px 2px 2px;
  }
  .note {
    font-size: 11px;
    color: var(--p-text-muted);
    margin: 0 2px 11px;
    line-height: 1.4;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 8px 10px;
    border: 1px solid var(--p-divider);
    border-radius: 11px;
    background: var(--p-paper);
    min-height: 48px;
  }
  .thumb {
    position: relative;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    flex: none;
    overflow: hidden;
    background: #0a0a0a;
    box-shadow: inset 0 0 0 2px var(--p-paper-alt);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .meta {
    flex: 1;
    min-width: 0;
  }
  .when {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--p-text);
    white-space: nowrap;
  }
  .chips {
    display: flex;
    gap: 5px;
    margin-top: 3px;
  }
  .chip {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--p-paper-alt);
    color: var(--p-text-muted);
  }
  .chip.up {
    background: var(--p-success-soft);
    color: var(--p-success-ink);
  }
  .chip.clip {
    background: var(--p-secondary-soft);
    color: var(--p-secondary-ink);
  }
  .del {
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 8px;
    border: 1px solid var(--p-divider);
    background: transparent;
    cursor: pointer;
    color: var(--p-text-muted);
    font-size: 13px;
    line-height: 1;
    display: grid;
    place-items: center;
  }
  .del:hover {
    color: var(--p-danger);
    border-color: var(--p-danger-soft);
  }
</style>
