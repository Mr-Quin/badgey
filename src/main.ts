import { mount } from 'svelte'
import './sakura.css'
import './app.css'
import './lib/stores/theme' // side-effect: apply the persisted theme on load
import './lib/log' // side-effect: build the app logger (DEV: console + dev-log file, error capture)
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
