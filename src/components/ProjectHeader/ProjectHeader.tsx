// Copyright 2020-2022 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: Apache-2.0

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import GetEndpoint from '@components/GetEndpoint';
import { IndexerName } from '@components/IndexerDetails/IndexerName';
import UnsafeWarn from '@components/UnsafeWarn';
import { useConsumerHostServices } from '@hooks/useConsumerHostServices';
import { Manifest } from '@hooks/useGetDeploymentManifest';
import { ProjectDetailsQuery } from '@hooks/useProjectFromQuery';
import { ProjectActionArgv } from '@pages/explorer/Project/type';
import { Tag, Typography } from '@subql/components';
import { ProjectType } from '@subql/network-query';
import { useAsyncMemo } from '@subql/react-hooks';
import { bytesToGb, formatNumber, formatSQT } from '@utils';
import { Button, Tooltip } from 'antd';
import { BigNumber } from 'bignumber.js';
import clsx from 'clsx';
import dayjs from 'dayjs';

import { ETH_TYPE_DICTION, NETWORK_TYPE_DICTION } from 'src/const/const';
import { useProjectStore } from 'src/stores/project';

import Detail from '../Detail';
import { Dropdown } from '../Dropdown';
import IPFSImage from '../IPFSImage';
import styles from './ProjectHeader.module.less';

type Props = {
  project: ProjectDetailsQuery;
  versions?: Record<string, string>;
  currentVersion?: string;
  onChangeVersion?: (key: string) => void;
  isUnsafeDeployment?: boolean;
  manifest?: Manifest;
};

const ProjectHeader: React.FC<Props> = ({
  project,
  versions,
  currentVersion,
  isUnsafeDeployment,
  onChangeVersion,
  manifest,
}) => {
  const { t } = useTranslation();
  const { projectDbSize, projectInfo } = useProjectStore();
  const { getStatisticQueries } = useConsumerHostServices({ autoLogin: false });
  const [searchParams] = useSearchParams();
  const initialOpenModal = React.useMemo(() => {
    if (searchParams.get('action') === ProjectActionArgv.CREATE_PLAN) {
      return true;
    }
    return false;
  }, [searchParams]);
  const createdAtStr = React.useMemo(() => dayjs(project.createdTimestamp).utc(true).fromNow(), [project]);
  const updatedAtStr = React.useMemo(() => dayjs(project.updatedTimestamp).utc(true).fromNow(), [project]);

  const VersionDropdown = () => {
    if (!versions) return <></>;

    const menu = Object.entries(versions).map(([key, value]) => {
      const deployment = project.deployments.nodes.find((i) => i?.id === key);
      const booster =
        deployment?.deploymentBoosterSummariesByDeploymentId?.groupedAggregates?.[0]?.keys?.[0] === key
          ? deployment?.deploymentBoosterSummariesByDeploymentId?.groupedAggregates?.[0]?.sum?.totalAmount || '0'
          : '0';
      return {
        key,
        label: (
          <Typography style={{ maxWidth: 400 }} className="overflowEllipsis">{`${value} - Boost: ${formatNumber(
            formatSQT(booster),
          )}`}</Typography>
        ),
      };
    });

    const handleOnClick = (key: string) => {
      onChangeVersion?.(key);
    };

    return (
      <Dropdown
        menu={menu}
        handleOnClick={handleOnClick}
        dropdownContent={currentVersion ? versions[currentVersion] : versions[0]}
        styleProps={clsx(styles.dropdown)}
      />
    );
  };

  const networkVal = React.useMemo(() => {
    if (project.type === ProjectType.RPC && manifest?.rpcFamily) {
      return manifest?.rpcFamily[0];
    }

    const chainId =
      project.type === ProjectType.SUBQUERY ? manifest?.network?.chainId : manifest?.dataSources?.[0]?.network;
    if (!chainId) return '-';
    console.warn(chainId);
    const polkadotName = NETWORK_TYPE_DICTION[chainId];
    const ethName = ETH_TYPE_DICTION[chainId];

    return polkadotName || ethName || chainId;
  }, [project.type, manifest]);

  const dbSize = React.useMemo(() => {
    if (!currentVersion)
      return {
        average: '...',
        max: '...',
      };
    if (!projectInfo[currentVersion])
      return {
        average: '...',
        max: '...',
      };

    if (projectInfo[currentVersion].totalIndexers < 6) {
      return {
        average: `${bytesToGb(projectDbSize[currentVersion || '']?.average)} Gb` || '...',
        max: `${bytesToGb(projectDbSize[currentVersion || '']?.max)} Gb` || '...',
      };
    }

    if (projectInfo[currentVersion].totalIndexers >= 6 && projectDbSize[currentVersion || '']?.counts >= 6) {
      return {
        average: `${bytesToGb(projectDbSize[currentVersion || '']?.average)} Gb` || '...',
        max: `${bytesToGb(projectDbSize[currentVersion || '']?.max)} Gb` || '...',
      };
    }

    return {
      average: `${bytesToGb(projectDbSize[currentVersion || '']?.average)} Gb` || '...',
      max: `${bytesToGb(projectDbSize[currentVersion || '']?.max)} Gb` || '...',
    };
  }, [projectDbSize, currentVersion, projectInfo]);

  const yesterdayQueriesCount = useAsyncMemo(async () => {
    const today = dayjs();
    const yesterday = today.subtract(1, 'day');

    const res = await getStatisticQueries({
      deployment: [currentVersion || ''],
      start_date: yesterday.format('YYYY-MM-DD'),
      end_date: today.format('YYYY-MM-DD'),
    });

    if (BigNumber(res.data.total).isEqualTo(0)) {
      return '< 1,000';
    }

    return formatNumber(res.data.total, 0);
  }, [currentVersion]);

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <IPFSImage src={project.metadata.image || '/static/default.project.png'} className={styles.image} />
      </div>
      <div className={styles.inner}>
        <div className={styles.upper}>
          <div className={styles.titleVersion}>
            <Typography
              variant="h4"
              className={clsx(styles.name, 'overflowEllipsis')}
              weight={600}
              style={{ marginRight: 8, maxWidth: 500 }}
            >
              {project.metadata.name}
            </Typography>
            {isUnsafeDeployment && <UnsafeWarn></UnsafeWarn>}
            <VersionDropdown />
            <span style={{ flex: 1 }}></span>
            <div className={`flex ${styles.groupButton}`}>
              <GetEndpoint
                deploymentId={currentVersion || ''}
                project={project}
                initialOpen={initialOpenModal}
              ></GetEndpoint>
            </div>
          </div>
          <IndexerName address={project.owner} size="tiny"></IndexerName>

          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {/* in case of someone skip the legal process add more than 2 categories */}
            {project.metadata.categories &&
              project.metadata.categories.slice(0, 2).map((val) => {
                return (
                  <Button key={val} type="primary" shape="round" className={clsx('staticButton', 'overflowEllipsis')}>
                    <span className="overflowEllipsis" style={{ maxWidth: 300 }}>
                      {val}
                    </span>
                  </Button>
                );
              })}
          </div>
        </div>
        <div className={styles.lower}>
          <Detail
            label="Network"
            value={networkVal.length > 15 ? `${networkVal.slice(0, 15)}...` : networkVal}
            capitalize
          ></Detail>
          <Detail
            label="Type"
            value={
              {
                [ProjectType.RPC]: 'RPC Endpoint',
                [ProjectType.SUBQUERY]: 'Indexed Dataset',
                [ProjectType.SQ_DICT]: 'Dictionary',
                [ProjectType.SUBGRAPH]: (
                  <Tag style={{ background: '#6B46EF', color: '#fff', border: '1px solid #DFE3E880' }}>Subgraph</Tag>
                ),
              }[project.type] || ''
            }
          ></Detail>
          {currentVersion && (
            <Detail label={t('projectHeader.deploymentId')} value={currentVersion} canCopy={true} isTruncate={true} />
          )}
          <Detail label={t('projectOverview.updatedAt')} value={updatedAtStr} className={styles.column} />
          <Detail label={t('projectOverview.createdAt')} value={createdAtStr} className={styles.column} />
          {project.type === ProjectType.SUBQUERY ? (
            <Detail
              label={'DbSize'}
              value={
                <Tooltip title={`Max: ${dbSize.max}, Average: ${dbSize.average}`}>
                  <Typography>{dbSize.average}</Typography>
                </Tooltip>
              }
              className={styles.column}
            />
          ) : (
            ''
          )}
          <Detail label={'Queries (Yesterday)'} value={<Typography>{yesterdayQueriesCount.data}</Typography>}></Detail>
        </div>
      </div>
    </div>
  );
};

export default ProjectHeader;
