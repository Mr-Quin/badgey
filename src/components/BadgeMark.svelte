<script lang="ts">
  // The app's logo: a graphite bezel around a dark glass screen with two stripes.
  let { size = 40 }: { size?: number } = $props()
</script>

<div
  class="mark"
  style="width: {size}px; height: {size}px; padding: {Math.max(2, Math.round(size * 0.075))}px"
  aria-hidden="true"
>
  <div class="screen"><span class="s1"></span><span class="s2"></span></div>
</div>

<style>
  .mark {
    flex: none;
    border-radius: 50%;
    background: linear-gradient(145deg, #74747c, #26262b);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.3),
      0 6px 16px -8px rgba(12, 11, 17, 0.6);
  }
  .screen {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    overflow: hidden;
    background: linear-gradient(160deg, #3a3340, #0e0b12);
  }
  .s1,
  .s2 {
    position: absolute;
    left: -15%;
    width: 130%;
    transform: rotate(-28deg);
  }
  .s1 {
    top: 18%;
    height: 13%;
    background: rgba(255, 255, 255, 0.62);
    border-radius: 4px;
  }
  .s2 {
    top: 40%;
    height: 6%;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
  }
</style>
