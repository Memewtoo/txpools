<script setup lang="ts">
import AppNavbar from './components/AppNavbar.vue'
</script>

<template>
  <div class="min-h-screen bg-background text-[#e1e2eb]">
    <AppNavbar />
    <main class="mx-auto max-w-app px-4 pb-20 pt-24 sm:px-6 lg:px-8">
      <RouterView />
    </main>
  </div>
</template>
