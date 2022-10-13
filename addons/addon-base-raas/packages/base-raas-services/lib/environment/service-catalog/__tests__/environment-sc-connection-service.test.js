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

const ServicesContainer = require('@amzn/base-services-container/lib/services-container');
const JsonSchemaValidationService = require('@amzn/base-services/lib/json-schema-validation-service');
const Logger = require('@amzn/base-services/lib/logger/logger-service');
const crypto = require('crypto');
const Boom = require('@amzn/base-services-container/lib/boom');

// Mocked dependencies
const AwsService = require('@amzn/base-services/lib/aws/aws-service');

const AWSMock = require('aws-sdk-mock');

jest.mock('@amzn/base-services/lib/lock/lock-service');
const LockServiceMock = require('@amzn/base-services/lib/lock/lock-service');

jest.mock('@amzn/base-api-services/lib/jwt-service');
const JwtService = require('@amzn/base-api-services/lib/jwt-service');

jest.mock('@amzn/key-pair-mgmt-services/lib/key-pair/key-pair-service');
const KeyPairServiceMock = require('@amzn/key-pair-mgmt-services/lib/key-pair/key-pair-service');

jest.mock('@amzn/base-services/lib/settings/env-settings-service');
const SettingsServiceMock = require('@amzn/base-services/lib/settings/env-settings-service');

jest.mock('@amzn/base-services/lib/audit/audit-writer-service');
const AuditServiceMock = require('@amzn/base-services/lib/audit/audit-writer-service');

jest.mock('@amzn/base-services/lib/plugin-registry/plugin-registry-service');
const PluginRegistryServiceMock = require('@amzn/base-services/lib/plugin-registry/plugin-registry-service');

jest.mock('../../environment-dns-service');
const EnvironmentDnsServiceMock = require('../../environment-dns-service');

jest.mock('../environment-sc-service');
const EnvironmentSCServiceMock = require('../environment-sc-service');

jest.mock('../environment-sc-keypair-service');
const EnvironmentScKeyPairServiceMock = require('../environment-sc-keypair-service');

jest.mock('node-rsa', () =>
  jest.fn(() => ({
    importKey: jest.fn(() => ({
      exportKey: jest.fn(
        // This is a random key generated for test purposes
        () => ``,
      ),
    })),
  })),
);

const EnvironmentScConnectionService = require('../environment-sc-connection-service');

describe('EnvironmentScConnectionService', () => {
  let service = null;
  let envDnsService = null;
  let jwtService = null;
  let envScService = null;
  let lockService = null;

  beforeEach(async () => {
    const container = new ServicesContainer();
    container.register('aws', new AwsService());
    container.register('jsonSchemaValidationService', new JsonSchemaValidationService());
    container.register('jwtService', new JwtService());
    container.register('log', new Logger());
    container.register('auditWriterService', new AuditServiceMock());
    container.register('pluginRegistryService', new PluginRegistryServiceMock());
    container.register('settings', new SettingsServiceMock());
    container.register('environmentDnsService', new EnvironmentDnsServiceMock());
    container.register('keyPairService', new KeyPairServiceMock());
    container.register('environmentScKeypairService', new EnvironmentScKeyPairServiceMock());
    container.register('environmentScService', new EnvironmentSCServiceMock());
    container.register('environmentScConnectionService', new EnvironmentScConnectionService());
    container.register('lockService', new LockServiceMock());
    await container.initServices();

    // suppress expected console errors
    jest.spyOn(console, 'error').mockImplementation();

    // Get instance of the service we are testing
    service = await container.find('environmentScConnectionService');

    envScService = await container.find('environmentScService');
    envScService.mustFind = jest.fn(() => {
      return { projectId: 'sampleProjectId' };
    });
    envScService.verifyAppStreamConfig = jest.fn();

    envDnsService = await container.find('environmentDnsService');
    jwtService = await container.find('jwtService');

    const aws = await service.service('aws');
    AWSMock.setSDKInstance(aws.sdk);
    lockService = await container.find('lockService');
  });

  afterEach(async () => {
    AWSMock.restore();
  });

  describe('updateRoleToIncludeCurrentIP', () => {
    it('should update successfully with new statement when existing policy has one statement', async () => {
      const connection = {
        url: 'www.example.com',
        type: 'SageMaker',
        role: 'presigned-role',
        roleArn: 'arn:aws:iam:us-west-2:111111111111:role/presigned-role',
        notebookArn: 'arn:aws:sagemaker:us-west-2:111111111111:notebook-instance/basicnotebookinstance-testnotebook',
        policy: 'presigned-url-access',
        info: 'notebook-instance-name',
      };
      const iamMock = {};
      const existingPolicy = {
        Statement: {
          Effect: 'Allow',
          Action: 'sagemaker:CreatePresignedNotebookInstanceUrl',
          Resource: connection.notebookArn,
          Condition: {
            StringEquals: {
              'aws:SourceVpce': 'vpce-12345',
            },
          },
        },
      };
      const newPolicy = {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'sagemaker:CreatePresignedNotebookInstanceUrl',
            Resource: connection.notebookArn,
            Condition: {
              StringEquals: {
                'aws:SourceVpce': 'vpce-12345',
              },
            },
          },
          {
            Effect: 'Allow',
            Action: 'sagemaker:CreatePresignedNotebookInstanceUrl',
            Resource: connection.notebookArn,
            Condition: {
              IpAddress: {
                'aws:SourceIp': expect.any(String),
              },
            },
          },
        ],
      };
      iamMock.putRolePolicy = jest.fn(() => {
        return {
          promise: () => { },
        };
      });

      // OPERATE
      await service.updateRoleToIncludeCurrentIP(iamMock, connection, {
        RoleName: 'presigned-role',
        PolicyName: 'presigned-url-access',
        PolicyDocument: JSON.stringify(existingPolicy),
      });

      // CHECK
      expect(iamMock.putRolePolicy).toHaveBeenCalledTimes(1);
      expect(iamMock.putRolePolicy.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          RoleName: 'presigned-role',
          PolicyName: 'presigned-url-access',
        }),
      );
      expect(JSON.parse(iamMock.putRolePolicy.mock.calls[0][0].PolicyDocument)).toEqual(newPolicy);
    });
  });

  describe('create private SageMaker URL', () => {
    it('should fail since connection type is not SageMaker', async () => {
      lockService.tryWriteLockAndRun = jest.fn((id, func) => {
        return func();
      });
      const connection = {
        url: 'www.example.com',
        type: 'NotSageMaker',
      };
      const requestContext = { principal: { isAdmin: true, status: 'active' } };
      try {
        // OPERATE
        await service.createPrivateSageMakerUrl(requestContext, 'envId1', connection);
      } catch (err) {
        // CHECK
        expect(err.message).toEqual('Cannot generate presigned URL for non-sagemaker connection NotSageMaker');
      }
    });

    it('should restore original policy incase of an error', async () => {
      // BUILD
      lockService.tryWriteLockAndRun = jest.fn((id, func) => {
        return func();
      });
      const connection = {
        url: 'www.example.com',
        type: 'SageMaker',
        role: 'presigned-role',
        roleArn: 'arn:aws:iam:us-west-2:111111111111:role/presigned-role',
        notebookArn: 'arn:aws:sagemaker:us-west-2:111111111111:notebook-instance/basicnotebookinstance-testnotebook',
        policy: 'presigned-url-access',
        info: 'notebook-instance-name',
      };
      const requestContext = { principal: { isAdmin: true, status: 'active' } };
      const iamMock = {};
      const stsMock = {};
      const existingPolicy = {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'sagemaker:CreatePresignedNotebookInstanceUrl',
            Resource: connection.notebookArn,
            Condition: {
              StringEquals: {
                'aws:SourceVpce': 'vpce-12345',
              },
            },
          },
        ],
      };
      const newPolicy = {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'sagemaker:CreatePresignedNotebookInstanceUrl',
            Resource: connection.notebookArn,
            Condition: {
              StringEquals: {
                'aws:SourceVpce': 'vpce-12345',
              },
            },
          },
          {
            Effect: 'Allow',
            Action: 'sagemaker:CreatePresignedNotebookInstanceUrl',
            Resource: connection.notebookArn,
            Condition: {
              IpAddress: {
                'aws:SourceIp': expect.any(String),
              },
            },
          },
        ],
      };
      iamMock.getRolePolicy = jest.fn(() => {
        return {
          promise: () => {
            return {
              RoleName: 'presigned-role',
              PolicyName: 'presigned-url-access',
              PolicyDocument: JSON.stringify(existingPolicy),
            };
          },
        };
      });
      iamMock.putRolePolicy = jest.fn(() => {
        return {
          promise: () => { },
        };
      });
      stsMock.assumeRole = jest.fn(() => {
        throw Error('Cannot assume role');
      });
      envScService.getClientSdkWithEnvMgmtRole = jest.fn((context, id, client) => {
        if (client.clientName === 'IAM') {
          return iamMock;
        }
        if (client.clientName === 'STS') {
          return stsMock;
        }
        return undefined;
      });

      // OPERATE
      try {
        // OPERATE
        await service.createPrivateSageMakerUrl(requestContext, 'envId1', connection, 1);
      } catch (err) {
        // CHECK
        expect(err.message).toEqual('Could not generate presigned URL');
      }

      // CHECK
      expect(iamMock.getRolePolicy).toHaveBeenCalledTimes(1);
      expect(iamMock.getRolePolicy).toHaveBeenCalledWith({
        RoleName: connection.role,
        PolicyName: connection.policy,
      });
      expect(iamMock.putRolePolicy).toHaveBeenCalledTimes(2);
      expect(iamMock.putRolePolicy.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          RoleName: 'presigned-role',
          PolicyName: 'presigned-url-access',
        }),
      );
      expect(iamMock.putRolePolicy.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          RoleName: 'presigned-role',
          PolicyName: 'presigned-url-access',
        }),
      );
      expect(JSON.parse(iamMock.putRolePolicy.mock.calls[0][0].PolicyDocument)).toEqual(newPolicy);
      expect(JSON.parse(iamMock.putRolePolicy.mock.calls[1][0].PolicyDocument)).toEqual(existingPolicy);
      expect(stsMock.assumeRole).toHaveBeenCalledTimes(1);
      expect(stsMock.assumeRole).toHaveBeenCalledWith({
        RoleArn: connection.roleArn,
        RoleSessionName: `create-presigned-url`,
      });
      expect(lockService.tryWriteLockAndRun).toHaveBeenCalledTimes(1);
      expect(lockService.tryWriteLockAndRun.mock.calls[0][0]).toEqual({
        id: `envId1presign`,
      });
      expect(envScService.getClientSdkWithEnvMgmtRole).toHaveBeenCalledTimes(2);
    });

    it('should return too many requests error if request cannot obtain a lock', async () => {
      // BUILD
      lockService.tryWriteLockAndRun = jest.fn(() => {
        throw service.boom.internalError('Could not obtain a lock', true);
      });

      // OPERATE, CHECK
      await expect(service.createPrivateSageMakerUrl({}, 'envId1', {})).rejects.toEqual(
        new Boom().tooManyRequests('Please wait 30 seconds before requesting Sagemaker URL', true),
      );
    });
    it('should return private SageMaker URL', async () => {
      // BUILD
      lockService.tryWriteLockAndRun = jest.fn((id, func) => {
        return func();
      });
      const connection = {
        url: 'www.example.com',
        type: 'SageMaker',
        role: 'presigned-role',
        roleArn: 'arn:aws:iam:us-west-2:111111111111:role/presigned-role',
        notebookArn: 'arn:aws:sagemaker:us-west-2:111111111111:notebook-instance/basicnotebookinstance-testnotebook',
        policy: 'presigned-url-access',
        info: 'notebook-instance-name',
      };
      const requestContext = { principal: { isAdmin: true, status: 'active' } };
      const iamMock = {};
      const stsMock = {};
      const existingPolicy = {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'sagemaker:CreatePresignedNotebookInstanceUrl',
            Resource: connection.notebookArn,
            Condition: {
              StringEquals: {
                'aws:SourceVpce': 'vpce-12345',
              },
            },
          },
        ],
      };
      const newPolicy = {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'sagemaker:CreatePresignedNotebookInstanceUrl',
            Resource: connection.notebookArn,
            Condition: {
              StringEquals: {
                'aws:SourceVpce': 'vpce-12345',
              },
            },
          },
          {
            Effect: 'Allow',
            Action: 'sagemaker:CreatePresignedNotebookInstanceUrl',
            Resource: connection.notebookArn,
            Condition: {
              IpAddress: {
                'aws:SourceIp': expect.any(String),
              },
            },
          },
        ],
      };
      iamMock.getRolePolicy = jest.fn(() => {
        return {
          promise: () => {
            return {
              RoleName: 'presigned-role',
              PolicyName: 'presigned-url-access',
              PolicyDocument: JSON.stringify(existingPolicy),
            };
          },
        };
      });
      iamMock.putRolePolicy = jest.fn(() => {
        return {
          promise: () => { },
        };
      });
      stsMock.assumeRole = jest.fn(() => {
        return {
          promise: () => {
            return {
              Credentials: {
                AccessKeyId: 'accessKeyId',
                SecretAccessKey: 'secretAccessKey',
                SessionToken: 'sessionToken',
              },
            };
          },
        };
      });
      envScService.getClientSdkWithEnvMgmtRole = jest.fn((context, id, client) => {
        if (client.clientName === 'IAM') {
          return iamMock;
        }
        if (client.clientName === 'STS') {
          return stsMock;
        }
        return undefined;
      });
      const expectedPrivateUrl = 'https://sagemaker.amazonaws.com/private';
      AWSMock.mock('SageMaker', 'createPresignedNotebookInstanceUrl', (params, callback) => {
        expect(params).toMatchObject(
          expect.objectContaining({
            NotebookInstanceName: connection.info,
          }),
        );
        callback(null, { AuthorizedUrl: expectedPrivateUrl });
      });

      // OPERATE
      const returnedPrivateUrl = await service.createPrivateSageMakerUrl(requestContext, 'envId1', connection);

      // CHECK
      expect(returnedPrivateUrl).toBe(expectedPrivateUrl);
      expect(iamMock.getRolePolicy).toHaveBeenCalledTimes(1);
      expect(iamMock.getRolePolicy).toHaveBeenCalledWith({
        RoleName: connection.role,
        PolicyName: connection.policy,
      });
      expect(iamMock.putRolePolicy).toHaveBeenCalledTimes(2);
      expect(iamMock.putRolePolicy.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          RoleName: 'presigned-role',
          PolicyName: 'presigned-url-access',
        }),
      );
      expect(iamMock.putRolePolicy.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          RoleName: 'presigned-role',
          PolicyName: 'presigned-url-access',
        }),
      );
      expect(JSON.parse(iamMock.putRolePolicy.mock.calls[0][0].PolicyDocument)).toEqual(newPolicy);
      expect(JSON.parse(iamMock.putRolePolicy.mock.calls[1][0].PolicyDocument)).toEqual(existingPolicy);
      expect(stsMock.assumeRole).toHaveBeenCalledTimes(1);
      expect(stsMock.assumeRole).toHaveBeenCalledWith({
        RoleArn: connection.roleArn,
        RoleSessionName: `create-presigned-url`,
      });
      expect(lockService.tryWriteLockAndRun).toHaveBeenCalledTimes(1);
      expect(lockService.tryWriteLockAndRun.mock.calls[0][0]).toEqual({
        id: `envId1presign`,
      });
      expect(envScService.getClientSdkWithEnvMgmtRole).toHaveBeenCalledTimes(2);
    });
  });

  describe('create connection', () => {
    it('should return connection if exists', async () => {
      // BUILD
      const connection = { url: 'www.example.com', info: 'An already existing connection' };
      service.mustFindConnection = jest.fn(() => connection);

      // OPERATE
      const retConn = await service.createConnectionUrl();

      // CHECK
      expect(retConn).toBe(connection);
    });

    it('should get RStudio connection URL for RStudio connection types', async () => {
      // BUILD
      const connection = { type: 'RStudio' };
      service.mustFindConnection = jest.fn(() => connection);
      service.getRStudioUrl = jest.fn();

      // OPERATE
      await service.createConnectionUrl();

      // CHECK
      expect(service.getRStudioUrl).toHaveBeenCalled();
    });

    it('should NOT get RStudio connection URL for non-RStudio connection types', async () => {
      // BUILD
      const connection = { type: 'nonRStudio' };
      service.mustFindConnection = jest.fn(() => connection);
      service.getRStudioUrl = jest.fn();

      // OPERATE
      await service.createConnectionUrl();

      // CHECK
      expect(service.getRStudioUrl).not.toHaveBeenCalled();
    });

    it('should get RStudio auth URL correctly', async () => {
      // BUILD
      const requestContext = 'sampleContext';
      const id = 'exampleId';
      const connection = { instanceId: 'RStudioInstanceId' };
      envDnsService.getHostname = jest.fn(() => `rstudio-${id}.example.com`);
      service.mustFindConnection = jest.fn(() => connection);
      service.getRstudioPublicKey = jest.fn(() => `0001:SAMPLEPUBLICKEY`);

      // OPERATE
      const authUrl = await service.getRStudioUrl(requestContext, id, connection);

      // CHECK
      expect(authUrl).toContain(`https://rstudio-${id}.example.com/auth-do-sign-in?v=`);
    });
  });
  describe('sendSshPublicKey ', () => {
    it('should fail invalid keyPairId', async () => {
      // BUILD
      const sshConnectionInfo = { keyPairId: '<script>', instanceOsUser: 'hacker' };

      // OPERATE and CHECK
      await expect(service.sendSshPublicKey({}, 'envId', 'connectionId', sshConnectionInfo)).rejects.toThrow(
        expect.objectContaining({ boom: true, code: 'badRequest', safe: true, message: 'Input has validation errors' }),
      );
    });
    it('should fail invalid instanceOsUser', async () => {
      // BUILD
      const sshConnectionInfo = { keyPairId: 'keyPairId', instanceOsUser: '<hacker>' };

      // OPERATE and CHECK
      await expect(service.sendSshPublicKey({}, 'envId', 'connectionId', sshConnectionInfo)).rejects.toThrow(
        expect.objectContaining({ boom: true, code: 'badRequest', safe: true, message: 'Input has validation errors' }),
      );
    });
  });

  describe('RStudio credential encryption', () => {
    it('should pass', async () => {
      // BUILD
      const connection = { type: 'RStudioV2', instanceId: 'sampleInstanceId' };
      service.mustFindConnection = jest.fn(() => connection);
      service.getRstudioPublicKey = jest.fn().mockResolvedValue('123:SAMPLEPUBLICKEYHASH');
      envDnsService.getHostname = jest.fn(() => `rstudio-${connection.instanceId}.example.com`);
      jwtService.getSecret = jest.fn(() => 'sampleSecretString');
      const credentials = `rstudio-user\nfcc91a0d7cfdef9fea2854f2b8b2c80355c391ca617e08567e6584efe6833948`;

      // This is a random key generated for test purposes
      const privateKeyBuffer = ``;

      // OPERATE
      const result = await service.createConnectionUrl();

      // CHECK
      const encodedCreds = result.url.split('?v=')[1];
      const decodedCreds = decodeURIComponent(encodedCreds);
      const credBuff = Buffer.from(decodedCreds, 'base64');
      const decryptedCreds = crypto.privateDecrypt(
        { key: privateKeyBuffer, padding: crypto.constants.RSA_PKCS1_PADDING },
        credBuff,
      );
      expect(decryptedCreds.toString('utf8')).toBe(credentials);
    });

    it('should not pass for legacy RStudio', async () => {
      // BUILD
      const connection = { type: 'RStudio', instanceId: 'sampleInstanceId' };
      service.mustFindConnection = jest.fn(() => connection);

      // OPERATE & CHECK
      await expect(service.createConnectionUrl({}, 'sampleEnvId', connection)).rejects.toThrow(
        expect.objectContaining({
          boom: true,
          code: 'badRequest',
          safe: true,
          message: 'Support for this version of RStudio has been deprecated. Please use RStudioV2 environment type',
        }),
      );
    });
  });

  describe('verifyAccess', () => {
    it('Should fail if the admin is try to access the researcher workspace', async () => {
      // Env is created by the researcher
      service._settings = {
        getBoolean: settingName => {
          if (settingName === 'restrictAdminWorkspaceConnection') {
            return true;
          }
          return undefined;
        },
      };
      const createdBy = 'u-moQvVGabqpcaypegCqwsa'; // researcher uid
      const projectId = 'Project-2';
      const requestContext = {
        principal: { isAdmin: true, status: 'active' },
        principalIdentifier: { uid: 'u-moQvVGabqpcaypegCqwso' },
      };
      try {
        await service.verifyAccess(requestContext, createdBy, projectId);
      } catch (err) {
        expect(err.message).toEqual(`You do not have access to other user's workspace`);
      }
    });

    it('Should pass if the admin is try to access his own workspace', async () => {
      // Env is created by the researcher
      service._settings = {
        getBoolean: settingName => {
          if (settingName === 'restrictAdminWorkspaceConnection') {
            return true;
          }
          return undefined;
        },
      };
      const createdBy = 'u-moQvVGabqpcaypegCqwso'; // researcher uid
      const projectId = 'Project-2';
      const requestContext = {
        principal: { isAdmin: true, status: 'active' },
        principalIdentifier: { uid: 'u-moQvVGabqpcaypegCqwso' },
      };
      try {
        await service.verifyAccess(requestContext, createdBy, projectId);
      } catch (err) {
        expect(err.message).toEqual(`You do not have access to other user's workspace`);
      }
    });

    it('Should pass if the admin is try to access the researcher workspace', async () => {
      // Env is created by the researcher
      service._settings = {
        getBoolean: settingName => {
          if (settingName === 'restrictAdminWorkspaceConnection') {
            return false;
          }
          return undefined;
        },
      };
      const createdBy = 'u-moQvVGabqpcaypegCqwsa'; // researcher uid
      const projectId = 'Project-2';
      const requestContext = {
        principal: { isAdmin: true, status: 'active' },
        principalIdentifier: { uid: 'u-moQvVGabqpcaypegCqwso' },
      };
      const status = await service.verifyAccess(requestContext, createdBy, projectId);
      expect(status).toEqual(true);
    });
  });
});
