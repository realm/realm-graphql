import { expect } from 'chai';
import * as Realm from 'realm';
import { generateFakeDataRealm, Company } from './generate-fake-data';
import { GraphQLTestServer } from './GraphQLTestServer';
import { Credentials, User, RealmClient } from '../src/index';
import gql from 'graphql-tag';
import * as ws from 'ws';
import { setTimeout } from 'timers';

describe('integration test', function() {

  let testServer: GraphQLTestServer;
  let user: Realm.Sync.User;
  let testRealm: Realm;

  before(async () => {
    testServer = new GraphQLTestServer();
    await testServer.start();
    user = Realm.Sync.User.adminUser(testServer.adminToken, `http://${testServer.address}`);
    testRealm = await generateFakeDataRealm(true, `realm://${testServer.address}/test`, user);
  });

  after(async () => {
    await testServer.shutdown();
  });

  it('should have some fake data', () => {
    const numberOfCompanies = testRealm.objects('Company').length;
    expect(numberOfCompanies).to.be.above(0);
  });

  it.only('should be able to query the data', async () => {
    const credentials = Credentials.Admin(testServer.adminToken);
    const user = await User.authenticate(`http://${testServer.address}`, credentials);
    const client = await RealmClient.create({
      user: user,
      realmPath: '/test',
      webSocketImpl: ws
    });

    const result = await client.query<{companies: Company[]}>({
      query: gql`
        query {
          companies {
            companyId
            name
            address
          }
        }
      `
    });

    expect(result.data.companies.length).to.be.above(0);
    for (const company of result.data.companies) {
      expect(company.name).to.not.be.empty;
      expect(company.address).to.not.be.empty;
      expect(company.companyId).to.not.be.empty;
    }
  });
});
