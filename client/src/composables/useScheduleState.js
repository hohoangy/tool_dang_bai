import { computed, ref } from 'vue';
import { defaultScheduleDateTime, toDateTimeLocal } from '../utils/composer-draft';

export function useScheduleState({ isScheduleMode, formatDate }) {
  const scheduleDateTime = ref(defaultScheduleDateTime());
  const minScheduleDateTime = computed(() => toDateTimeLocal(new Date(Date.now() + 60 * 1000)));
  const minScheduleDate = computed(() => minScheduleDateTime.value.slice(0, 10));
  const scheduleDate = computed({
    get: () => scheduleDateTime.value?.slice(0, 10) || minScheduleDate.value,
    set: (value) => {
      scheduleDateTime.value = value ? `${value}T${scheduleTime.value || '09:00'}` : '';
    }
  });
  const scheduleTime = computed({
    get: () => scheduleDateTime.value?.slice(11, 16) || '09:00',
    set: (value) => {
      scheduleDateTime.value = value ? `${scheduleDate.value || minScheduleDate.value}T${value}` : '';
    }
  });
  const scheduleTimestamp = computed(() => scheduleDateTime.value ? new Date(scheduleDateTime.value).getTime() : 0);
  const scheduleReady = computed(() => !isScheduleMode.value || (Number.isFinite(scheduleTimestamp.value) && scheduleTimestamp.value > Date.now()));
  const scheduleStatus = computed(() => {
    if (!isScheduleMode.value) return 'Không dùng lịch';
    if (!scheduleDateTime.value) return 'Chưa chọn thời gian đăng';
    if (!scheduleReady.value) return 'Thời gian đăng phải ở tương lai';
    return `Sẽ đăng lúc ${formatDate(scheduleDateTime.value)}`;
  });

  function applySchedulePreset(option) {
    const now = new Date();
    const target = new Date(now);

    if (option.minutes) {
      target.setTime(now.getTime() + option.minutes * 60 * 1000);
    } else if (option.preset === 'tonight') {
      target.setHours(20, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
    } else if (option.preset === 'tomorrow-morning') {
      target.setDate(target.getDate() + 1);
      target.setHours(9, 0, 0, 0);
    }

    target.setMinutes(Math.ceil(target.getMinutes() / 5) * 5, 0, 0);
    scheduleDateTime.value = toDateTimeLocal(target);
  }

  return {
    scheduleDateTime,
    minScheduleDateTime,
    minScheduleDate,
    scheduleDate,
    scheduleTime,
    scheduleTimestamp,
    scheduleReady,
    scheduleStatus,
    applySchedulePreset
  };
}
