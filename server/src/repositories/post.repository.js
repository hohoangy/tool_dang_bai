import { Post } from '../models/post.model.js';

export const postRepository = {
  create(data) {
    return Post.create(data);
  },
  findByUser(userId, filters = {}) {
    return Post.find({ userId, ...filters }).sort({ scheduledAt: 1, createdAt: -1 });
  },
  findByIdForUser(id, userId) {
    return Post.findOne({ _id: id, userId });
  },
  update(id, data) {
    return Post.findByIdAndUpdate(id, data, { new: true });
  },
  count(userId, filters = {}) {
    return Post.countDocuments({ userId, ...filters });
  }
};
