process.env.NO_DB = process.env.NO_DB || 'true';

const { classifyMobilePublishError } = await import('../server/src/modules/mobile/mobile.routes.js');

const cases = [
  {
    name: 'instagram_pre_submit_gate_is_retryable_before_share',
    platform: 'instagram',
    error: new Error('pre_submit_gate_failed: shareButtonOk=false mediaOk=false'),
    expect: {
      code: 'INSTAGRAM_PRE_SUBMIT_BLOCKED',
      category: 'pre_submit_gate',
      retryable: true,
      action: 'instagram_post_pre_submit_gate_failed'
    }
  },
  {
    name: 'instagram_post_submit_unverified_is_not_retryable',
    platform: 'instagram',
    error: new Error('still_on_share_screen after Share'),
    expect: {
      code: 'INSTAGRAM_POST_SUBMIT_UNVERIFIED',
      category: 'post_submit_unverified',
      retryable: false,
      action: 'instagram_post_failed_post_submit_unverified'
    }
  },
  {
    name: 'facebook_caption_text_does_not_use_instagram_pre_submit_branch',
    platform: 'facebook',
    error: new Error('caption_not_verified'),
    expect: {
      code: 'FACEBOOK_PUBLISH_FAILED',
      category: 'publish_failed',
      retryable: true,
      action: 'facebook_post_failed'
    }
  },
  {
    name: 'facebook_post_submit_unverified_is_not_retryable',
    platform: 'facebook',
    error: new Error('Đã bấm Đăng nhưng chưa xác nhận Facebook đã nhận bài. published_post_evidence_pending'),
    expect: {
      code: 'FACEBOOK_POST_SUBMIT_UNVERIFIED',
      category: 'post_submit_unverified',
      retryable: false,
      action: 'facebook_post_failed_post_submit_unverified'
    }
  },
  {
    name: 'ldplayer_adb_bridge_closed_is_preflight_not_retryable',
    platform: 'instagram',
    error: new Error('LDPlayer đang chạy nhưng chưa mở cổng ADB localhost. cannot connect to 127.0.0.1:5555 actively refused it. (10061)'),
    expect: {
      code: 'LDPLAYER_ADB_BRIDGE_UNAVAILABLE',
      category: 'ldplayer_adb_preflight',
      retryable: false,
      action: 'instagram_post_failed_ld_adb_bridge'
    }
  }
];

const failed = [];
for (const item of cases) {
  const actual = classifyMobilePublishError(item.error, item.platform, item.context || {});
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
