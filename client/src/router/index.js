import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import AppLayout from '../layouts/AppLayout.vue';
import LoginView from '../views/LoginView.vue';
import DashboardView from '../views/DashboardView.vue';
import CreatePostView from '../views/CreatePostView.vue';
import PostsView from '../views/PostsView.vue';
import AiGeneratorView from '../views/AiGeneratorView.vue';
import PlatformsView from '../views/PlatformsView.vue';
import CommentsView from '../views/CommentsView.vue';
import AnalyticsView from '../views/AnalyticsView.vue';
import SettingsView from '../views/SettingsView.vue';
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
        { path: '', name: 'dashboard', component: DashboardView },
        { path: 'create', name: 'create', component: CreatePostView },
        { path: 'scheduled', name: 'scheduled', component: PostsView, props: { status: 'scheduled' } },
        { path: 'published', name: 'published', component: PostsView, props: { status: 'published' } },
        { path: 'ai-generator', name: 'ai-generator', component: AiGeneratorView },
        { path: 'platforms', name: 'platforms', component: PlatformsView },
        { path: 'comments', name: 'comments', component: CommentsView },
        { path: 'mobile-lab', name: 'mobile-lab', component: MobileLabView },
        { path: 'analytics', name: 'analytics', component: AnalyticsView },
        { path: 'settings', name: 'settings', component: SettingsView }
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
