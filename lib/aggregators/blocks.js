const moment = require('moment');
const Promise = require('bluebird');

const Aggregator = require('./aggregator');
const BlockAggregator = require('./block');

const { fetchBlocks } = require('../client/core-api');

class BlocksAggregator extends Aggregator {
  static key(date) {
    if (!date) {
      const now = this.now();
      return `Blocks:${now}`;
    }
    return `Blocks:${date}`;
  }

  static async setter(date, multi) {
    const blocks = await fetchBlocks(date);
    let bar;
    if (multi) {
      bar = multi.newBar('downloading [:bar] :current / :total :percent :etas', { total: blocks.length });
    }
    return Promise.map(blocks,
      _block => new Promise(async (resolve) => {
        try {
          const blockData = await BlockAggregator.fetch(_block.hash, multi);
          if (bar) bar.tick();
          return resolve({
            ...blockData,
            _block,
          });
        } catch (error) {
          console.error(error);
          if (bar) bar.tick();
          return resolve(_block);
        }
      }),
      {
        concurrency: process.env.API_CONCURRENCY ? parseInt(process.env.API_CONCURRENCY, 10) : 1,
      });
  }

  static expiry(date) {
    if (!date || (date === this.now())) return 10 * 60; // 10 minutes
    return null;
  }

  static verbose(date, multi) {
    return !multi;
  }

  static now() {
    return moment()
      .utc()
      .format('YYYY-MM-DD');
  }
}

module.exports = BlocksAggregator;