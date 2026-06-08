import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import AppLayout from '../layouts/AppLayout.vue';
import LoginView from '../views/LoginView.vue';
import MobileLabView from '../views/MobileLabView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView },
    {
      path: '/',
      component: AppLayout,
      meta: { auth: true },
      children: [
        { path: '', redirect: '/mobile-lab' },
        { path: 'mobile-lab', name: 'mobile-lab', component: MobileLabView },
        { path: ':pathMatch(.*)*', redirect: '/mobile-lab' }
      ]
    }
  ]
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.auth && !auth.token) return '/login';
  if (to.path === '/login' && auth.token) return '/';
});

export default router;
