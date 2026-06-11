import type { Logger } from '../logger'

/** Input that funnels uncaught errors and unhandled rejections into the logger's
 *  `error` scope. Returns an uninstall function. */
export function captureErrors(logger: Logger): () => void {
  const onError = (ev: ErrorEvent) => {
    logger.error('error', ev.message, ev.error ?? '')
  }
  const onRejection = (ev: Event & { reason?: unknown }) => {
    logger.error('error', 'unhandledrejection', ev.reason)
  }
  addEventListener('error', onError)
  addEventListener('unhandledrejection', onRejection as EventListener)
  return () => {
    removeEventListener('error', onError)
    removeEventListener('unhandledrejection', onRejection as EventListener)
  }
}
