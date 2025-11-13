// queue/bullmq.js
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

const cleanupQueue = new Queue('cleanupQueue', { connection });

module.exports = {
  cleanupQueue,
  Worker,
  connection
};
