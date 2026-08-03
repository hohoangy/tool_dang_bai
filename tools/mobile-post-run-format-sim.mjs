const postRunActionLabels = {
  facebook_post_failed_post_submit_unverified: {
    title: 'Cần kiểm tra kết quả Facebook',
    detail: 'Đã tới bước Đăng nhưng chưa xác minh được kết quả. Tool không tự đăng lại để tránh trùng bài.'
  },
  instagram_post_failed_post_submit_unverified: {
    title: 'Cần kiểm tra kết quả Instagram',
    detail: 'Đã tới bước Share nhưng chưa xác minh được kết quả. Tool không tự đăng lại để tránh trùng bài.'
  },
  instagram_post_failed: {
    title: 'Đăng Instagram thất bại',
    detail: 'Workflow dừng vì Instagram hoặc LDPlayer trả lỗi trong quá trình đăng.'
  }
};

const cases = [
  {
    name: 'instagram_post_submit_unverified_error_is_review',
    log: {
      action: 'instagram_post_failed_post_submit_unverified',
      level: 'error',
      message: 'Instagram đã tới bước gửi bài nhưng chưa xác minh được kết quả.',
      metadata: {
        category: 'post_submit_unverified',
        recoveryHint: 'Không tự đăng lại để tránh trùng bài.'
      }
    },
    expect: {
      tone: 'warn',
      badge: 'Cần kiểm tra',
      title: 'Cần kiểm tra kết quả Instagram'
    }
  },
  {
    name: 'facebook_post_submit_unverified_error_is_review',
    log: {
      action: 'facebook_post_failed_post_submit_unverified',
      level: 'error',
      message: 'Facebook đã tới bước Đăng nhưng chưa xác minh được kết quả.',
      metadata: {
        category: 'post_submit_unverified',
        recoveryHint: 'Không tự đăng lại để tránh trùng bài.'
      }
    },
    expect: {
      tone: 'warn',
      badge: 'Cần kiểm tra',
      title: 'Cần kiểm tra kết quả Facebook'
    }
  },
  {
    name: 'ordinary_error_stays_error',
    log: {
      action: 'instagram_post_failed',
      level: 'error',
      message: 'Instagram lỗi trước khi đăng.',
      metadata: {
        category: 'publish_failed'
      }
    },
    expect: {
      tone: 'error',
      badge: 'Lỗi',
      title: 'Đăng Instagram thất bại'
    }
  }
];

const failed = [];
for (const item of cases) {
  const actual = formatPostRunSimulation(item.log);
  const errors = [];
  for (const [key, value] of Object.entries(item.expect)) {
    if (actual[key] !== value) errors.push(`${key}:expected=${value}:actual=${actual[key]}`);
  }
  if (errors.length) failed.push({ name: item.name, errors, actual });
  console.log(`${errors.length ? 'FAIL' : 'PASS'} ${item.name}`);
}

console.log(JSON.stringify({ total: cases.length, pass: cases.length - failed.length, fail: failed.length }, null, 2));
if (failed.length) {
  console.log(JSON.stringify(failed, null, 2));
  process.exitCode = 1;
}

function formatPostRunSimulation(log) {
  const mapped = postRunActionLabels[log.action];
  const detail = log.metadata?.recoveryHint || log.message || mapped?.detail || 'Tool vừa ghi nhận một bước trong workflow đăng bài.';
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
