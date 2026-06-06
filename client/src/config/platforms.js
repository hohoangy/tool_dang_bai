import { Facebook, Play, Plus, Youtube } from 'lucide-vue-next';

export const publishingPlatforms = [
  {
    id: 'x',
    name: 'X.com',
    shortName: 'X',
    accountLabel: 'Tài khoản X',
    previewLabel: 'X.com preview',
    charLimit: 280,
    icon: Plus,
    accent: 'text-sky-500',
    bg: 'bg-sky-500',
    capability: 'Text posts, threads, scheduling'
  },
  {
    id: 'facebook',
    name: 'Facebook Page',
    shortName: 'Facebook',
    accountLabel: 'Trang Facebook',
    previewLabel: 'Facebook Page preview',
    charLimit: 2200,
    icon: Facebook,
    accent: 'text-blue-600',
    bg: 'bg-blue-600',
    capability: 'Page posts, photos, scheduling'
  },
  {
    id: 'youtube',
    name: 'YouTube',
    shortName: 'YouTube',
    accountLabel: 'Kênh YouTube',
    previewLabel: 'YouTube community preview',
    charLimit: 5000,
    icon: Youtube,
    accent: 'text-red-500',
    bg: 'bg-red-500',
    capability: 'Community posts, video workflow'
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    shortName: 'TikTok',
    accountLabel: 'Tài khoản TikTok',
    previewLabel: 'TikTok caption preview',
    charLimit: 2200,
    icon: Play,
    accent: 'text-zinc-100',
    bg: 'bg-zinc-950',
    capability: 'Caption planning, mobile fallback'
  }
];

export const platformMap = publishingPlatforms.reduce((map, platform) => {
  map[platform.id] = platform;
  return map;
}, {});
