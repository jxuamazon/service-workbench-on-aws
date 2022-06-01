/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License").
 *  You may not use this file except in compliance with the License.
 *  A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 *  or in the "license" file accompanying this file. This file is distributed
 *  on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 *  express or implied. See the License for the specific language governing
 *  permissions and limitations under the License.
 */

import _ from 'lodash';
import { types } from 'mobx-state-tree';
import { BaseStore } from '@aws-ee/base-ui/dist/models/BaseStore';

import { getPclusterConfigs, getPclusterList } from '../../helpers/api';
import { Pcluster } from './Pcluster';

// ==================================================================
// PclusterStore
// ==================================================================
const PclusterStore = BaseStore.named('PClusterStore')
  .props({
    configs: types.optional(types.array(Pcluster), []),
  })
  .actions(self => {
    // save the base implementation of cleanup
    const superCleanup = self.cleanup;
    return {
      async doLoad() {
        //        const data = await getPclusterList();
        //        console.log(data);
        const configs = await getPclusterConfigs();
        //        console.log(configs);
        self.runInAction(() => {
          // Because this is an example, it is a just quick way to replace the array, but you should
          // examine each element instead and update or insert each element so that your
          // React components would update correctly by maintaining the correct references to the model
          // objects
          self.configs.replace(configs);
        });
      },

      cleanup() {
        self.configs.clear();
        superCleanup();
      },
    };
  })
  .views(self => ({
    get empty() {
      return self.configs.length === 0;
    },

    get total() {
      return self.configs.length;
    },

    get list() {
      return _.sortBy(_.slice(self.configs), 'cluster_name');
    },
  }));

function registerContextItems(appContext) {
  appContext.pclusterStore = PclusterStore.create({}, appContext);
}

export { PclusterStore, registerContextItems };
