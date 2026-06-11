<script lang="ts">
  import { info, files, loading, deviceId, deviceName, disconnect } from '../lib/stores/badge'
  import BadgeMark from './BadgeMark.svelte'
  import Button from './Button.svelte'

  const freeKB = $derived($info?.freeKB ?? 0)
  const freeMB = $derived((freeKB / 1024).toFixed(2))
  const imageCount = $derived($files.filter((f) => f.file).length)
  const name = $derived($deviceName ?? 'Badge')
  const shortId = $derived($deviceId ? $deviceId.slice(0, 6) : '')
  const dims = $derived($info ? `${$info.display[0]} × ${$info.display[1]}` : '')
</script>

{#if $info}
  <div class="device">
    <div class="head">
      <BadgeMark size={48} />
      <div class="meta">
        <div class="name">
          {name}{#if shortId}<span class="id"> · {shortId}</span>{/if}
        </div>
        <div class="status"><span class="dot"></span>Connected · {dims}</div>
      </div>
      <Button variant="ghost" size="sm" onclick={() => disconnect()}>Disconnect</Button>
    </div>
    <div class="free-row">
      <span class="free">{freeMB} MB</span>
      <span class="free-sub">free · {imageCount} {imageCount === 1 ? 'image' : 'images'}</span>
    </div>
    <span class="sr-only" data-testid="free-space">{freeKB}</span>
  </div>
{:else if $loading}
  <!-- skeleton while the first info load is in flight -->
  <div class="device" aria-hidden="true">
    <div class="head">
      <div class="sk" style="width: 48px; height: 48px; border-radius: 50%; flex: none"></div>
      <div class="meta">
        <div class="sk sk-line" style="width: 110px"></div>
        <div class="sk sk-line sm" style="width: 80px"></div>
      </div>
    </div>
    <div class="sk sk-line" style="width: 140px; height: 18px; margin-top: 16px"></div>
  </div>
{/if}

<style>
  .device {
    border: 1px solid var(--p-divider);
    border-radius: 16px;
    background: var(--p-paper);
    padding: 16px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 13px;
  }
  .meta {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-size: 16px;
    font-weight: 800;
    color: var(--p-text);
  }
  .id {
    color: var(--p-text-muted);
    font-family: var(--p-mono);
    font-weight: 600;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    font-size: 11px;
    color: var(--p-text-muted);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--p-success);
  }
  .free-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 16px;
    white-space: nowrap;
  }
  .free {
    font-size: 20px;
    font-weight: 800;
    color: var(--p-text);
  }
  .free-sub {
    font-size: 12px;
    color: var(--p-text-muted);
  }
</style>
