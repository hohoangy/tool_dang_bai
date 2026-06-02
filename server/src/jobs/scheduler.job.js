import cron from 'node-cron';
import { Schedule } from '../models/schedule.model.js';
import { Post } from '../models/post.model.js';
import { publishPostToPlatform } from '../services/social/publisher.service.js';
import { Log } from '../models/log.model.js';

export function startScheduler() {
  cron.schedule('* * * * *', async () => {
    const due = await Schedule.find({
      status: 'queued',
      runAt: { $lte: new Date() }
    }).limit(25);

    for (const schedule of due) {
      schedule.status = 'processing';
      schedule.attempts += 1;
      await schedule.save();

      const post = await Post.findById(schedule.postId);
      if (!post) {
        schedule.status = 'failed';
        schedule.lastError = 'Post not found.';
        await schedule.save();
        continue;
      }

      try {
        const result = await publishPostToPlatform(schedule.userId, post);
        post.status = 'published';
        post.publishedAt = new Date();
        post.externalPostId = result.externalPostId;
        await post.save();

        schedule.status = 'done';
        await schedule.save();
      } catch (error) {
        post.status = 'failed';
        post.errorMessage = error.message;
        await post.save();

        schedule.status = 'failed';
        schedule.lastError = error.message;
        await schedule.save();

        await Log.create({
          userId: schedule.userId,
          postId: post._id,
          level: 'error',
          action: 'scheduled_publish_failed',
          message: error.message
        });
      }
    }
  });
}
