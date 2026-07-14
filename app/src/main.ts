import './polyfills'
import { createApp } from 'vue'
import './style.css'
import 'solana-wallets-vue/styles.css'
import SolanaWallets from 'solana-wallets-vue'
import App from './App.vue'
import router from './router'

createApp(App)
  .use(SolanaWallets, {
    wallets: [],
    autoConnect: true,
    cluster: import.meta.env.VITE_TXPOOLS_CLUSTER === 'mainnet-beta' ? 'mainnet-beta' : 'devnet',
  })
  .use(router)
  .mount('#app')
