import fs from 'fs-extra';
import _ from 'lodash';
import { blockToTime } from './utils';

export const getAccounts = async () => {
  const accounts = await fs.readJson('./data/genesis.json');

  const addresses = {};
  accounts.forEach(account => {
    const { address } = account;
    if (address.length !== -1 && address.indexOf('SP00') !== 0) {
      const cumulativeVestedAtBlocks = {};
      let cumulativeVested = 0;
      Object.keys(account.vesting).forEach(block => {
        const date = blockToTime(parseInt(block, 10));
        cumulativeVested += account.vesting[block];
        cumulativeVestedAtBlocks[date] = cumulativeVested;
      });
      addresses[address] = {
        ...account,
        transferUnlockDate: blockToTime(account.lock_send),
        cumulativeVestedAtBlocks
      };
    }
  });

  return {
    accountsByAddress: addresses,
    accounts
  };
};

export const getTotals = ({ accounts }) => {
  const totals = {
    initalValue: 0,
    vestedValues: 0,
    vestedAtBlocks: {},
    transferrableAtBlocks: {},
    addressCount: accounts.length,
    cumulativeVestedAtBlocks: {}
  };

  let cumulativeVested = 0;

  accounts.forEach(account => {
    totals.initalValue += account.value;
    totals.vestedValues += account.vesting_total;
    const vestingKeys = Object.keys(account.vesting);
    vestingKeys.forEach((block, i) => {
      const date = blockToTime(parseInt(block, 0));
      totals.vestedAtBlocks[date] = totals.vestedAtBlocks[date] || 0;
      totals.transferrableAtBlocks[date] =
        totals.transferrableAtBlocks[date] || 0;
      totals.vestedAtBlocks[date] += account.vesting[block];
      if (block >= account.lock_send) {
        const previousBlock = vestingKeys[i - 1];
        if (i !== 0 && previousBlock < account.lock_send) {
          // console.log('first vesting block with transfer', i + 1, _.range(i + 1));
          // accumulate all previous blocks
          // console.log(_.range(0, i));
          const sum = (_sum, blk) => _sum + account.vesting[vestingKeys[blk]];
          totals.transferrableAtBlocks[date] = _.range(i + 1).reduce(sum, 0);
          // console.log(_.range(i + 1).reduce(sum, 0));
        } else {
          // console.log('normal vesting', block);
          totals.transferrableAtBlocks[date] += account.vesting[block];
        }
      }
    });
    const lastGrantBlock = _.last(vestingKeys);
    if (parseInt(lastGrantBlock, 10) < account.lock_send) {
      console.log(
        'last grant before lock_send',
        account.address,
        account.lock_send,
        lastGrantBlock
      );
      const date = blockToTime(account.lock_send);
      totals.transferrableAtBlocks[date] =
        totals.transferrableAtBlocks[date] || 0;
      totals.transferrableAtBlocks[date] += account.vesting_total;
    }
  });

  const blocks = Object.keys(totals.vestedAtBlocks).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  blocks.forEach(block => {
    const amount = totals.vestedAtBlocks[block];
    cumulativeVested += amount;
    totals.cumulativeVestedAtBlocks[block] = cumulativeVested;
  });

  return totals;
};