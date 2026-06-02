import { defineStore } from 'pinia';

export const useUiStore = defineStore('ui', {
  state: () => ({
    dark: localStorage.getItem('theme') === 'dark',
    toast: null
  }),
  actions: {
    applyTheme() {
      document.documentElement.classList.toggle('dark', this.dark);
    },
    toggleDark() {
      this.dark = !this.dark;
      localStorage.setItem('theme', this.dark ? 'dark' : 'light');
      this.applyTheme();
    },
    notify(message, type = 'success') {
      this.toast = { message, type };
      window.setTimeout(() => {
        this.toast = null;
      }, 3200);
    }
  }
});
