import moment from 'moment';
import BlueBirdPromise from 'bluebird';

import Aggregator from './aggregator';
import BlockAggregator from './block-v2';

// const { fetchBlocks } = require('../client/core-api');
import { getBlocks, Block } from '../bitcore-db/queries';

class BlocksAggregator extends Aggregator {
  static key(date: string, page: number) {
    if (!date) {
      const now = this.now();
      return `Blocks:${now}:${page}`;
    }
    return `Blocks:${date}:${page}`;
  }

  static async setter(date: string, page: number) {
    const blocks = await getBlocks(date, page);
    const concurrency = process.env.API_CONCURRENCY ? parseInt(process.env.API_CONCURRENCY, 10) : 1;
    const getBlock = (_block: Block) => new Promise(async (resolve) => {
      try {
        const blockData = await BlockAggregator.fetch(_block.hash);
        return resolve({
          ...blockData,
          _block,
        });
      } catch (error) {
        console.error(error);
        return resolve(_block);
      }
    });
    return BlueBirdPromise.map(blocks, getBlock, { concurrency });
  }

  static expiry(date: string) {
    if (!date || (date === this.now())) return 10 * 60; // 10 minutes
    return null;
  }

  static verbose(date: string, multi) {
    return !multi;
  }

  static now(): string {
    return moment()
      .utc()
      .format('YYYY-MM-DD');
  }
}

module.exports = BlocksAggregator;
export default BlocksAggregator;
