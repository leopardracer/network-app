// Copyright 2020-2022 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { AiOutlineInfoCircle } from 'react-icons/ai';
import { BsExclamationCircle } from 'react-icons/bs';
import { useNavigate, useParams } from 'react-router-dom';
import { BillingExchangeModal } from '@components/BillingTransferModal';
import { useSQToken } from '@containers';
import { SQT_TOKEN_ADDRESS, useWeb3 } from '@containers/Web3';
import { useAsyncMemo, useProjectFromQuery, useRouteQuery } from '@hooks';
import {
  IGetHostingPlans,
  IPostHostingPlansParams,
  isConsumerHostError,
  useConsumerHostServices,
} from '@hooks/useConsumerHostServices';
import { Modal, openNotification, Steps, Typography } from '@subql/components';
import { formatSQT } from '@subql/react-hooks';
import { convertStringToNumber, formatEther, TOKEN, tokenDecimals } from '@utils';
import { Button, Divider, Form, InputNumber, Tooltip } from 'antd';
import BigNumberJs from 'bignumber.js';
import { BigNumber } from 'ethers';
import { formatUnits, parseEther } from 'ethers/lib/utils';
import { t } from 'i18next';

import styles from './index.module.less';

export interface CreateHostingFlexPlanRef {
  showModal: () => void;
}

const CreateHostingFlexPlan = forwardRef<
  CreateHostingFlexPlanRef,
  {
    id?: string;
    deploymentId?: string;
    editInformation?: IGetHostingPlans;
    edit?: boolean;
    hideBoard?: boolean;
    onSubmit?: () => void;
  }
>((props, ref) => {
  const { account } = useWeb3();
  const { consumerHostBalance } = useSQToken();
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = useRouteQuery();
  const { getProjects, createHostingPlanApi, updateHostingPlanApi, getHostingPlanApi, getChannelLimit } =
    useConsumerHostServices({
      alert: true,
      autoLogin: false,
    });

  const id = useMemo(() => {
    return props.id || params.id;
  }, [params, props]);
  const deploymentId = useMemo(() => {
    return props.deploymentId || query.get('deploymentId') || undefined;
  }, [query, props]);

  const asyncProject = useProjectFromQuery(id ?? '');

  const [form] = Form.useForm<IPostHostingPlansParams>();
  const priceValue = Form.useWatch<number>('price', form);

  const [showCreateFlexPlan, setShowCreateFlexPlan] = React.useState(false);

  const [createdHostingPlan, setCreatedHostingPlan] = React.useState<IGetHostingPlans[]>([]);

  const flexPlans = useAsyncMemo(async () => {
    try {
      const res = await getProjects({
        projectId: BigNumber.from(id).toString(),
        deployment: deploymentId,
      });

      if (res.data?.indexers?.length) {
        return res.data.indexers;
      }
    } catch (e) {
      return [];
    }
  }, [id, query]);

  const estimatedChannelLimit = useAsyncMemo(async () => {
    try {
      const res = await getChannelLimit();

      if (!isConsumerHostError(res.data)) {
        return {
          channelMaxNum: res.data.channel_max_num,
          channelMinAmount: res.data.channel_min_amount,
          channelMinExpiration: res.data.channel_min_days * 3600 * 24,
        };
      }

      return {
        channelMaxNum: 15,
        channelMinAmount: 33.33333,
        channelMinExpiration: 3600 * 24 * 14,
      };
    } catch (e) {
      return {
        channelMaxNum: 15,
        channelMinAmount: 33.33333,
        channelMinExpiration: 3600 * 24 * 14,
      };
    }
  }, []);

  const matchedCount = React.useMemo(() => {
    if (!priceValue || !flexPlans.data?.length) return `Matched indexers: 0`;
    const count = flexPlans.data.filter((i) => {
      const prices1000 = convertStringToNumber(formatUnits(i.price, tokenDecimals[SQT_TOKEN_ADDRESS])) * 1000;
      return prices1000 <= priceValue;
    }).length;
    return `Matched indexers: ${count}`;
  }, [priceValue, flexPlans]);

  const haveCreatedHostingPlan = React.useMemo(() => {
    const checkHaveCreated = (hostingPlans: IGetHostingPlans[]) =>
      !!hostingPlans.find((i) => i.deployment.deployment === asyncProject.data?.deploymentId);
    return {
      haveCreated: checkHaveCreated(createdHostingPlan),
      checkHaveCreated,
    };
  }, [createdHostingPlan, asyncProject]);

  const [balance] = useMemo(() => consumerHostBalance.result.data ?? [], [consumerHostBalance.result.data]);

  const createHostingPlan = async () => {
    await form.validateFields();

    if (!props.edit) {
      if (!asyncProject.data?.deploymentId) return;
      const created = await getHostingPlans();

      if (!created) return;
      if (created && haveCreatedHostingPlan.checkHaveCreated(created)) {
        setShowCreateFlexPlan(false);
        return;
      }
    }

    const api = props.edit ? updateHostingPlanApi : createHostingPlanApi;
    const minExpiration = estimatedChannelLimit?.data?.channelMinExpiration || 3600 * 24 * 14;
    const expiration = flexPlans?.data?.sort((a, b) => b.max_time - a.max_time)[0].max_time || 0;

    const res = await api({
      ...form.getFieldsValue(),
      expiration: expiration < minExpiration ? minExpiration : expiration,
      price: parseEther(`${form.getFieldValue('price')}`)
        .div(1000)
        .toString(),

      // props.deploymentId or asyncProject.deploymentId must have one.
      deploymentId: props.deploymentId || asyncProject?.data?.deploymentId || '',

      // if is create, id is would not use.
      id: props.editInformation?.id ? `${props.editInformation?.id}` : '0',
    });

    if (res.data.id) {
      await getHostingPlans();
      openNotification({
        type: 'success',
        description: 'Create success',
      });

      setShowCreateFlexPlan(false);
    }
  };

  const getHostingPlans = async () => {
    const res = await getHostingPlanApi({
      account,
    });
    if (!isConsumerHostError(res.data)) {
      setCreatedHostingPlan(res.data);
      return res.data;
    }
  };

  useImperativeHandle(ref, () => ({
    showModal: () => {
      setShowCreateFlexPlan(true);
    },
  }));

  React.useEffect(() => {
    if (account) {
      getHostingPlans();
    }
  }, [account]);

  useEffect(() => {
    if (props.editInformation) {
      form.setFieldValue(
        'price',
        +formatSQT(
          BigNumberJs(props.editInformation.price.toString() || '0')
            .multipliedBy(1000)
            .toString(),
        ),
      );
      form.setFieldValue('maximum', props.editInformation.maximum);
    }
  }, [props.editInformation]);

  return (
    <>
      {!props.hideBoard && (
        <div className={styles.billingCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="col-flex">
              <div className="flex">
                <Typography variant="text" type="secondary">
                  {t('flexPlans.billBalance').toUpperCase()}
                </Typography>

                <Tooltip
                  overlay={t('flexPlans.billingAccountTooltip', {
                    token: TOKEN,
                  })}
                >
                  <BsExclamationCircle style={{ marginLeft: '8px', color: 'var(--sq-gray500)' }}></BsExclamationCircle>
                </Tooltip>
              </div>

              <Typography variant="h6" style={{ marginTop: '12px' }}>
                {`${formatEther(balance, 4)} ${TOKEN}`}
              </Typography>
            </div>
            <Button type="primary" shape="round" size="large" className={styles.billingButton}>
              {t('flexPlans.deposit')}
              <div style={{ opacity: 0, position: 'absolute', left: 0, top: 0 }}>
                <BillingExchangeModal action="Transfer" />
              </div>
            </Button>
          </div>
          <Divider style={{ margin: '16px 0' }}></Divider>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src="/static/thumb.svg"
              alt=""
              style={{ alignSelf: 'flex-start', height: '100%', marginRight: 8, marginTop: 3 }}
            ></img>
            <div className="col-flex">
              <Typography variant="text" weight={500}>
                {t('flexPlans.flexPlan')}
              </Typography>
              <Typography variant="text" type="secondary">
                {t('flexPlans.flexPlanDesc')}
              </Typography>
            </div>
            <span style={{ flex: 1 }}></span>
            {haveCreatedHostingPlan.haveCreated ? (
              <Typography
                style={{ color: 'var(--sq-blue600)', cursor: 'pointer' }}
                onClick={() => {
                  navigate(`/consumer/flex-plans?deploymentCid=${asyncProject.data?.deploymentId}`);
                }}
              >
                View My Flex Plan
              </Typography>
            ) : (
              <Tooltip title={formatEther(balance, 4) === '0.0' ? 'To create flex plan must deposit first.' : ''}>
                <Button
                  type="primary"
                  shape="round"
                  size="large"
                  className={styles.billingButton}
                  onClick={() => {
                    setShowCreateFlexPlan(true);
                  }}
                  disabled={formatEther(balance, 4) === '0.0'}
                >
                  {t('flexPlans.createFlexPlan')}
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      )}
      <Modal
        open={showCreateFlexPlan}
        submitText={props.edit ? 'Update' : 'Create'}
        onSubmit={async () => {
          await createHostingPlan();
          props.onSubmit?.();
        }}
        onCancel={() => {
          setShowCreateFlexPlan(false);
        }}
      >
        <div>
          <Steps
            steps={[
              {
                title: 'Create',
              },
              {
                title: 'Confirm Create',
              },
            ]}
            current={0}
          ></Steps>
          <Typography style={{ marginTop: 48 }}>
            SubQuery host will help to allocate the qualified indexers for you to ensure your query experience. After
            creating, you can check and manage your Flex Plan in ‘My Flex Plan’ page under Consumer.
          </Typography>

          <Form layout="vertical" className={styles.createFlexPlanModal} form={form}>
            <Form.Item
              label={
                <Typography style={{ marginTop: 24 }}>
                  Maximum Price
                  <AiOutlineInfoCircle
                    style={{ fontSize: 14, marginLeft: 6, color: 'var(--sq-gray500)' }}
                  ></AiOutlineInfoCircle>
                </Typography>
              }
              name="price"
              rules={[{ required: true }]}
            >
              <InputNumber placeholder="Enter price" min="1" addonAfter={TOKEN}></InputNumber>
            </Form.Item>
            <Typography variant="medium" style={{ color: 'var(--sq-gray700)' }}>
              Per 1000 requests
            </Typography>
            <Form.Item
              label={
                <Typography style={{ marginTop: 24 }}>
                  Maximum Allocated Node Operators
                  <AiOutlineInfoCircle
                    style={{ fontSize: 14, marginLeft: 6, color: 'var(--sq-gray500)' }}
                  ></AiOutlineInfoCircle>
                </Typography>
              }
              name="maximum"
              rules={[
                {
                  min: 2,
                  type: 'number',
                  required: true,
                  message: 'Please enter the maximum allocated Node Operators, minimal number is 2',
                },
                {
                  max: estimatedChannelLimit.data?.channelMaxNum,
                  type: 'number',
                  message: `The maximum number of Node Operators can not be more than ${estimatedChannelLimit.data?.channelMaxNum}`,
                },
              ]}
            >
              <InputNumber placeholder="Enter maximum allocated Node Operators" min="2"></InputNumber>
            </Form.Item>
            <Typography variant="medium" style={{ color: 'var(--sq-gray700)' }}>
              {matchedCount}
            </Typography>
          </Form>
        </div>
      </Modal>
    </>
  );
});

CreateHostingFlexPlan.displayName = 'CreateHostingFlexPlan';
export default CreateHostingFlexPlan;
