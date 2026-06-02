import { defineStore } from 'pinia';
import { http } from '../api/http';

export const usePostsStore = defineStore('posts', {
  state: () => ({
    posts: [],
    generated: [],
    loading: false,
    error: null
  }),
  actions: {
    async fetchPosts(status) {
      this.loading = true;
      try {
        const { data } = await http.get('/posts', { params: status ? { status } : {} });
        this.posts = data.posts;
      } finally {
        this.loading = false;
      }
    },
    async generate(payload) {
      this.loading = true;
      try {
        const { data } = await http.post('/generate-content', payload);
        this.generated = data.items;
        return data.items;
      } finally {
        this.loading = false;
      }
    },
    async schedule(payload) {
      const { data } = await http.post('/schedule-post', payload);
      this.posts.unshift(data.post);
      return data.post;
    },
    async publish(postId) {
      const { data } = await http.post('/publish-post', { postId });
      return data.post;
    }
  }
});
