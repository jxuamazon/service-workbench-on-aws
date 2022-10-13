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

/* eslint-disable no-await-in-loop */
// const _ = require('lodash');
const Service = require('@amzn/base-services-container/lib/service');
const ServicesContainer = require('@amzn/base-services-container/lib/services-container');
const SettingsService = require('@amzn/base-services/lib/settings/env-settings-service');

const { allowIfActive, allowIfAdmin } = require('@amzn/base-services/lib/authorization/authorization-utils');

const aws4 = require('aws4');
const https = require('https');
const http = require('http');

// See ../plugins/services-plugin.js for an example of how to register this service


class PclusterService extends Service {
  constructor() {
    super();
    this.dependency(['aws', 'jsonSchemaValidationService', 'authorizationService', 'auditWriterService']);

  }

  async init() {
    await super.init();
    this.aws = await this.service('aws');
    this.client = new this.aws.sdk.CloudFormation();

  }

  async getClusterInfo(cluster_name, output_key) {
    return new Promise((resolve, reject) => {
      let params = {
        StackName: cluster_name
      };
      this.client.describeStacks(params, function (err, data) {
        // ignore if the stack doesn't exist
        if (err) {
          console.log(err);
          reject(err);
        } else {
          data.Stacks[0].Outputs.forEach(element => {
            if (element['OutputKey'] == output_key) {
              resolve(element['OutputValue']);
            }
          });
        }
      });
    });
  }

  async getSlurmRestAuthHeaders(clusterName) {
    return new Promise((resolve, reject) => {
      let sm_client = new this.aws.sdk.SecretsManager();
      let params = {
        SecretId: 'slurm_token_' + clusterName
      };
      sm_client.getSecretValue(params, function (err, data) {
        console.log("------------ getSecretValue", params, data);
        if (err) {
          reject(err);
        } else {
          let token = data["SecretString"];
          let post_headers = {
            'X-SLURM-USER-NAME': 'slurm',
            'X-SLURM-USER-TOKEN': token,
            'Content-type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          };
          let get_headers = {
            'X-SLURM-USER-NAME': 'slurm',
            'X-SLURM-USER-TOKEN': token,
            'Content-type': 'application/json',
            'Accept': 'application/json'
          };
          resolve({
            get_headers,
            post_headers
          });
        }
      });
    });
  }

  async getClusterAPIEndpointInfo(ep_ip, port, path, method, headers) {
    let opts = {
      hostname: ep_ip,
      method: method,
      path: path,
      port: port,
      headers: headers,
      json: true
    };
    let result = '';

    try {
      result = await this.doRequest(opts);
    } catch (error) {
      console.log("Error getting response in getClusterAPIEndpointInfo", error);
    }

    return result.toString();
  }

  async getPclusterList(requestContext, rawData) {
    let pcluster_hostname = rawData.pclusterHostname;

    if (!pcluster_hostname) {
      console.log("Pcluster config is not set in config file");
      return
    }

    const credentials = await this.getCredentials(requestContext, rawData); //TODO: grab the API endpoint from settings
    let opts = {
      hostname: rawData.pclusterHostname,
      service: 'execute-api',
      method: 'GET',
      path: '/prod/v3/clusters',
      url: 'https://' + rawData.pclusterHostname + '/prod/v3/clusters'
    };

    console.log(' -------------- opts', opts)
    let secs = {
      secretAccessKey: credentials.secretAccessKey,
      accessKeyId: credentials.accessKeyId,
      sessionToken: credentials.sessionToken
    };
    opts = aws4.sign(opts, secs);
    let result = await this.doSSLRequest(opts);
    let r = result ? result["clusters"] : [];
    return r;
  }

  async doSSLRequest(opts) {
    return new Promise((resolve, reject) => {
      const req = https.request(opts, function (res) {
        let response_body = '';
        res.on('data', chunk => {
          response_body += chunk;
        });
        res.on('end', () => {
          resolve(JSON.parse(response_body));
        });
      });
      req.on('error', err => {
        reject(err);
      });
      req.end();
    });
  }

  doRequest(opts) {
    return new Promise((resolve, reject) => {
      let response_body = [];
      const req = http.request(opts, function (res) {
        res.on('data', chunk => {
          response_body.push(chunk);
        });
        res.on('end', () => {
          resolve(response_body.toString());
        });
      }).on('error', err => {
        // This is a workaround for the issue SLURM REST API returns - it might be returning the wrong content length
        resolve(response_body);
      });
      req.end();
    });
  }

  async getPclusterConfig(requestContext, rawData) {
    // Do your input validation here (if this method accepts input)
    // const [validationService] = await this.service(['jsonSchemaValidationService']);
    // await validationService.ensureValid(rawData, helloMessagesSchema);
    // Do your authorization checks here. For example, below is an authorization assertion
    // where the user has to be active and an admin.
    await this.assertAuthorized(requestContext, {
      action: 'getPclusterConfig',
      conditions: [allowIfActive, allowIfAdmin]
    });
    const cluster_list = await this.getPclusterList(requestContext, rawData);
    const clusters = await this.getClusters(cluster_list); // Write audit event

    await this.audit(requestContext, {
      action: 'getPclusterConfig',
      body: clusters
    });
    return clusters;
  }

  async getClusters(cluster_list) {
    let clusters = [];

    // this is for testing
    //TODO: make API calls to get he public IP
    const test_host_map = new Map();
    test_host_map.set('172.31.18.244', 'ec2-52-23-202-252.compute-1.amazonaws.com');
    test_host_map.set('172.31.18.192', 'ec2-54-211-32-148.compute-1.amazonaws.com');
    test_host_map.set('172.31.29.137', 'ec2-3-88-211-3.compute-1.amazonaws.com');

    if (cluster_list) {
      for (let i = 0; i < cluster_list.length; i++) {
        let c = cluster_list[i];
        let head_ip = await this.getClusterInfo(c.clusterName, 'HeadNodePrivateIP'); //the cluster stack only 
        //For testing 

        head_ip = test_host_map.get(head_ip);
        let partitions = {};

        try {
          let {
            get_headers,
            _
          } = await this.getSlurmRestAuthHeaders(c.clusterName);
          if (get_headers) {
            console.log(" before ---------- ", head_ip);
            let partitions_info = await this.getClusterAPIEndpointInfo(head_ip, 8082, '/slurm/v0.0.35/partitions/', 'GET', get_headers); // the return partitions json use partition name as the attribute 
            console.log(" After ---------- ", partitions_info);

            partitions = JSON.parse(partitions_info).partitions;
          }
        } catch (error) {
          console.log("Cluster ", c.clusterName, "doesn't have slurm token, it doesn't have REST API");
        }

        clusters.push({
          cluster_name: c.clusterName,
          headnode_ip: head_ip,
          cluster_status: c.clusterStatus,
          partitions: partitions
        });
      }

      ;
    }

    return clusters;
  }

  async audit(requestContext, auditEvent) {
    const auditWriterService = await this.service('auditWriterService'); // Calling "writeAndForget" instead of "write" to allow main call to continue without waiting for audit logging
    // and not fail the main call if audit writing fails for some reason
    // If the main call also needs to fail if any audit destination fails then switch to "write" method as follows
    // return auditWriterService.write(requestContext, auditEvent);

    return auditWriterService.writeAndForget(requestContext, auditEvent);
  }

  async assertAuthorized(requestContext, {
    action,
    conditions
  }, ...args) {
    const authorizationService = await this.service('authorizationService'); // The "authorizationService.assertAuthorized" below will evaluate permissions by calling the "conditions" functions first
    // It will then give a chance to all registered plugins (if any) to perform their authorization.
    // The plugins can even override the authorization decision returned by the conditions
    // See "authorizationService.authorize" method for more details
    // NOTE: if you don't want to have an extension point for this, you can remove the extensionPoint property

    await authorizationService.assertAuthorized(requestContext, {
      extensionPoint: 'sample-extension',
      action,
      conditions
    }, ...args);
  }

  async getUser(requestContext) {
    const by = _.get(requestContext, 'principalIdentifier.uid');

    const userService = await this.service('userService');
    const user = await userService.mustFindUser({
      uid: by
    });
    return user;
  }

  async getCredentials(requestContext, rawData) {
    const [aws] = await this.service(['aws']);
    const {
      roleArn: RoleArn,
      externalId: ExternalId,
    } = rawData;
    const sts = new aws.sdk.STS();
    const {
      Credentials: {
        AccessKeyId: accessKeyId,
        SecretAccessKey: secretAccessKey,
        SessionToken: sessionToken
      }
    } = await sts.assumeRole({
      RoleArn,
      RoleSessionName: `RaaS-${requestContext.principalIdentifier.uid}-OrgRole`,
      ExternalId
    }).promise();
    return {
      accessKeyId,
      secretAccessKey,
      sessionToken
    };
  }

}

;
module.exports = PclusterService;