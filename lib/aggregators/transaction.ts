import { Aggregator, AggregatorSetterResult } from './aggregator';
import { HistoryRecordData, getHistoryFromTxid } from '../core-db-pg/queries';
import { btcValue, stacksValue } from '../utils';
import { DecodeTxResult, decodeTx } from '../btc-tx-decoder';
import { getTX, getLatestBlockHeight } from '../bitcore-db/queries';
import { fetchRawTxInfo } from '../client/core-api';
import { Transaction } from 'bitcoinjs-lib';
import { HistoryDataTokenTransfer } from '../core-db-pg/history-data-types';
import { getStxAddresses } from '../addresses';


export type TransactionAggregatorOpts = {
  hash: string;
};

export type TransactionAggregatorResult = DecodeTxResult & {
  feeBTC: string;
  confirmations: number;
} & Partial<HistoryRecordData & {
  senderSTX: string;
  recipientSTX: string;
  memo: string;
  /** Total Stacks transferred */
  valueStacks: string;
  valueStacksFormatted: string;
}>;


class TransactionAggregator extends Aggregator<TransactionAggregatorResult, TransactionAggregatorOpts> {

  key(args: TransactionAggregatorOpts) {
    return `Transaction:${args.hash}`;
  }

  expiry() {
    return 10 * 60; // 10 minutes
  }

  async setter({ hash }: TransactionAggregatorOpts): Promise<AggregatorSetterResult<TransactionAggregatorResult>> {
    const [tx, rawTx, latestBlockHeight, history] = await Promise.all([
      getTX(hash),
      // TODO: refactor to use bitcore/pg
      fetchRawTxInfo(hash),
      getLatestBlockHeight(),
      getHistoryFromTxid(hash)
    ]);
    const decodedTx = Transaction.fromHex(rawTx);
    const formattedTX = await decodeTx(decodedTx, tx);
    const txData = {
      ...formattedTX,
      feeBTC: btcValue(formattedTX.fee),
      confirmations: latestBlockHeight - tx.blockHeight
    };
    let result: TransactionAggregatorResult;
    if (history && history.opcode === 'TOKEN_TRANSFER') {
      const historyData = history.historyData as HistoryDataTokenTransfer;
      const stxAddresses = getStxAddresses(history);
      const valueStacks = stacksValue(historyData.token_fee);
      result = {
        ...txData,
        ...stxAddresses,
        ...history,
        memo: historyData.scratch_area
          ? Buffer.from(historyData.scratch_area, 'hex').toString()
          : null,
        valueStacks,
        valueStacksFormatted: stacksValue(historyData.token_fee, true)
      };
    } else {
      result = txData;
    }
    return {
      shouldCacheValue: true,
      value: result,
    };
  }
}

const transactionAggregator = new TransactionAggregator();
export { transactionAggregator };
