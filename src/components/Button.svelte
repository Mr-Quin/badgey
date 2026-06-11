<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    variant = 'ghost',
    size = 'md',
    block = false,
    children,
    ...rest
  }: {
    variant?: 'primary' | 'ghost' | 'danger' | 'soft'
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    children: Snippet
    [key: string]: unknown
  } = $props()
</script>

<button type="button" class="btn {variant} {size}" class:block {...rest}
  >{@render children()}</button
>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid transparent;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    white-space: nowrap;
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .block {
    width: 100%;
  }

  .sm {
    height: 30px;
    padding: 0 11px;
    font-size: 12px;
    border-radius: 8px;
  }
  .md {
    height: 40px;
    padding: 0 14px;
    font-size: 13px;
    border-radius: 10px;
  }
  .lg {
    height: 48px;
    padding: 0 18px;
    font-size: 14px;
    font-weight: 800;
    border-radius: 11px;
  }

  .ghost {
    background: transparent;
    border-color: var(--p-divider);
    color: var(--p-text);
  }
  .ghost:hover:not(:disabled) {
    background: var(--p-action-hover);
  }
  .primary {
    background: var(--p-primary);
    color: var(--p-on-primary);
    font-weight: 800;
    box-shadow: 0 10px 22px -10px var(--p-action-focus);
  }
  .primary:hover:not(:disabled) {
    background: var(--p-primary-hover);
  }
  .danger {
    background: var(--p-danger);
    color: #fff;
  }
  .soft {
    background: var(--p-primary-soft);
    color: var(--p-primary-ink);
  }
  .soft:hover:not(:disabled) {
    background: var(--p-action-selected);
  }
</style>
