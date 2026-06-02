<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Sparkles } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const email = ref('creator@example.com');
const password = ref('password123');
const error = ref('');

async function submit() {
  error.value = '';
  try {
    await auth.login(email.value, password.value);
    router.push('/');
  } catch (err) {
    error.value = err.message;
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-white p-4 dark:bg-zinc-950">
    <section class="panel w-full max-w-md p-6">
      <div class="mb-8 flex items-center gap-3">
        <div class="grid h-12 w-12 place-items-center rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
          <Sparkles class="h-6 w-6" />
        </div>
        <div>
          <h1 class="text-2xl font-extrabold">SocialPilot AI</h1>
          <p class="text-zinc-500">Đăng nhập vào không gian sáng tạo của bạn.</p>
        </div>
      </div>
      <form class="space-y-4" @submit.prevent="submit">
        <input v-model="email" class="field" type="email" placeholder="Email" />
        <input v-model="password" class="field" type="password" placeholder="Mật khẩu" />
        <p v-if="error" class="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{{ error }}</p>
        <button class="btn-primary w-full" :disabled="auth.loading">Đăng nhập</button>
      </form>
    </section>
  </main>
</template>
