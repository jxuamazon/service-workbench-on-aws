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

/**
 * This a sample controller, take a look at the file ./plugins/routes-plugin.js
 * for an example of how to register this controller
 */
async function configure(context) {
  const router = context.router();
  const wrap = context.wrap;
  const boom = context.boom; // eslint-disable-line no-unused-vars
  const settings = context.settings; // eslint-disable-line no-unused-vars
  const pclusterService = await context.service('pclusterService');
  const awsAccountsService = await context.service('awsAccountsService');

  //get some settings from config
  //  let settingsService = null;
  //  const container = new ServicesContainer();
  //  container.register('settings', new SettingsService());
  //  await container.initServices();
  //  settingsService = await container.find('settings');
  let plugin_config = settings.get('pluginConfig');
  let pcluster_config = null;
  if (plugin_config) {
    let pc = JSON.parse(plugin_config);
    if (pc['pcluster']) pcluster_config = pc['pcluster']
  }

  // ===============================================================
  //  GET / (mounted to /api/hello)
  // ===============================================================
  router.get(
    '/',
    wrap(async (req, res) => {
      const requestContext = res.locals.requestContext;
      const awsAccounts = await awsAccountsService.list(requestContext); //TODO: get the accountId from environment
      const accountId = pcluster_config['hpcAccountId'];
      const pcluster_hostname = pcluster_config['pclusterHostname'];
      let rawData = '';
      if (awsAccounts) {
        awsAccounts.forEach(account => {
          if (account.accountId == accountId) {
            rawData = {
              roleArn: account.roleArn,
              externalId: account.externalId,
              pclusterHostname: pcluster_hostname,
            };
          }
        });
      };

      const result = await pclusterService.getPclusterConfig(requestContext, rawData);
      res.status(200).json(result);
    }),
  );

  return router;
}

module.exports = configure;
