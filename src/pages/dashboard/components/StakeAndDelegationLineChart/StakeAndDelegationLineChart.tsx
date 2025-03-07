// Copyright 2020-2022 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from 'react';
import LineCharts, { FilterType, xAxisScalesFunc } from '@components/LineCharts';
import RpcError from '@components/RpcError';
import { useEra } from '@hooks';
import { captureMessage } from '@sentry/react';
import { Typography } from '@subql/components';
import {
  useGetEraDelegatorIndexersGraphLazyQuery,
  useGetIndexerStakesByErasLazyQuery,
  useGetIndexerStakesByIndexerLazyQuery,
} from '@subql/react-hooks';
import {
  DeepCloneAndChangeReadonlyToMutable,
  isRPCError,
  parseError,
  renderAsyncArray,
  TOKEN,
  toPercentage,
} from '@utils';
import { mergeAsync } from '@utils';
import { numToHex } from '@utils';
import { formatNumber } from '@utils/numberFormatters';
import { Skeleton } from 'antd';
import BigNumberJs from 'bignumber.js';
import dayjs from 'dayjs';
import { cloneDeep } from 'lodash-es';

import { getSplitDataByEra } from '../RewardsLineChart/RewardsLineChart';

export const StakeAndDelegationLineChart = (props: {
  account?: string;
  title?: string;
  dataDimensionsName?: string[];
  showDelegatedToOthers?: boolean;
  skeletonHeight?: number;
}) => {
  const {
    title = 'Network Staking and Delegation',
    dataDimensionsName = ['Staking', 'Delegation'],
    showDelegatedToOthers = false,
    skeletonHeight,
  } = props;

  const { currentEra } = useEra();
  const [filter, setFilter] = useState<FilterType>({ date: 'lm' });

  const [fetchStakeAndDelegation, stakeAndDelegation] = useGetIndexerStakesByErasLazyQuery();

  const [fetchStakeAndDelegationByIndexer, stakeAndDelegationByIndexer] = useGetIndexerStakesByIndexerLazyQuery();

  const [fetchDelegateToOthersQuery, delegateToOthers] = useGetEraDelegatorIndexersGraphLazyQuery();

  const [renderStakeAndDelegation, setRenderStakeAndDelegation] = useState<number[][]>([[]]);
  const [rawFetchedData, setRawFetchedData] = useState<{ one: number[]; two: number[]; total: number[] }>({
    one: [],
    two: [],
    total: [],
  });

  const stakeLineXScales = useMemo(() => {
    const getLatestXScales = (period: number, filterVal: FilterType) => {
      const defaultXScalesFunc = xAxisScalesFunc(period, currentEra.data?.estEndTime)[filterVal.date];
      const futureEraEndTime =
        (period || 0) < 86400
          ? dayjs(currentEra.data?.estEndTime).add(1, 'day')
          : dayjs(currentEra.data?.estEndTime).add(period || 0, 'seconds');
      return [...defaultXScalesFunc(), futureEraEndTime];
    };

    const xScalesVal = getLatestXScales(currentEra.data?.period || 0, filter);
    return {
      val: {
        renderData: xScalesVal.map((i) => i.format('MMM D')),
        rawData: xScalesVal,
      },
      getLatestXScales,
    };
  }, [currentEra, filter.date]);

  const fetchDelegateToOthers = async () => {
    const res = await fetchDelegateToOthersQuery({
      variables: {
        account: props.account || '',
      },
      fetchPolicy: 'no-cache',
    });

    if (res.data?.eraDelegatorIndexers?.nodes) {
      return res.data?.eraDelegatorIndexers?.nodes.map((i) => ({
        keys: [numToHex(i?.era || 0)],
        sum: {
          stake: BigNumberJs(i?.totalStake?.toString() || '0')
            .minus(i?.selfStake?.toString() || '0')
            .toString(),
        },
      }));
    }

    return [];
  };

  const fetchStakeAndDelegationByEra = async (filterVal: FilterType = filter) => {
    if (!currentEra.data) return currentEra.error;
    if (!filterVal) return;
    const { getIncludesEras, fillData } = getSplitDataByEra(currentEra.data, true);

    const { includesErasHex, allErasHex } = {
      lm: () => getIncludesEras(dayjs().subtract(31, 'day')),
      l3m: () => getIncludesEras(dayjs().subtract(90, 'day')),
      ly: () => getIncludesEras(dayjs().subtract(365, 'day')),
    }[filterVal.date]();

    const apis = props.account ? fetchStakeAndDelegationByIndexer : fetchStakeAndDelegation;

    const res = await apis({
      variables: {
        indexerId: props.account || '',
        eraIds: allErasHex,
      },
      fetchPolicy: 'no-cache',
    });

    if (!res?.data?.indexerStakes?.groupedAggregates) return;
    const delegatorToOthersData = showDelegatedToOthers ? await fetchDelegateToOthers() : [];

    const padLostEraData = (
      groupedData: {
        keys: string[] | null;
        sum: {
          delegatorStake?: string | bigint;
          indexerStake?: string | bigint;
          totalStake?: string | bigint;
          stake?: string | bigint;
        } | null;
        fixme?: true;
      }[],
    ) => {
      const copyed = cloneDeep(groupedData);

      if (copyed.some((i) => !i.keys || !i.sum)) {
        return [];
      }

      let currentSums: {
        delegatorStake?: string | bigint;
        indexerStake?: string | bigint;
        totalStake?: string | bigint;
        stake?: string | bigint;
      } = {
        delegatorStake: '0',
        indexerStake: '0',
        totalStake: '0',
        stake: '0',
      };

      includesErasHex.forEach((item) => {
        if (!copyed.find((i) => i?.keys?.[0] === item)) {
          copyed.push({
            keys: [item],
            sum: { ...currentSums },
            fixme: true,
          });
        }
      });

      return copyed
        .sort((a, b) => parseInt(a?.keys?.[0] || '0x00', 16) - parseInt(b?.keys?.[0] || '0x00', 16))
        .map((item) => {
          if (!item.fixme) {
            if (!item.sum) {
              captureMessage('fetched stake and delegation data error, please confirm.');
              return item;
            }
            currentSums = { ...item.sum };
          }
          if (item.fixme) {
            item.sum = { ...currentSums };
          }

          return item;
        })
        .slice(copyed.length - includesErasHex.length, copyed.length);
    };

    const paddedData = padLostEraData(
      DeepCloneAndChangeReadonlyToMutable(res?.data?.indexerStakes?.groupedAggregates) || [],
    );
    const paddedDelegatorToOthersData = padLostEraData(DeepCloneAndChangeReadonlyToMutable(delegatorToOthersData));

    const curry = <T extends Parameters<typeof fillData>['0']>(data: T) =>
      fillData(
        data,
        includesErasHex,
        stakeLineXScales.getLatestXScales(currentEra.data?.period || 0, filterVal).length,
        {
          fillDevDataByGetMax: true,
        },
      );

    const delegateToMe = curry(paddedData.map((i) => ({ ...i, sum: { amount: i?.sum?.delegatorStake || '0' } })));
    const IDelegateToOthers = curry(
      paddedDelegatorToOthersData.map((i) => ({
        ...i,
        sum: { amount: i?.sum?.stake || '0' },
      })),
    );
    const indexerStakes = curry(paddedData.map((i) => ({ ...i, sum: { amount: i?.sum?.indexerStake || '0' } })));

    const one = showDelegatedToOthers ? delegateToMe : indexerStakes;
    const two = showDelegatedToOthers ? IDelegateToOthers : delegateToMe;

    const total = showDelegatedToOthers
      ? one.map((cur, index) => cur + two[index])
      : curry(paddedData.map((i) => ({ ...i, sum: { amount: i?.sum?.totalStake || '0' } })));

    setRawFetchedData({
      one,
      two,
      total,
    });

    setRenderStakeAndDelegation([one, two]);
  };

  useEffect(() => {
    fetchStakeAndDelegationByEra();
  }, [currentEra.data?.index, props.account]);

  if (isRPCError(currentEra.error)) {
    return <RpcError></RpcError>;
  }

  return renderAsyncArray(
    // only display loading when the first time fetch data.
    mergeAsync(
      props.account
        ? {
            ...stakeAndDelegationByIndexer,
            loading: stakeAndDelegationByIndexer.previousData ? false : stakeAndDelegationByIndexer.loading,
          }
        : { ...stakeAndDelegation, loading: stakeAndDelegation.previousData ? false : stakeAndDelegation.loading },
      // it doesn't matter, don't use the data.
      // @typescript-eslint/ban-ts-comment
      // @ts-ignore
      showDelegatedToOthers
        ? { ...delegateToOthers, loading: delegateToOthers.previousData ? false : delegateToOthers.loading }
        : { loading: false, data: 1 },
    ),
    {
      loading: () => (
        <Skeleton
          active
          paragraph={{ rows: 8 }}
          style={{ height: skeletonHeight ? skeletonHeight : 'auto' }}
        ></Skeleton>
      ),
      error: (e) => (
        <Typography>{isRPCError(currentEra.error) ? <RpcError size="small"></RpcError> : parseError(e)}</Typography>
      ),
      empty: () => <Typography></Typography>,
      data: () => {
        return (
          <LineCharts
            value={filter}
            onChange={(val) => {
              setFilter(val);
              fetchStakeAndDelegationByEra(val);
            }}
            xAxisScales={stakeLineXScales.val}
            title={title}
            dataDimensionsName={dataDimensionsName}
            chartData={renderStakeAndDelegation}
            onTriggerTooltip={(index, curDate) => {
              return `<div class="col-flex" style="width: 340px">
          <span style="font-size:12px;">${curDate.format('MMM D, YYYY')}</span>
          <div class="flex-between" style="margin-top: 8px;">
            <span style="font-size:12px;">Total</span>
            <span style="font-size:12px;">${formatNumber(rawFetchedData.total[index])} ${TOKEN}</span>
          </div>
          <div class="flex-between" style="margin: 8px 0;">
            <span style="font-size:12px;">${dataDimensionsName[0]}</span>
            <span style="font-size:12px;">${formatNumber(rawFetchedData.one[index])} ${TOKEN} (${toPercentage(
              rawFetchedData.one[index],
              rawFetchedData.total[index],
            )})</span>
          </div>
          <div class="flex-between">
          <span style="font-size:12px;">${dataDimensionsName[1]}</span>
          <span style="font-size:12px;">${formatNumber(rawFetchedData.two[index])} ${TOKEN} (${toPercentage(
            rawFetchedData.two[index],
            rawFetchedData.total[index],
          )})</span>
        </div>
        </div>`;
            }}
          ></LineCharts>
        );
      },
    },
  );
};
