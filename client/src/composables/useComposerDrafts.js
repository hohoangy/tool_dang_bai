import { computed, ref } from 'vue';
import {
  buildDraftFingerprint,
  getDraftContentType,
  getPlatformDraftStorageKey,
  normalizeTextFormatArtifacts
} from '../utils/composer-draft';
import { draftStorageKey } from '../config/mobile-lab';

export function useComposerDrafts({
  post,
  selectedPlatformId,
  facebookPostType,
  photoLayout,
  finalPostText,
  isFacebookVideoMode,
  selectedAccount,
  selectedAccountLabel,
  formatDate,
  notify
}) {
  const drafts = ref([]);
  const editingDraftId = ref('');

  const currentDraftFingerprint = computed(() => buildDraftFingerprint({
    platform: selectedPlatformId.value,
    facebookPostType: facebookPostType.value,
    text: finalPostText.value.trim(),
    media: post.media
  }));
  const editingDraft = computed(() => drafts.value.find((draft) => draft.id === editingDraftId.value) || null);
  const duplicateDraft = computed(() => drafts.value.find((draft) => (
    draft.status === 'draft'
    && draft.id !== editingDraftId.value
    && buildDraftFingerprint(draft) === currentDraftFingerprint.value
  )));
  const editingDraftUnchanged = computed(() => {
    if (!editingDraft.value) return false;
    const savedTitle = String(editingDraft.value.managementTitle || '').trim();
    return buildDraftFingerprint(editingDraft.value) === currentDraftFingerprint.value
      && savedTitle === String(post.title || '').trim();
  });
  const draftAlreadySaved = computed(() => Boolean(
    finalPostText.value.trim()
    && (duplicateDraft.value || editingDraftUnchanged.value)
  ));
  const imageTextDrafts = computed(() => drafts.value.filter((draft) => getDraftContentType(draft) === 'imageText'));
  const videoDrafts = computed(() => drafts.value.filter((draft) => getDraftContentType(draft) === 'video'));
  const scheduledDrafts = computed(() => drafts.value
    .filter((draft) => draft.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledFor || a.createdAt) - new Date(b.scheduledFor || b.createdAt)));

  function loadDrafts() {
    try {
      const platformKey = getPlatformDraftStorageKey(selectedPlatformId.value);
      const platformRaw = window.localStorage.getItem(platformKey);
      const legacyRaw = window.localStorage.getItem(draftStorageKey);
      const platformDrafts = platformRaw ? JSON.parse(platformRaw) : null;
      const legacyDrafts = legacyRaw ? JSON.parse(legacyRaw) : [];
      const storedDrafts = Array.isArray(platformDrafts)
        ? platformDrafts
        : (Array.isArray(legacyDrafts)
          ? legacyDrafts.filter((draft) => (draft.platform || 'facebook') === selectedPlatformId.value)
          : []);
      drafts.value = Array.isArray(storedDrafts)
        ? storedDrafts.map((draft) => ({
          ...draft,
          platform: draft.platform || selectedPlatformId.value,
          facebookPostType: getDraftContentType(draft),
          media: Array.isArray(draft.media) ? draft.media.filter((item) => item?.uploadedUrl || item?.url) : []
        }))
        : [];
      if (!platformRaw && drafts.value.length) persistDrafts();
    } catch {
      drafts.value = [];
    }
  }

  function persistDrafts() {
    window.localStorage.setItem(
      getPlatformDraftStorageKey(selectedPlatformId.value),
      JSON.stringify(drafts.value.slice(0, 20))
    );
  }

  function saveDraft(status = 'draft', options = {}) {
    if (!finalPostText.value.trim()) {
      notify('Chưa có nội dung để lưu nháp.', 'error');
      return null;
    }
    if (status === 'draft' && duplicateDraft.value) {
      notify('Bài viết này đã có trong danh sách Bài đã lưu.', 'error');
      return null;
    }
    if (status === 'draft' && editingDraftUnchanged.value) {
      notify('Bài viết chưa có thay đổi mới để cập nhật.', 'error');
      return null;
    }

    const existingDraft = status === 'draft'
      ? drafts.value.find((item) => item.id === editingDraftId.value)
      : null;
    const now = new Date().toISOString();
    const customTitle = String(post.title || '').trim();
    const draft = {
      id: existingDraft?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: status === 'scheduled'
        ? (customTitle || `Lịch đăng ${formatDate(options.scheduledFor)}`)
        : (customTitle || `Bài nháp ${new Date().toLocaleString('vi-VN')}`),
      managementTitle: customTitle,
      type: isFacebookVideoMode.value ? 'video' : 'photo',
      text: finalPostText.value.trim(),
      rawText: normalizeTextFormatArtifacts(post.text),
      hashtags: post.hashtags,
      mediaCount: post.media.length,
      media: post.media.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        uploadedUrl: item.uploadedUrl,
        mimeType: item.mimeType,
        size: item.size
      })).filter((item) => item.uploadedUrl),
      platform: selectedPlatformId.value,
      facebookPostType: facebookPostType.value,
      photoLayout: photoLayout.value,
      status,
      createdAt: existingDraft?.createdAt || now,
      updatedAt: now,
      scheduledFor: options.scheduledFor || null,
      targetAccountId: options.targetAccountId || selectedAccount.value?._id || null,
      targetAccountLabel: options.targetAccountLabel || selectedAccountLabel.value
    };
    drafts.value = [draft, ...drafts.value.filter((item) => item.id !== draft.id)].slice(0, 20);
    if (status === 'draft') editingDraftId.value = draft.id;
    persistDrafts();
    if (status !== 'scheduled') notify(existingDraft ? 'Đã cập nhật bài đã lưu.' : 'Đã lưu bài viết.');
    return draft;
  }

  function deleteDraft(draftId) {
    drafts.value = drafts.value.filter((draft) => draft.id !== draftId);
    if (editingDraftId.value === draftId) editingDraftId.value = '';
    persistDrafts();
    notify('Đã xóa nháp.');
  }

  function duplicateComposer() {
    return saveDraft('draft');
  }

  return {
    drafts,
    editingDraftId,
    currentDraftFingerprint,
    editingDraft,
    duplicateDraft,
    editingDraftUnchanged,
    draftAlreadySaved,
    imageTextDrafts,
    videoDrafts,
    scheduledDrafts,
    loadDrafts,
    persistDrafts,
    saveDraft,
    deleteDraft,
    duplicateComposer
  };
}
