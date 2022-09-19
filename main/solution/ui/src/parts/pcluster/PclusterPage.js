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
import { registerContextItems } from '../../models/pcluster/PclusterStore'
import { Pcluster } from '../../models/pcluster/Pcluster';

// expected props
// - PclusterStore (via injection)
class PclusterPage extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      dataState: "notloaded"
    };
    //    this.fetch = this.fetch.bind(this)
  }

  componentDidMount() {
    window.scrollTo(0, 0);
    this.fetch().then(data => {
      this.setState({
        pclusterStore: data,
        dataState: "loaded"
      });
    });
    //    const store = this.pclusterStore;
    //if (!isStoreReady(this.store)) {
    //      swallowError(store.load());
    //  this.store.load();
    //};
  }

  async fetch() {
    const appContext = {};
    await registerContextItems(appContext)
    const store = appContext.pclusterStore;
    await store.load();
    return store;
  }

  componentDidCatch(err, errorInfo) {
    console.log("Error caught", err, errorInfo);
  }

  goto(pathname) {
    const goto = gotoFn(this);
    goto(pathname);
  }

  get pclusterStore() {
    return this.state.pclusterStore;
  }

  render() {
    return (
      <Container key={this.state.dataState} className="mt3 mb4"  >
        {this.renderTitle()}
        {this.renderCards()}
      </Container>
    );

  }


  renderCards() {
    const store = this.state.pclusterStore;
    let plist = [];

    try {
      plist = store.list;
    } catch (err) {
      //ignore , before the store is loaded , store.list will error
    }
    return (
      <Card.Group stackable itemsPerRow={3}>
        {_.map(plist, Pcluster => {
          return <PclusterCard key={Pcluster.cluster_name} cluster={Pcluster} />;
        })}
      </Card.Group>
    )
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

//export default inject('pclusterStore')(withRouter(observer(PclusterPage)));
export default PclusterPage;
