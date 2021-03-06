import { Request, Response, Router, NextFunction } from 'express';

import { getTotals, GetGenesisAccountsResult } from '../lib/addresses';
import {
  fetchAddress,
  fetchNames,
  fetchNamespaceNames,
} from '../lib/client/core-api';

import { namespaceAggregator } from '../lib/aggregators/namespaces';
import { blockAggregator } from '../lib/aggregators/block-v2';
import { totalNamesAggregator } from '../lib/aggregators/total-names';
import { stacksAddressAggregator } from '../lib/aggregators/stacks-address';
import { homeInfoAggregator } from '../lib/aggregators/home-info';
import { nameAggregator } from '../lib/aggregators/name';
import { btcAddressAggregator } from '../lib/aggregators/btc-address';
import { transactionAggregator } from '../lib/aggregators/transaction';
import { Json, logError } from '../lib/utils';

const respond = (dataFn: (req: Request, res?: Response) => Promise<Json> | Json) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await dataFn(req, res);
      if (!data) {
        res.status(404);
      }
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
};

const makeAPIController = (Genesis: GetGenesisAccountsResult) => {
  const APIController = Router();
  const totals = getTotals(Genesis);

  APIController.get('/accounts/global', respond(() => totals));

  APIController.get(
    '/accounts/:address',
    respond(req => Genesis.accountsByAddress[req.params.address])
  );

  APIController.get(
    '/names/:name',
    respond(req => {
      const page = parseInt(req.query.page, 0) || 0;
      return nameAggregator.fetch({name: req.params.name, historyPage: page });
    })
  );

  APIController.get(
    '/transactions/:tx',
    respond(req => {
      const normalized = req.params.tx?.trim().toLowerCase() || '';
      return transactionAggregator.fetch({hash: normalized }) 
    })
  );

  APIController.get(
    '/addresses/:address',
    respond(req => {
      const page = parseInt(req.query.page, 10) || 0;
      return btcAddressAggregator.fetch({address: req.params.address, txPage: page})
    })
  );

  APIController.get(
    '/namespaces',
    respond(() => namespaceAggregator.fetch())
  );

  APIController.get(
    '/names',
    // TODO: refactor to use pg query rather than core node API
    respond(req => fetchNames(parseInt(req.query.page, 10) || 0))
  );

  APIController.get(
    '/namespaces/:namespace',
    respond(req =>
      // TODO: refactor to use pg query rather than core node API
      fetchNamespaceNames(req.params.namespace, parseInt(req.query.page, 10) || 0)
    )
  );

  APIController.get(
    '/name-counts',
    respond(() => totalNamesAggregator.fetch())
  );

  APIController.get(
    '/stacks/addresses/:address',
    respond(async (req) => {
      let page = parseInt(req.query.page, 10);
      if (!page || !Number.isFinite(page) || page < 0) {
        page = 0;
      }
      const result = await stacksAddressAggregator.fetch({addr: req.params.address, page});
      return result
    })
  );

  APIController.get(
    '/home',
    respond(() => homeInfoAggregator.fetch())
  );

  type SearchResult = {
    type: string;
    id: string;
  } | {
    success: false;
  };

  APIController.get(
    '/search/:query',
    respond(async (req) => {
      
      // TODO: add stx-address and name IDs to search array

      const { query } = req.params;

      const getOrFail = async <T>(promise: Promise<T>) => {
        try {
          const result = await promise;
          return result;
        } catch (error) {
          return null;
        }
      };

      const blockSearch = async (hashOrHeight: string) => {
        return blockAggregator.fetch(hashOrHeight);
      };

      const searchResult = new Promise<SearchResult>((resolve, reject) => {
        Promise.all([
          getOrFail(transactionAggregator.fetch({hash: query})).then(tx => {
            if (tx) {
              resolve({
                type: 'tx',
                id: tx.txid
              });
              return true;
            }
            return null;
          }),
          getOrFail(fetchAddress(query)).then(btcAddress => {
            if (btcAddress) {
              resolve({
                type: 'btc-address',
                id: query
              });
              return true;
            }
            return null;
          }),
          getOrFail(blockSearch(query)).then(block => {
            if (block) {
              resolve({
                type: 'block',
                id: block.hash
              });
              return true;
            }
            return null;
          }),
        ]).then(results => {
          if (results.every(r => !r)) {
            reject(new Error('Failed to find match'));
          }
        })
      });

      try {
        const result = await searchResult;
        return result;
      } catch (error) {
        return {
          success: false
        };
      }

    })
  );

  return APIController;
};

export default makeAPIController;
