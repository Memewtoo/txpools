import { computed, onMounted, ref, watch } from 'vue'
import { useWallet } from 'solana-wallets-vue'
import {
  TXPOOLS_BOOTSTRAP_ADMIN,
  txPoolsClient,
  type ConfigAccount,
} from '../services/txpools'

const config = ref<ConfigAccount>()
const loading = ref(false)
const error = ref<string>()
let loadPromise: Promise<void> | undefined

const loadConfig = async () => {
  if (loadPromise) return loadPromise

  loading.value = true
  error.value = undefined
  loadPromise = txPoolsClient
    .fetchConfig()
    .then((account) => {
      config.value = account
    })
    .catch((caught) => {
      error.value = caught instanceof Error ? caught.message : 'Unable to load TxPools config.'
    })
    .finally(() => {
      loading.value = false
      loadPromise = undefined
    })

  return loadPromise
}

export const useTxPoolsAdmin = () => {
  const wallet = useWallet()
  const connectedWallet = computed(() => wallet.publicKey.value)
  const configInitialized = computed(() => Boolean(config.value))
  const authorityAddress = computed(() => config.value?.admin ?? TXPOOLS_BOOTSTRAP_ADMIN)
  const isAuthority = computed(() => {
    if (!connectedWallet.value || !authorityAddress.value) return false
    return connectedWallet.value.equals(authorityAddress.value)
  })
  const canBootstrapConfig = computed(() => !config.value && Boolean(TXPOOLS_BOOTSTRAP_ADMIN))
  const gateReason = computed(() => {
    if (!connectedWallet.value) return 'Connect the authority wallet to access admin tools.'
    if (!authorityAddress.value) return 'Config is not initialized and VITE_TXPOOLS_BOOTSTRAP_ADMIN is not set.'
    if (!isAuthority.value) return 'Connected wallet does not match the TxPools authority.'
    return undefined
  })

  onMounted(() => void loadConfig())
  watch(connectedWallet, () => void loadConfig())

  return {
    wallet,
    connectedWallet,
    config,
    configInitialized,
    authorityAddress,
    isAuthority,
    canBootstrapConfig,
    gateReason,
    loading,
    error,
    refreshConfig: loadConfig,
  }
}
