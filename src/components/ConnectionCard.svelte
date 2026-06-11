<script lang="ts">
  import { connection, connectionLost, connectPhase, lastSeen, connect } from '../lib/stores/badge'
  import DeviceCard from './DeviceCard.svelte'
  import BadgeMark from './BadgeMark.svelte'
  import Button from './Button.svelte'

  const supported = typeof navigator !== 'undefined' && 'bluetooth' in navigator

  const phaseTitle = {
    requesting: 'Waiting for you to pick a badge…',
    linking: 'Opening the Bluetooth link…',
    authenticating: 'Authenticating…',
    loading: 'Reading your badge…',
  }
  const connectingText = $derived($connectPhase ? phaseTitle[$connectPhase] : 'Connecting…')

  const everConnected = $derived($lastSeen !== null)
  const freeMB = $derived($lastSeen ? ($lastSeen.freeKB / 1024).toFixed(2) : '0')
  const seenName = $derived($lastSeen?.name ?? 'Badge')
  const seenId = $derived($lastSeen?.deviceId ? $lastSeen.deviceId.slice(0, 6) : '')

  async function onConnect() {
    try {
      await connect()
    } catch {
      // surfaced via connection state + error store
    }
  }
</script>

{#if !supported}
  <!-- Unsupported browser — shown in the rail; the editor stays visible alongside. -->
  <div class="card unsupported" data-testid="unsupported-notice">
    <div class="warn-icon" aria-hidden="true">⚠️</div>
    <div class="title">Needs Chrome or Edge</div>
    <p class="muted">
      Sending needs a Chromium browser like Chrome or Edge. You can still edit and save drafts here.
    </p>
  </div>
{:else if $connection === 'connected'}
  <DeviceCard />
{:else}
  <!-- Not connected: keep context. Greyed last-seen card if we've connected before. -->
  <div class="card" class:greyed={everConnected}>
    {#if everConnected}
      <div class="seen-head">
        <BadgeMark size={44} />
        <div class="meta">
          <div class="name">
            {seenName}{#if seenId}<span class="id"> · {seenId}</span>{/if}
          </div>
          <div class="dims">
            {$lastSeen?.display[0]} × {$lastSeen?.display[1]} · last seen {freeMB} MB free
          </div>
        </div>
        <span class="chip" class:err={$connection === 'error'}>
          {$connection === 'connecting'
            ? 'Reconnecting…'
            : $connection === 'error'
              ? "Couldn't connect"
              : 'Disconnected'}
        </span>
      </div>
    {:else}
      <div class="title">Connect a badge</div>
      <p class="muted">Put your badge in pairing mode, then connect and pick it from the list.</p>
    {/if}

    <div class="footer">
      {#if $connection === 'connecting'}
        <div class="connecting">
          <span class="spinner" aria-hidden="true"></span>
          <span>{connectingText}</span>
        </div>
      {:else}
        <Button variant="primary" block data-testid="connect-button" onclick={onConnect}>
          {everConnected
            ? 'Connect again'
            : $connection === 'error'
              ? 'Try again'
              : 'Connect a badge'}
        </Button>
      {/if}
    </div>

    {#if $connection === 'error'}
      <p class="muted err-note">
        {$connectionLost ? 'The badge disconnected.' : 'Could not connect. Try reloading the page.'}
      </p>
    {/if}
  </div>
{/if}

<style>
  .card {
    border: 1px solid var(--p-divider);
    border-radius: 16px;
    background: var(--p-paper);
    padding: 18px;
  }
  .card.greyed {
    background: var(--p-paper-alt);
  }
  .unsupported,
  .card:not(.greyed) {
    text-align: center;
  }
  .warn-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    margin: 0 auto 10px;
    background: var(--p-warning-soft);
    display: grid;
    place-items: center;
    font-size: 26px;
  }
  .title {
    font-size: 16px;
    font-weight: 800;
    color: var(--p-text);
  }
  .muted {
    font-size: 12px;
    color: var(--p-text-muted);
    line-height: 1.45;
    margin: 6px 0 0;
  }
  /* greyed last-seen head */
  .seen-head {
    display: flex;
    align-items: center;
    gap: 12px;
    opacity: 0.85;
  }
  .meta {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-size: 14px;
    font-weight: 800;
    color: var(--p-text);
  }
  .dims {
    font-size: 11px;
    color: var(--p-text-muted);
    font-family: var(--p-mono);
  }
  .chip {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--p-paper-alt);
    color: var(--p-text-muted);
    white-space: nowrap;
  }
  .card.greyed .chip {
    background: var(--p-paper);
  }
  .chip.err {
    background: var(--p-danger-soft);
    color: var(--p-danger-ink);
  }
  .footer {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }
  .id {
    color: var(--p-text-muted);
    font-family: var(--p-mono);
    font-weight: 600;
  }
  .connecting {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 700;
    color: var(--p-text);
    padding: 4px 0;
  }
  .spinner {
    width: 18px;
    height: 18px;
    flex: none;
    border-radius: 50%;
    border: 3px solid var(--p-primary-soft);
    border-top-color: var(--p-primary);
    animation: bdg-spin 0.9s linear infinite;
  }
  .err-note {
    margin-top: 10px;
  }
</style>
