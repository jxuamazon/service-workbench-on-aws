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

/* eslint-disable max-classes-per-file */
import _ from 'lodash';
import React from 'react';
import { decorate, computed } from 'mobx';
import { observer, inject } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import { Container, Icon, Header, Segment, Card } from 'semantic-ui-react';
import { gotoFn } from '@aws-ee/base-ui/dist/helpers/routing';
import { swallowError } from '@aws-ee/base-ui/dist/helpers/utils';
import { isStoreLoading, isStoreError, isStoreEmpty, isStoreReady } from '@aws-ee/base-ui/dist/models/BaseStore';
import BasicProgressPlaceholder from '@aws-ee/base-ui/dist/parts/helpers/BasicProgressPlaceholder';
import ErrorBox from '@aws-ee/base-ui/dist/parts/helpers/ErrorBox';
import { PclusterCard } from './PclusterCard';

// expected props
// - PclusterStore (via injection)
class PclusterPage extends React.Component {
  componentDidMount() {
    window.scrollTo(0, 0);
    const store = this.pclusterStore;
    if (!isStoreReady(store)) swallowError(store.load());
  }

  goto(pathname) {
    const goto = gotoFn(this);
    goto(pathname);
  }

  get pclusterStore() {
    return this.props.pclusterStore;
  }

  render() {
    const store = this.pclusterStore;
    if (!store) return null;

    // Render loading, error, or tab content
    let content;
    if (isStoreError(store)) {
      content = <ErrorBox error={store.error} className="mt3 mr0 ml0" />;
    } else if (isStoreLoading(store)) {
      content = <BasicProgressPlaceholder segmentCount={1} className="mt3 mr0 ml0" />;
    } else if (isStoreEmpty(store)) {
      content = this.renderEmpty();
    } else {
      content = this.renderContent();
    }

    return (
      <Container className="mt3 mb4">
        {this.renderTitle()}
        {this.renderCards()}
      </Container>
    );

  }


  renderCards() {
    const list = this.pclusterStore.list;
    return (
      <Card.Group stackable itensPerRow={3}>
        {_.map(list, Pcluster => {
          return <PclusterCard cluster={Pcluster} />;
        })}
      </Card.Group>
    )
  }



  renderContent() {
    const list = this.pclusterStore.list;
    console.log(list)
    return (
      <Segment.Group className="mt3">
        {_.map(list, (item, index) => (
          <Segment.Group horizontal>
            <Segment key={index}>{item.cluster_name}</Segment>
            <Segment key={index}>{item.headnode_ip}</Segment>
          </Segment.Group>
        ))}
      </Segment.Group>
    );
  }

  renderEmpty() {
    return (
      <Segment placeholder className="mt3">
        <Header icon className="color-grey">
          <Icon name="coffee" />
          Clusters
          <Header.Subheader>Sorry, no clusters to list</Header.Subheader>
        </Header>
      </Segment>
    );
  }

  renderTitle() {
    return (
      <div className="mb3 flex">
        <Header as="h3" className="color-grey mt1 mb0 flex-auto">
          <Icon name="amazon" className="align-top" />
          <Header.Content className="left-align">AWS ParallelClusters in SWB</Header.Content>
          <Header.Subheader className="mt2">
          </Header.Subheader>
        </Header>
      </div>
    );
  }
}

decorate(PclusterPage, {
  pclusterStore: computed,
});

export default inject('pclusterStore')(withRouter(observer(PclusterPage)));
