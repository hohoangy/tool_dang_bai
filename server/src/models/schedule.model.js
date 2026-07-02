import { Post } from './post.model.js';
import { createModel, toMysqlDate } from './mysql-model.js';

export const Schedule = createModel({
  table: 'schedules',
  fieldMap: {
    _id: 'id',
    userId: 'user_id',
    postId: 'post_id',
    runAt: 'run_at',
    lastError: 'last_error',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  normalize(data) {
    return {
      id: data._id,
      user_id: data.userId,
      post_id: typeof data.postId === 'object' ? data.postId._id : data.postId,
      platform: data.platform,
      run_at: toMysqlDate(data.runAt),
      status: data.status || 'queued',
      attempts: data.attempts || 0,
      last_error: data.lastError || null,
      created_at: data.createdAt,
      updated_at: data.updatedAt
    };
  },
  hydrate(row) {
    return {
      _id: row.id,
      id: row.id,
      userId: row.user_id,
      postId: row.post_id,
      platform: row.platform,
      runAt: row.run_at,
      status: row.status,
      attempts: row.attempts,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },
  async populate(rows, field) {
    if (field !== 'postId') return rows;
    const postIds = Array.from(new Set(
      rows
        .map((schedule) => typeof schedule.postId === 'object' ? schedule.postId?._id : schedule.postId)
        .filter(Boolean)
    ));
    if (!postIds.length) return rows;

    const posts = await Post.find({ _id: { $in: postIds } });
    const postsById = new Map(posts.map((post) => [post._id, post]));
    return rows.map((schedule) => {
      const postId = typeof schedule.postId === 'object' ? schedule.postId?._id : schedule.postId;
      schedule.postId = postsById.get(postId) || null;
      return schedule;
    });
  }
});
