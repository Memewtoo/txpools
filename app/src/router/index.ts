import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../pages/HomePage.vue'
import PoolsPage from '../pages/PoolsPage.vue'
import MatchDetailPage from '../pages/MatchDetailPage.vue'
import SettlementsPage from '../pages/SettlementsPage.vue'
import PortfolioPage from '../pages/PortfolioPage.vue'
import TrustPage from '../pages/TrustPage.vue'
import AdminPage from '../pages/AdminPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/pools', component: PoolsPage },
    { path: '/pools/:id', component: MatchDetailPage },
    { path: '/settlements', component: SettlementsPage },
    { path: '/portfolio', component: PortfolioPage },
    { path: '/trust', component: TrustPage },
    { path: '/admin', component: AdminPage },
  ],
})

export default router
