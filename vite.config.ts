import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { devLog } from './tools/vite-devlog'

export default defineConfig({ plugins: [svelte(), devLog()] })
