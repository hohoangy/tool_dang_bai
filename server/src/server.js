import { app } from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { startScheduler } from './jobs/scheduler.job.js';

if (env.noDb) {
  console.log('NO_DB=true: skipping database connection and scheduler.');
} else {
  await connectDb();
  startScheduler();
}

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});
