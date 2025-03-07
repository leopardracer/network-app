// Copyright 2020-2022 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { TextInput } from '@subql/components';
import { useField } from 'formik';

import styles from './FTextInput.module.less';

const FTextInput: React.FC<
  Omit<React.ComponentProps<typeof TextInput>, 'error' | 'value' | 'onChange'> & { id: string }
> = ({ id, ...rest }) => {
  const [field, meta] = useField(id);

  return (
    <TextInput
      containerClassName={styles.textInput}
      {...field}
      {...(rest as any)}
      name={id}
      error={meta.touched && meta.error}
    />
  );
};

export default FTextInput;
