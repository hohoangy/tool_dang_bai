export const maxPhotos = 4;
export const maxInstagramAlbumPhotos = 10;
export const maxVideoSizeMb = 100;
export const draftStorageKey = 'socialpilot-platform-composer-drafts';
export const platformDraftStoragePrefix = `${draftStorageKey}-`;
export const composerReviewResultStoragePrefix = 'socialpilot-composer-review-result';
export const composerReviewResultTtlMs = 6 * 60 * 60 * 1000;
export const runtimeStatusIntervalMs = 15_000;
export const runtimeStatusMissLimit = 3;
export const exclusiveLdSessionEnabled = true;
export const ldSafeDelaySeconds = 15;

export const platforms = [
  {
    id: 'facebook',
    label: 'Facebook',
    iconLabel: 'f',
    iconClass: 'bg-[#1877F2] text-white',
    packageName: 'com.facebook.katana',
    status: 'ready',
    description: 'Mo composer, nhap text, gan anh va dang truc tiep bang Facebook app trong LDPlayer.'
  },
  {
    id: 'instagram',
    label: 'Instagram',
    iconLabel: '◎',
    iconClass: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white',
    packageName: 'com.instagram.android',
    status: 'ready',
    description: 'Dang anh don hoac album qua Instagram app trong LDPlayer.'
  }
];

export const composerTabs = [
  { id: 'compose', label: 'Soạn' },
  { id: 'preview', label: 'Xem trước' },
  { id: 'queue', label: 'Bài đã lưu' }
];

export const emojiGroups = [
  {
    label: 'Da dung gan day',
    items: ['🤣', '😍', '😊', '😌', '😇', '😀', '😂', '☘️']
  },
  {
    label: 'Mat cuoi va hinh nguoi',
    items: ['😀', '😃', '😁', '😄', '😆', '🥺', '😅', '😂', '🤣', '🥲', '☺️', '😊', '😇', '🙂', '🙃', '😉', '😔', '😍', '🥰', '😘', '😗', '😙', '😚', '😋']
  },
  {
    label: 'Cam xuc pho bien',
    items: ['👍', '👏', '🙏', '💪', '🔥', '✨', '❤️', '💙', '💚', '💛', '🎉', '✅', '📌', '📷', '🚀', '⭐']
  }
];

export const photoLayouts = [
  { id: 'grid', label: 'Lưới đều', description: 'Các ảnh có kích thước cân bằng' },
  { id: 'focus-first', label: 'Ưu tiên ảnh đầu', description: 'Ảnh đầu lớn ở bên trái' },
  { id: 'hero-top', label: 'Ảnh đầu phía trên', description: 'Ảnh đầu trải rộng phía trên' }
];

export const scheduleQuickOptions = [
  { label: '+30 phút', minutes: 30 },
  { label: '+1 giờ', minutes: 60 },
  { label: 'Tối nay', preset: 'tonight' },
  { label: 'Sáng mai', preset: 'tomorrow-morning' }
];

export const publishModes = [
  {
    id: 'direct',
    title: 'Đăng ngay',
    icon: 'zap',
    description: 'Kiểm tra thiết bị, mở app và bấm đăng tự động cho profile đang chọn.'
  },
  {
    id: 'review',
    title: 'Mở composer để kiểm tra',
    icon: 'shield',
    description: 'Chế độ an toàn cho LDPlayer: nhập nội dung/media, chụp màn hình kiểm tra rồi tự tắt LD.'
  },
  {
    id: 'bulk',
    title: 'Đăng hàng loạt',
    icon: 'users',
    description: 'Đăng tuần tự qua nhiều LDPlayer profile, có delay giữa mỗi lượt.'
  },
  {
    id: 'schedule',
    title: 'Lên lịch',
    icon: 'timer',
    description: 'Lưu thời gian đăng, nội dung và profile để theo dõi theo lịch.'
  }
];
