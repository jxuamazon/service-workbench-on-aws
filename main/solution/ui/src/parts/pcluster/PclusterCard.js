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
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import { Button, Card, Divider, Header, Icon, Label, Modal } from 'semantic-ui-react';
import { action, computed, decorate, observable, runInAction } from 'mobx';
import { displayError } from '@aws-ee/base-ui/dist/helpers/notification';
import { gotoFn } from '@aws-ee/base-ui/dist/helpers/routing';

class PclusterCard extends Component {

    constructor(props) {
        super(props);
        this.pcluster = this.props.cluster;
        console.log()
    }

    render() {
        const list = this.pcluster.partitions
        const isPartitionEmpty = _.isEmpty(list);

        return (
            <Card data-testid="pcluster-card" key={`pc-${this.pcluster.cluster_name}`} raised className="mb3">
                <Card.Content>
                    <Header as="h4">{this.pcluster.cluster_name}</Header>
                    <Card.Meta className="flex">
                        <Label className="ml1" size="mini" color={!isPartitionEmpty ? 'green' : 'red'}>
                            {this.pcluster.headnode_ip ? 'REST API' : 'No REST API'} </Label>
                    </Card.Meta>
                </Card.Content>
                <Card.Content extra>REST API endpoint: {this.pcluster.headnode_ip}</Card.Content>
                <Label className="ml1" size="mini"> Partitions</Label>
                {!isPartitionEmpty &&
                    _.map(list, item => (
                        <Card.Content extra>Name: {item.name}, Total nodes: {item.total_nodes}, Total cpus{item.total_cpus}</Card.Content>
                    ))}
            </Card>
        );
    }
}

export { PclusterCard };
