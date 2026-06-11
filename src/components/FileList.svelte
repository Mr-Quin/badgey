<script lang="ts">
  import { files, loading, deviceId, refresh, remove } from '../lib/stores/badge'
  import { historyItems } from '../lib/stores/history'
  import Button from './Button.svelte'

  let busy = $state(false)
  let confirming = $state<string | null>(null)

  // Show only real files (`file: true`). Directories / system entries the badge
  // exposes — e.g. "BAG" — aren't images and shouldn't look deletable here.
  const images = $derived($files.filter((f) => f.file))

  // Thumbnails for files uploaded via this app, matched by device + filename
  // (filenames can collide across badges). Object URLs are revoked on change.
  let thumbs = $state<Record<string, string>>({})
  $effect(() => {
    const dev = $deviceId
    const byKey = new Map<string, Blob>()
    for (const it of $historyItems) {
      if (it.badgeName && it.badgeDeviceId && it.badgeDeviceId === dev) {
        byKey.set(it.badgeName, it.blob)
      }
    }
    const next: Record<string, string> = {}
    for (const f of images) {
      const blob = byKey.get(f.name)
      if (blob) next[f.name] = URL.createObjectURL(blob)
    }
    thumbs = next
    return () => {
      for (const u of Object.values(next)) URL.revokeObjectURL(u)
    }
  })

  async function onRefresh() {
    busy = true
    try {
      await refresh()
    } catch {
      // error surfaced via the error store
    } finally {
      busy = false
    }
  }

  async function onConfirmDelete(name: string) {
    busy = true
    try {
      await remove(name)
      confirming = null
    } catch {
      // error surfaced via the error store
    } finally {
      busy = false
    }
  }
</script>

<div class="gallery">
  <div class="head">
    <h3>On your badge</h3>
    <Button
      variant="soft"
      size="sm"
      data-testid="refresh-button"
      onclick={onRefresh}
      disabled={busy}
    >
      ↻ Refresh
    </Button>
  </div>

  <div class="rows" data-testid="file-list">
    {#if $loading && images.length === 0}
      {#each [0, 1, 2] as i (i)}
        <div class="row" aria-hidden="true">
          <div class="thumb sk"></div>
          <div class="sk sk-line" style="flex: 1; max-width: 160px;"></div>
        </div>
      {/each}
    {:else}
      {#each images as f (f.cluster + '/' + f.name)}
        <div class="row" data-testid="file-row">
          <div class="thumb" class:photo={thumbs[f.name]} aria-hidden="true">
            {#if thumbs[f.name]}<img src={thumbs[f.name]} alt="" />{:else}<div
                class="doc"
              ></div>{/if}
          </div>
          <div class="name">{f.name}</div>
          {#if confirming === f.name}
            <span class="ask">{busy ? 'Deleting…' : 'Delete?'}</span>
            <Button variant="ghost" size="sm" onclick={() => (confirming = null)} disabled={busy}>
              Keep
            </Button>
            <Button
              variant="danger"
              size="sm"
              data-testid="file-delete-confirm"
              onclick={() => onConfirmDelete(f.name)}
              disabled={busy}
            >
              {#if busy}<span class="spin" aria-hidden="true"></span>Deleting…{:else}Delete{/if}
            </Button>
          {:else}
            <button
              type="button"
              class="del"
              data-testid="file-delete"
              title="Delete {f.name}"
              aria-label="Delete {f.name}"
              onclick={() => (confirming = f.name)}
              disabled={busy}
            >
              ✕
            </button>
          {/if}
        </div>
      {:else}
        <div class="empty">No images on the badge yet.</div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .gallery {
    display: flex;
    flex-direction: column;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 2px 2px 4px;
  }
  h3 {
    font-size: 14px;
    font-weight: 800;
    color: var(--p-text);
    white-space: nowrap;
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
    width: 30px;
    height: 30px;
    border-radius: 8px;
    flex: none;
    background: var(--p-paper-alt);
    display: grid;
    place-items: center;
  }
  .thumb.photo {
    background: #0a0a0a;
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .doc {
    width: 12px;
    height: 14px;
    border-radius: 2px;
    border: 1.5px solid var(--p-text-disabled);
  }
  .name {
    flex: 1;
    min-width: 0;
    font-family: var(--p-mono);
    font-size: 12.5px;
    color: var(--p-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .del {
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 8px;
    border: 1px solid var(--p-divider);
    background: transparent;
    cursor: pointer;
    color: var(--p-text-muted);
    font-size: 14px;
    line-height: 1;
    display: grid;
    place-items: center;
  }
  .del:hover {
    color: var(--p-danger);
    border-color: var(--p-danger-soft);
  }
  .ask {
    font-size: 11px;
    color: var(--p-danger-ink);
    font-weight: 700;
  }
  .spin {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.5);
    border-top-color: #fff;
    animation: bdg-spin 0.8s linear infinite;
  }
  .empty {
    color: var(--p-text-muted);
    padding: 14px 2px;
    font-size: 13px;
  }
</style>
