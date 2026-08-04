import { computed } from 'vue';

export function useRuntimeStatusSummary({
  selectedRuntimeStatus,
  selectedAccount,
  selectedPlatform,
  facebookSessionAccountId,
  runtimeStatusMissCount,
  facebookOpening,
  queueRunning,
  posting,
  isReviewMode,
  facebookAppPackage,
  formatInstanceLabel
}) {
  const runtimeConfirmsFacebookApp = computed(() => Boolean(
    selectedRuntimeStatus.value?.deviceReady
    && selectedRuntimeStatus.value?.appReady
  ));
  const facebookRuntimeWaiting = computed(() => Boolean(
    selectedAccount.value?._id
    && facebookSessionAccountId.value === selectedAccount.value._id
    && runtimeStatusMissCount.value > 0
    && !runtimeConfirmsFacebookApp.value
  ));
  const facebookAppReady = computed(() => Boolean(
    selectedAccount.value?._id
    && (
      runtimeConfirmsFacebookApp.value
      || (
        facebookSessionAccountId.value === selectedAccount.value._id
        && !facebookRuntimeWaiting.value
      )
    )
  ));
  const facebookAppInForeground = computed(() => Boolean(
    selectedRuntimeStatus.value?.deviceReady
    && selectedRuntimeStatus.value?.appInForeground
  ));
  const facebookAppRunningInBackground = computed(() => Boolean(
    selectedRuntimeStatus.value?.deviceReady
    && selectedRuntimeStatus.value?.appProcessAlive
    && !selectedRuntimeStatus.value?.appInForeground
  ));
  const selectedDeviceReady = computed(() => Boolean(selectedRuntimeStatus.value?.deviceReady));
  const runtimeStatusDetail = computed(() => {
    if (selectedRuntimeStatus.value?.readinessSummary && !selectedRuntimeStatus.value?.appReady) return selectedRuntimeStatus.value.readinessSummary;
    if (facebookRuntimeWaiting.value) return `Đang chờ ${formatInstanceLabel(selectedAccount.value)} kết nối lại`;
    if (facebookAppInForeground.value) return `${selectedPlatform.value.label} đang mở trên màn hình ${formatInstanceLabel(selectedAccount.value)}`;
    if (facebookAppRunningInBackground.value) return `${selectedPlatform.value.label} đang chạy nền trong ${formatInstanceLabel(selectedAccount.value)}`;
    if (facebookAppReady.value) return `${selectedPlatform.value.label} đã được nhận diện trong ${formatInstanceLabel(selectedAccount.value)}`;
    if (!selectedDeviceReady.value) return `${formatInstanceLabel(selectedAccount.value)} chưa chạy hoặc ADB chưa kết nối`;
    const foregroundPackage = selectedRuntimeStatus.value?.foregroundPackage;
    if (foregroundPackage && foregroundPackage !== facebookAppPackage.value) {
      return `${formatInstanceLabel(selectedAccount.value)} đang mở ứng dụng khác`;
    }
    return `${selectedPlatform.value.label} chưa ở màn hình hoạt động`;
  });
  const facebookOpenButtonLabel = computed(() => {
    if (facebookOpening.value) return `Đang mở ${selectedPlatform.value.label}`;
    if (facebookAppReady.value) return `Đã mở ${selectedPlatform.value.label}`;
    return `Mở ${selectedPlatform.value.label}`;
  });
  const facebookActivityLabel = computed(() => {
    if (facebookOpening.value) return `Đang mở ${selectedPlatform.value.label}`;
    if (queueRunning.value) return 'Đang đăng bài lên nhiều tài khoản';
    if (posting.value && isReviewMode.value) return `Đang mở ${selectedPlatform.value.label} để kiểm tra`;
    if (posting.value) return `Đang đăng bài lên ${selectedPlatform.value.label}`;
    return '';
  });
  const showFacebookActivityOverlay = computed(() => facebookOpening.value || posting.value || queueRunning.value);
  const facebookSessionStatusLabel = computed(() => {
    if (facebookRuntimeWaiting.value) return `Đang chờ ${formatInstanceLabel(selectedAccount.value)}`;
    if (facebookAppInForeground.value) return `Đang mở ${selectedPlatform.value.label}`;
    if (facebookAppRunningInBackground.value) return `${selectedPlatform.value.label} chạy nền`;
    return facebookAppReady.value ? `Đã nhận diện ${selectedPlatform.value.label}` : `Chưa mở ${selectedPlatform.value.label}`;
  });

  return {
    runtimeConfirmsFacebookApp,
    facebookRuntimeWaiting,
    facebookAppReady,
    facebookAppInForeground,
    facebookAppRunningInBackground,
    selectedDeviceReady,
    runtimeStatusDetail,
    facebookOpenButtonLabel,
    facebookActivityLabel,
    showFacebookActivityOverlay,
    facebookSessionStatusLabel
  };
}
