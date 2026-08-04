export const postRunActionLabels = {
  facebook_post_finished: {
    title: 'Đã hoàn tất thao tác đăng',
    detail: 'Tool đã đi hết workflow đăng bài.'
  },
  facebook_post_submit_verified: {
    title: 'Đã xác minh Facebook nhận bài',
    detail: 'Facebook trả tín hiệu xác nhận sau khi bấm Đăng.'
  },
  facebook_post_submit_unverified: {
    title: 'Chưa xác minh được bài đăng',
    detail: 'Đã bấm Đăng nhưng chưa thấy tín hiệu xác nhận từ Facebook.'
  },
  facebook_post_submit_waiting: {
    title: 'Đang chờ Facebook phản hồi',
    detail: 'Facebook đang xử lý sau thao tác đăng.'
  },
  facebook_post_media_uploading: {
    title: 'Đang tải ảnh lên Facebook',
    detail: 'Giữ Facebook hoạt động cho đến khi quá trình tải hoàn tất.'
  },
  facebook_post_submit_still_in_composer: {
    title: 'Facebook chưa nhận thao tác đăng',
    detail: 'Nút Đăng vẫn còn hiển thị; bài chưa được gửi.'
  },
  facebook_post_video_upload_reverted: {
    title: 'Facebook từ chối tải video',
    detail: 'Facebook đã bắt đầu tải nhưng quay lại màn soạn bài. Hãy thử lại hoặc kiểm tra video/mạng.'
  },
  facebook_native_multi_image_unsupported: {
    title: 'Nhiều ảnh native không hỗ trợ',
    detail: 'Facebook trên LDPlayer không ổn định với SEND_MULTIPLE; tool sẽ dùng 1 ảnh collage cho nhiều ảnh.'
  },
  facebook_post_submit_blocked: {
    title: 'Facebook bị chặn bởi checkpoint',
    detail: 'Facebook yêu cầu đăng nhập hoặc xác minh thêm.'
  },
  facebook_post_state_machine_pending: {
    title: 'Chưa tới được màn đăng bài',
    detail: 'Automation chưa đưa Facebook về đúng trạng thái.'
  },
  facebook_post_next_not_advancing: {
    title: 'Nút Tiếp không chuyển màn',
    detail: 'Facebook không phản hồi sau nhiều lần bấm Tiếp; tool đã dừng để tránh lặp thao tác.'
  },
  facebook_post_composer_editor_not_opening: {
    title: 'Composer không mở editor',
    detail: 'Facebook hoặc System UI không phản hồi khi mở editor nhập nội dung.'
  },
  facebook_post_image_attach_failed: {
    title: 'Gắn ảnh chưa thành công',
    detail: 'Tool chưa xác nhận được ảnh trong composer.'
  },
  facebook_post_failed_auth_required: {
    title: 'Facebook cần xác minh tài khoản',
    detail: 'Cần xử lý login/checkpoint trong LDPlayer trước khi đăng tiếp.'
  },
  facebook_post_failed_ld_unstable: {
    title: 'LDPlayer/ADB chưa ổn định',
    detail: 'Tool đã dừng để tránh đăng sai. Restart LDPlayer hoặc chờ ADB ổn định rồi chạy lại.'
  },
  facebook_post_failed_ld_adb_bridge: {
    title: 'LDPlayer chưa mở ADB bridge',
    detail: 'LDPlayer đã chạy nhưng chưa có cổng ADB để tool điều khiển. Mở LD thủ công tới Home và kiểm tra ADB Debugging.'
  },
  facebook_post_failed_gallery_selection: {
    title: 'Gallery chưa xác nhận ảnh',
    detail: 'Facebook chưa ghi nhận đủ ảnh đã chọn; tool dừng để tránh bấm lặp.'
  },
  facebook_post_failed_media_attach: {
    title: 'Media chưa gắn vào composer',
    detail: 'Facebook chưa xác nhận media xuất hiện trong bài soạn.'
  },
  facebook_post_failed_ui_state: {
    title: 'Facebook UI chưa ổn định',
    detail: 'Tool chưa nhận diện được màn hình an toàn để tiếp tục.'
  },
  facebook_post_failed_post_submit_unverified: {
    title: 'Cần kiểm tra kết quả Facebook',
    detail: 'Đã tới bước Đăng nhưng chưa xác minh được kết quả. Tool không tự đăng lại để tránh trùng bài.'
  },
  facebook_post_image_attached: {
    title: 'Ảnh đã sẵn sàng',
    detail: 'Ảnh đã xuất hiện trong Facebook composer.'
  },
  facebook_post_wait_for_ui: {
    title: 'Đang chờ Facebook chuyển màn',
    detail: 'Tool đang đợi giao diện Facebook ổn định.'
  },
  facebook_post_state: {
    title: 'Đang đọc trạng thái Facebook',
    detail: 'Tool đang nhận diện màn hình hiện tại.'
  },
  facebook_post_failed: {
    title: 'Đăng thất bại',
    detail: 'Workflow dừng vì Facebook hoặc LDPlayer trả lỗi trong quá trình đăng.'
  },
  instagram_post_finished: {
    title: 'Đã hoàn tất thao tác Instagram',
    detail: 'Tool đã đi hết workflow đăng Instagram.'
  },
  instagram_post_submit_verified: {
    title: 'Đã xác minh Instagram nhận bài',
    detail: 'Instagram đã rời màn share sau khi bấm Share.'
  },
  instagram_post_submit_unverified: {
    title: 'Chưa xác minh được bài Instagram',
    detail: 'Đã bấm Share nhưng Instagram chưa rời màn đăng hoặc chưa trả tín hiệu đã chia sẻ.'
  },
  instagram_post_submit_waiting: {
    title: 'Instagram đang xử lý',
    detail: 'Instagram đang tải/chia sẻ bài sau khi bấm Share.'
  },
  instagram_post_caption_missing_before_submit: {
    title: 'Chưa nhập được caption',
    detail: 'Instagram đã rời màn soạn trước khi xác minh emoji/hashtag, tool đã dừng để tránh đăng thiếu nội dung.'
  },
  instagram_post_state_machine_pending: {
    title: 'Chưa tới được màn đăng Feed',
    detail: 'Automation chưa đưa Instagram về đúng trạng thái đăng trang cá nhân/feed.'
  },
  instagram_post_album_unsupported_fast_stop: {
    title: 'Album Instagram chưa hỗ trợ trên LD này',
    detail: 'Android trong LDPlayer không hỗ trợ SEND_MULTIPLE cho nhiều ảnh; tool đã dừng sớm để giữ ADB ổn định.'
  },
  instagram_post_album_native_failed: {
    title: 'Album Instagram chưa mở được',
    detail: 'Luồng Home/Create Album chưa ổn định trên LDPlayer hiện tại.'
  },
  instagram_post_failed_cleanup: {
    title: 'Đã dọn Instagram sau lỗi',
    detail: 'Tool đã force-stop Instagram và kiểm tra ADB để chuẩn bị cho lượt chạy tiếp theo.'
  },
  instagram_post_failed_auth_required: {
    title: 'Instagram cần xác minh tài khoản',
    detail: 'Cần xử lý login/checkpoint trong LDPlayer trước khi đăng tiếp.'
  },
  instagram_post_failed_ld_unstable: {
    title: 'LDPlayer/ADB chưa ổn định',
    detail: 'Tool đã dừng để tránh đăng sai. Restart LDPlayer hoặc chờ ADB ổn định rồi chạy lại.'
  },
  instagram_post_failed_ld_adb_bridge: {
    title: 'LDPlayer chưa mở ADB bridge',
    detail: 'LDPlayer đã chạy nhưng chưa có cổng ADB để tool điều khiển. Mở LD thủ công tới Home và kiểm tra ADB Debugging.'
  },
  instagram_post_failed_ui_state: {
    title: 'Instagram UI chưa ổn định',
    detail: 'Tool chưa nhận diện được màn hình an toàn để tiếp tục.'
  },
  instagram_post_pre_submit_gate_failed: {
    title: 'Chưa đủ điều kiện Share',
    detail: 'Tool đã dừng trước khi bấm Share vì composer Instagram chưa đạt đủ điều kiện an toàn.'
  },
  instagram_post_failed_post_submit_unverified: {
    title: 'Cần kiểm tra kết quả Instagram',
    detail: 'Đã tới bước Share nhưng chưa xác minh được kết quả. Tool không tự đăng lại để tránh trùng bài.'
  },
  instagram_post_state: {
    title: 'Đang đọc trạng thái Instagram',
    detail: 'Tool đang nhận diện màn hình hiện tại.'
  },
  instagram_post_failed: {
    title: 'Đăng Instagram thất bại',
    detail: 'Workflow dừng vì Instagram hoặc LDPlayer trả lỗi trong quá trình đăng.'
  }
};

const operationalPostRunActions = new Set([
  'facebook_post_finished',
  'facebook_post_submit_verified',
  'facebook_post_submit_unverified',
  'facebook_post_submit_blocked',
  'facebook_post_state_machine_pending',
  'facebook_post_next_not_advancing',
  'facebook_post_composer_editor_not_opening',
  'facebook_post_image_attach_failed',
  'facebook_post_video_upload_reverted',
  'facebook_native_multi_image_unsupported',
  'facebook_post_failed_auth_required',
  'facebook_post_failed_ld_unstable',
  'facebook_post_failed_ld_adb_bridge',
  'facebook_post_failed_gallery_selection',
  'facebook_post_failed_media_attach',
  'facebook_post_failed_ui_state',
  'facebook_post_failed_post_submit_unverified',
  'facebook_post_failed',
  'instagram_post_finished',
  'instagram_post_submit_verified',
  'instagram_post_submit_unverified',
  'instagram_post_caption_missing_before_submit',
  'instagram_post_state_machine_pending',
  'instagram_post_album_unsupported_fast_stop',
  'instagram_post_album_native_failed',
  'instagram_post_failed_cleanup',
  'instagram_post_failed_auth_required',
  'instagram_post_failed_ld_unstable',
  'instagram_post_failed_ld_adb_bridge',
  'instagram_post_failed_ui_state',
  'instagram_post_pre_submit_gate_failed',
  'instagram_post_failed_post_submit_unverified',
  'instagram_post_failed'
]);

export function isTechnicalPostRunNoise(log) {
  return String(log?.action || '').endsWith('_failed_ld_unstable')
    || log?.metadata?.category === 'ldplayer_unstable'
    || log?.metadata?.code === 'LDPLAYER_UNSTABLE';
}

export function isOperationalPostRunLog(log) {
  return operationalPostRunActions.has(String(log?.action || '')) && !isTechnicalPostRunNoise(log);
}

export function formatPostRun(log) {
  const mapped = postRunActionLabels[log.action];
  if (log.action === 'facebook_post_finished' && log.metadata?.autoSubmit === false) {
    return {
      title: 'Đã mở composer kiểm tra',
      detail: 'Tool đã mở composer, không bấm đăng. Ảnh kiểm tra được lưu ở khung trạng thái phía trên nếu phiên hiện tại có snapshot.',
      tone: 'ok',
      badge: 'Ổn'
    };
  }
  const detail = log.metadata?.recoveryHint || log.message || mapped?.detail || 'Tool vừa ghi nhận một bước trong workflow đăng bài.';
  if (log.action === 'facebook_post_finished' && log.level !== 'info') {
    return {
      title: 'Bài đăng chưa được xác minh',
      detail,
      tone: 'warn',
      badge: 'Cần kiểm tra'
    };
  }
  if (log.action === 'instagram_post_finished' && log.level !== 'info') {
    return {
      title: 'Bài Instagram chưa được xác minh',
      detail,
      tone: 'warn',
      badge: 'Cần kiểm tra'
    };
  }
  if (log.metadata?.category === 'post_submit_unverified' || String(log.action || '').endsWith('_failed_post_submit_unverified')) {
    return {
      title: mapped?.title || 'Cần kiểm tra kết quả đăng',
      detail,
      tone: 'warn',
      badge: 'Cần kiểm tra'
    };
  }
  return {
    title: mapped?.title || 'Cập nhật trạng thái đăng',
    detail,
    tone: log.level === 'error' ? 'error' : log.level === 'warn' ? 'warn' : 'ok',
    badge: log.level === 'error' ? 'Lỗi' : log.level === 'warn' ? 'Cần kiểm tra' : 'Ổn'
  };
}

export function formatTechnicalAction(log) {
  return postRunActionLabels[log.action]?.title
    || String(log.action || 'Cập nhật kỹ thuật')
      .replace(/^(facebook|instagram)_/, '')
      .replaceAll('_', ' ');
}
